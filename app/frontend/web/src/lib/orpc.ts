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
 *
 * Mock mode: append `?__mock` to any URL and every API call is answered by the
 * in-memory mock API (`#/mocks`) instead of the real backend — no server needed.
 * In the browser that's a real MSW Service Worker intercepting the fetch; during
 * SSR (where MSW can't run in the Cloudflare Worker runtime) the same handler is
 * invoked in-process. Either way the mock code is loaded lazily — behind a
 * dynamic `import()` gated on the flag — so it never ships in a normal page load.
 */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import type { contract } from "@rhymelab/api-contract";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/rpc";

/** The global mock switch (`?__mock`). See the module header. */
const MOCK_PARAM = "__mock";

/** Is `?__mock` set on the request currently being server-rendered? */
function serverMockEnabled(): boolean {
  try {
    return getRequestUrl().searchParams.has(MOCK_PARAM);
  } catch {
    // Outside a request context (shouldn't happen for a link fetch) — treat as off.
    return false;
  }
}

const getLink = createIsomorphicFn()
  .client(() => {
    // Captured once, at hydration, off the URL the app booted on — so the mock
    // stays on for the whole session even as later navigations drop the param.
    const mockEnabled =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has(MOCK_PARAM);

    return new RPCLink({
      url: API_URL,
      fetch: async (request, init) => {
        // Register MSW before the first mocked fetch; the Service Worker then
        // intercepts this call — and every later one — in the page itself.
        if (mockEnabled) {
          const { startMockWorker } = await import("#/mocks/browser");
          await startMockWorker();
        }
        return globalThis.fetch(request, { ...init, credentials: "include" });
      },
    });
  })
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
        fetch: async (request, init) => {
          // MSW can't run in the Cloudflare Worker SSR runtime, so mock mode is
          // served in-process here — the same handler the browser worker wraps,
          // answering the request without touching the network.
          if (serverMockEnabled()) {
            const { dispatchMock } = await import("#/mocks/router");
            const response = await dispatchMock(
              request instanceof Request ? request : new Request(request, init),
            );
            if (response) return response;
          }
          return globalThis.fetch(request, init);
        },
      }),
  );

export const client: ContractRouterClient<typeof contract> = createORPCClient(getLink());

export const orpc = createTanstackQueryUtils(client);
