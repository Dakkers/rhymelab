import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link as RouterLink,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { BaritoneTheme, LinkProvider } from "@saintly-software/baritone";

import { NotFound } from "../components/NotFound";
import { RouteError } from "../components/RouteError";
import {
  APP_FONTS,
  APP_LINE_HEIGHTS,
  APP_SIZES,
  APP_WEIGHTS,
  brandVars,
  buildAppTokens,
} from "../lib/theme";
import resetCss from "../styles/reset.css?url";
import baritoneCss from "../styles/styles.css?url";
import appCss from "../styles/app.css?url";

const APP_NAME = "RhymeLab";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "A workbench for annotating songs and poems." },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: resetCss },
      { rel: "stylesheet", href: baritoneCss },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  // Wrapped rather than passed directly — see the matching comment in
  // `router.tsx` on why `NotFound` can't be a `notFoundComponent` as-is.
  notFoundComponent: () => <NotFound />,
  errorComponent: RouteError,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  // Theme construction lives in `#/lib/theme` so the integration-test harness
  // paints components with these exact tokens (see `test/render-route.tsx`).
  const tokens = buildAppTokens();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>

      <BaritoneTheme
        tokens={tokens}
        scheme="light"
        fonts={APP_FONTS}
        lineHeights={APP_LINE_HEIGHTS}
        weights={APP_WEIGHTS}
        sizes={APP_SIZES}
        render={<body className="rl-body" />}
        style={brandVars(tokens)}
      >
        {/* Every internal Baritone <Link href> navigates through TanStack Router;
            external / new-tab / download links stay plain anchors. */}
        <LinkProvider render={({ href, ...props }) => <RouterLink to={href} {...props} />}>
          {children}
        </LinkProvider>

        <Scripts />
      </BaritoneTheme>
    </html>
  );
}
