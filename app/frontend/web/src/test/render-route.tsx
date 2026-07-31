/**
 * Mount a single app route in isolation for an integration test.
 *
 * The route's real loader runs (its data is fetched over HTTP, so MSW answers
 * it) and its real component renders inside the app's providers. The route is
 * grafted under a lightweight test root because the app's own root route renders
 * a full `<html>` document shell that can't mount inside a test container —
 * everything below the shell is the real thing.
 */

// The app's real stylesheets, in the same order `__root.tsx` links them: reset
// first, then Baritone's compiled CSS, then RhymeLab's own rules. Imported for
// their side effect (Vite injects them), so components under test look like the
// app rather than unstyled user-agent defaults.
import "#/styles/reset.css";
import "#/styles/styles.css";
import "#/styles/app.css";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link as RouterLink,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  type AnyRoute,
  type AnyRouter,
} from "@tanstack/react-router";
import { BaritoneTheme, LinkProvider } from "@saintly-software/baritone";
import { APP_FONTS, brandVars, buildAppTokens } from "#/lib/theme";

/**
 * The chrome a signed-in route renders within, minus the HTML-document shell.
 * The theme (tokens, fonts, brand vars) comes from `#/lib/theme` — the same
 * construction the app's root route uses — so components are painted exactly as
 * the app paints them. The stylesheets imported at the top of this file supply
 * the rest (`--rl-serif`, `.rl-*`, …).
 */
function TestShell({ children }: { children: ReactNode }) {
  const tokens = buildAppTokens();
  return (
    // `render` makes the theme provider itself the `.rl-body` canvas (the app
    // puts that class on `<body>`); `style` republishes the brand vars app.css
    // reads for editing/focus states.
    <BaritoneTheme
      tokens={tokens}
      scheme="light"
      fonts={APP_FONTS}
      style={brandVars(tokens)}
      render={<div className="rl-body" />}
    >
      <LinkProvider render={({ href, ...props }) => <RouterLink to={href} {...props} />}>
        {children}
      </LinkProvider>
    </BaritoneTheme>
  );
}

export interface RenderRouteOptions {
  /** Path pattern to mount the route at, e.g. `/entries/$entryId`. */
  path: string;
  /** Initial history entries; the first is the URL under test, e.g. `/entries/1`. */
  initialEntries: string[];
}

export interface RenderRouteResult extends RenderResult {
  router: AnyRouter;
  queryClient: QueryClient;
}

/**
 * `.update()`'s public type only accepts the "content" options (loader,
 * component, …), not the re-parenting keys the generated route tree passes it.
 * The generated code casts them through too — this narrow shape does the same
 * without reaching for `any`.
 */
type Reparentable = {
  update: (options: { path: string; getParentRoute: () => AnyRoute }) => AnyRoute;
};

export function renderRoute(route: AnyRoute, options: RenderRouteOptions): RenderRouteResult {
  const queryClient = new QueryClient({
    // Surface a mocked-request error immediately instead of retrying it away.
    defaultOptions: { queries: { retry: false } },
  });

  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => (
      <TestShell>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </TestShell>
    ),
  });

  // `.update()` re-parents the real route onto the test root (mutating it in
  // place, exactly as the generated route tree does), so the component's
  // `Route.useParams()` / `useSearch()` keep resolving against it.
  const child = (route as unknown as Reparentable).update({
    path: options.path,
    getParentRoute: () => rootRoute,
  });
  const routeTree = rootRoute.addChildren([child]);

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: options.initialEntries }),
    context: { queryClient },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...result, router, queryClient };
}
