import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link as RouterLink,
  Scripts,
  createRootRouteWithContext,
  retainSearchParams,
} from "@tanstack/react-router";
import { BaritoneTheme, LinkProvider } from "@saintly-software/baritone";

import { NotFoundScreen, RouteError } from "../components/RouteStatus";
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

/** The app-wide mock switch (`?__mock`). See `#/lib/orpc` for what it flips on. */
interface RootSearch {
  __mock?: string;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // `__mock` is a global, sticky query param. Declaring it here and retaining it
  // in every navigation and redirect makes it ride along for the whole session:
  // add `?__mock` once and it survives the signed-out → login bounce and every
  // client navigation, so the mock stays on until a full reload without it.
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
