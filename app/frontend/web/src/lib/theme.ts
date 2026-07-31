/**
 * The app's Baritone theme, in one place so every mount point paints with the
 * same tokens. The document root (`routes/__root.tsx`) uses it for the real app;
 * the integration-test harness (`test/render-route.tsx`) uses it so components
 * under test look identical. Keeping it here is what stops the two from drifting.
 */
import { buildDefaultTokens } from "@saintly-software/baritone";
import type { CSSProperties } from "react";

/** #f0522e — the brand red-orange, as the hue + chroma Baritone seeds `primary` from. */
const BRAND_OKLCH = { h: 34, c: 0.2 };

/**
 * The custom serif family for `BaritoneTheme`'s `fonts` prop. It's declared once
 * in `app.css` and pulled through by reference so the CSS and the theme can't
 * drift apart; `sans` is a built-in token, `serif` is ours (published as
 * `--font-serif`, selected with `<Text font="serif">` — see `src/baritone.d.ts`).
 */
export const APP_FONTS = { serif: "var(--rl-serif)" };

/**
 * Build the app's design tokens. The `primary` seed is the brand red-orange
 * expressed as its oklch hue + chroma, which is all Baritone needs to derive the
 * whole intent ramp — fills, tints, borders, focus rings, and the three text
 * saliencies, each contrast-checked against its surface. Neutral surfaces are
 * forced to pure white so they read as the white chrome sitting on the app's
 * cream canvas.
 */
export function buildAppTokens() {
  const tokens = buildDefaultTokens("light", {
    fonts: { sans: "var(--rl-sans)" },
    intents: { primary: BRAND_OKLCH },
  });
  tokens.surface.color.neutral.low.default.bgc = "oklch(1 0 0)";
  tokens.surface.color.neutral.high.default.bgc = "oklch(1 0 0)";
  return tokens;
}

/**
 * Republish the three brand token *values* under stable CSS custom-property
 * names. `app.css` owns boxes, not colour — but a few of its state selectors (the
 * editing card, the selected word, the focus ring) are brand-coloured, and
 * vanilla-extract's token variables are build-hashed, so plain CSS can't name
 * them. These stay downstream of the seed above rather than duplicating it.
 */
export function brandVars(tokens: ReturnType<typeof buildAppTokens>): CSSProperties {
  return {
    "--rl-primary": tokens.component.color.primary.high.default.bgc,
    "--rl-primary-tint": tokens.surface.color.primary.low.default.bgc,
    "--rl-primary-focus": tokens.surface.focus.primary,
  } as CSSProperties;
}
