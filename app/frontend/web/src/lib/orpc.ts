/**
 * The oRPC client + TanStack Query utils, typed from the shared contract (never
 * from backend code). Data flows over HTTP to the API (`@rhymelab/api`) using
 * oRPC's OpenAPI (REST) protocol — the same `.route()`-annotated contract the
 * server serves, so calls land on real verbs + paths (`GET /api/entries`, …).
 *
 * The client type is wrapped in `JsonifiedClient` because the OpenAPI protocol
 * serializes over plain JSON rather than oRPC's richer RPC envelope; for this
 * contract every field is already JSON-native (ISO-string timestamps, numbers,
 * arrays), so it's structurally identical to the bare `ContractRouterClient`.
 *
 * The link is isomorphic: in the browser it lets the browser attach the session
 * cookie (`credentials: "include"`); during SSR (inside the Cloudflare worker,
 * which has no cookie jar) it forwards the incoming request's `Cookie` header so
 * loaders authenticate. The header function is lazy so a module-level client is
 * safe — only the per-request cookie read happens per request.
 */
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { contract } from "@rhymelab/api-contract";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const getLink = createIsomorphicFn()
  .client(
    () =>
      new OpenAPILink(contract, {
        url: API_URL,
        fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
      }),
  )
  .server(
    () =>
      new OpenAPILink(contract, {
        url: API_URL,
        // Forward ONLY the cookie — copying host/content-length/etc. onto the
        // outbound fetch would corrupt the oRPC request.
        headers: () => {
          const cookie = getRequestHeaders().get("cookie");
          return cookie ? { cookie } : {};
        },
      }),
  );

export const client: JsonifiedClient<ContractRouterClient<typeof contract>> =
  createORPCClient(getLink());

export const orpc = createTanstackQueryUtils(client);
