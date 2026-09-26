/**
 * The app's Baritone theme values. Custom names MUST also be declared in
 * `src/baritone.d.ts`.
 */
import { buildDefaultTokens } from "@saintly-software/baritone";
import type { CSSProperties } from "react";

/** #f0522e, the brand red-orange, as oklch hue + chroma. */
const BRAND_OKLCH = { h: 34, c: 0.2 };

/** Custom font families. The stacks themselves live in `app.css`. */
export const APP_FONTS = { serif: "var(--rl-serif)" };

/** Custom line heights. */
export const APP_LINE_HEIGHTS = { title: "1.04", lyric: "1.85" };

/** Custom font weights. */
export const APP_WEIGHTS = { medium: "500" };

/** Custom font sizes. */
export const APP_SIZES = { nav: "0.82rem" };

/**
 * Build the app's light-theme tokens. Neutral surfaces are pure white so they
 * stand out against the cream canvas.
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
 * Brand token values as `--rl-primary*` custom properties, for plain CSS.
 * Baritone's own token variables are build-hashed, so CSS can't name them.
 */
export function brandVars(tokens: ReturnType<typeof buildAppTokens>): CSSProperties {
  return {
    "--rl-primary": tokens.component.color.primary.high.default.bgc,
    "--rl-primary-tint": tokens.surface.color.primary.low.default.bgc,
    "--rl-primary-focus": tokens.surface.focus.primary,
  } as CSSProperties;
}
