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

/** #f0522e — the brand red-orange, as the hue + chroma Baritone seeds `primary` from. */
const BRAND_OKLCH = { h: 34, c: 0.2 };

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
  //
  // The `primary` seed is the brand red-orange (`--rl-brand`, #f0522e) expressed
  // as its oklch hue + chroma, which is all Baritone needs to derive the whole
  // intent ramp — bold fills, tints, borders, focus rings, and the three text
  // saliencies, each contrast-checked against its surface. Anything brand-coloured
  // should therefore ask for `intent="primary"` rather than reaching for the hex.
  const tokens = buildDefaultTokens("light", {
    fonts: { sans: "var(--rl-sans)" },
    intents: { primary: BRAND_OKLCH },
  });
  // Match the app's cream canvas so Baritone's neutral surfaces read as the
  // white chrome that sits on top of it.
  tokens.surface.color.neutral.low.default.bgc = "oklch(1 0 0)";
  tokens.surface.color.neutral.high.default.bgc = "oklch(1 0 0)";

  // `app.css` owns boxes, not colour — but a few of its state selectors (the
  // editing card, the selected word) are brand-coloured, and vanilla-extract's
  // token variables are build-hashed, so plain CSS can't name them. Republish the
  // three it needs under stable names. These are token *values*, so the CSS stays
  // downstream of the seed above instead of duplicating it.
  const brandVars = {
    "--rl-primary": tokens.component.color.primary.high.default.bgc,
    "--rl-primary-tint": tokens.surface.color.primary.low.default.bgc,
    "--rl-primary-focus": tokens.surface.focus.primary,
  } as React.CSSProperties;

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
        style={brandVars}
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
