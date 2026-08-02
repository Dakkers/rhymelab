/**
 * Mount a single component in isolation for an integration test.
 *
 * Where `renderRoute` boots the router and runs a route's real loader, this is
 * for components that take their data as props (or fetch it themselves via a
 * query) — no router, no address bar. It supplies the same app theme and a
 * `QueryClient`, so a component can still `useSuspenseQuery` a mocked read and
 * re-render when a mutation invalidates it (MSW answers both, per `./setup`).
 *
 * Reuses `render-route`'s `TestThemeProvider` — importing from there also pulls
 * in that file's stylesheet side-effects, so components look like the app.
 */
import { Suspense, type ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkProvider } from "@saintly-software/baritone";
import { TestThemeProvider } from "./render-route";

export interface RenderComponentResult extends RenderResult {
  queryClient: QueryClient;
}

export function renderComponent(ui: ReactNode): RenderComponentResult {
  const queryClient = new QueryClient({
    // Surface a mocked-request error immediately instead of retrying it away.
    defaultOptions: { queries: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <TestThemeProvider>
        {/* No router here, so Baritone links resolve to plain anchors rather than
            a `RouterLink` that would need router context. */}
        <LinkProvider render={({ href, ...props }) => <a href={href} {...props} />}>
          <Suspense fallback={null}>{ui}</Suspense>
        </LinkProvider>
      </TestThemeProvider>
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}
