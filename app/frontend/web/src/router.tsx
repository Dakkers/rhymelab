import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { NotFoundScreen } from "./components/RouteStatus";
import { toastError } from "./lib/toast";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
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

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Please try again.";
}

/** Set `meta.hideToast` to opt a mutation out of the global error toast. */
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { hideToast?: boolean };
  }
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
