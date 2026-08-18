import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { NotFoundScreen } from "./components/RouteStatus";
import { toastError } from "./lib/toast";

/**
 * Opt a mutation out of the global error toast by setting `meta.hideToast` on
 * its `mutationOptions` — for flows that render their own inline error, or
 * where a toast would be redundant.
 */
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { hideToast?: boolean };
  }
}

/** The user-facing line for a failed write; falls back when the error is opaque. */
function mutationErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Please try again.";
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
    // Every write in this app is a mutation over oRPC's REST protocol (POST /
    // PATCH / DELETE — reads are queries, never mutations), so a global
    // MutationCache handler is exactly "toast on a failed POST/PUT/PATCH/DELETE".
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.hideToast) return;
        toastError("Something went wrong", mutationErrorMessage(error));
      },
    }),
  });

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFoundScreen,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
