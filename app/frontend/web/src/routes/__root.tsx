import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link as RouterLink,
  Scripts,
  createRootRouteWithContext,
  retainSearchParams,
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
  validateSearch: (search: Record<string, unknown>): RootSearch =>
    "__mock" in search ? { __mock: String(search.__mock ?? "") } : {},
  search: { middlewares: [retainSearchParams(["__mock"])] },
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
        <BaritoneProvider toastManager={toastManager}>
          <LinkProvider render={({ href, ...props }) => <RouterLink to={href} {...props} />}>
            {children}
          </LinkProvider>
        </BaritoneProvider>

        <Scripts />
      </BaritoneTheme>
    </html>
  );
}

/** The app-wide mock switch (`?__mock`). See `#/lib/orpc` for what it flips on. */
interface RootSearch {
  __mock?: string;
}
