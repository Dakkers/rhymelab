import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link as RouterLink,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { BaritoneTheme, LinkProvider, buildDefaultTokens } from "@saintly-software/baritone";

import { NotFound } from "../components/NotFound";
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
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  // The two families are declared once, in `app.css`, and pulled through by
  // reference so the CSS and the theme can't drift apart. `sans` is a built-in
  // token (it's what bare text uses); `serif` is ours, published as `--font-serif`
  // and selected with `<Text font="serif">` — see `src/baritone.d.ts`.
  const tokens = buildDefaultTokens("light", { fonts: { sans: "var(--rl-sans)" } });
  // Match the app's cream canvas so Baritone's neutral surfaces read as the
  // white chrome that sits on top of it.
  tokens.surface.color.neutral.low.default.bgc = "oklch(1 0 0)";
  tokens.surface.color.neutral.high.default.bgc = "oklch(1 0 0)";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>

      <BaritoneTheme
        tokens={tokens}
        scheme="light"
        fonts={{ serif: "var(--rl-serif)" }}
        render={<body className="rl-body" />}
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
