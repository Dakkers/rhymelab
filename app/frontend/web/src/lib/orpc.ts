/**
 * The oRPC client + TanStack Query utils, typed from the shared contract (never
 * from backend code). Data now flows over HTTP to the API (`@rhymelab/api`)
 * instead of through TanStack server functions.
 *
 * The link is isomorphic: in the browser it lets the browser attach the session
 * cookie (`credentials: "include"`); during SSR (inside the Cloudflare worker,
 * which has no cookie jar) it forwards the incoming request's `Cookie` header so
 * loaders authenticate. The header function is lazy so a module-level client is
 * safe — only the per-request cookie read happens per request.
 */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { contract } from "@rhymelab/api-contract";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/rpc";

const getLink = createIsomorphicFn()
  .client(
    () =>
      new RPCLink({
        url: API_URL,
        fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
      }),
  )
  .server(
    () =>
      new RPCLink({
        url: API_URL,
        // Forward ONLY the cookie — copying host/content-length/etc. onto the
        // outbound fetch would corrupt the oRPC request.
        headers: () => {
          const cookie = getRequestHeaders().get("cookie");
          return cookie ? { cookie } : {};
        },
      }),
  );

export const client: ContractRouterClient<typeof contract> = createORPCClient(getLink());

export const orpc = createTanstackQueryUtils(client);
