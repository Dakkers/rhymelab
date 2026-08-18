import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link as RouterLink,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { BaritoneProvider, BaritoneTheme, LinkProvider } from "@saintly-software/baritone";

import { NotFoundScreen, RouteError } from "../components/RouteStatus";
import {
  APP_FONTS,
  APP_LINE_HEIGHTS,
  APP_SIZES,
  APP_WEIGHTS,
  brandVars,
  buildAppTokens,
} from "../lib/theme";
import { toastManager } from "../lib/toast";
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
  notFoundComponent: NotFoundScreen,
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
        {/* BaritoneProvider owns the client-side toast system (Toast.Provider +
            viewport). It lives inside BaritoneTheme so the body-mounted viewport
            resolves its tokens from the theme class on <body>. The shared
            `toastManager` lets non-React code — the global mutation-error handler
            in `#/router` — fire toasts through this same viewport. */}
        <BaritoneProvider toastManager={toastManager}>
          {/* Every internal Baritone <Link href> navigates through TanStack Router;
              external / new-tab / download links stay plain anchors. */}
          <LinkProvider render={({ href, ...props }) => <RouterLink to={href} {...props} />}>
            {children}
          </LinkProvider>
        </BaritoneProvider>

        <Scripts />
      </BaritoneTheme>
    </html>
  );
}
