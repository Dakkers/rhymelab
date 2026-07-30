import type { ReactNode } from "react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Text, type TextProps } from "@saintly-software/baritone";

/**
 * The black app bar. The brand sits left; `context` (e.g. the "Analyzing …"
 * label on the workbench) and the nav sit right. Rendered per-page rather than
 * by the layout so each page can supply its own `context`.
 *
 * The bar is the one piece of chrome Baritone's tokens don't cover — a dark strip
 * inside a light theme — so the `Text` in it is given its colour explicitly
 * rather than inheriting the ambient one.
 */
export function TopBar({ context }: { context?: ReactNode }) {
  return (
    <header className="rl-topbar">
      <RouterLink to="/library" className="rl-brand" aria-label="RhymeLab — go to library">
        <span className="rl-brand-dot" aria-hidden />
        <BrandName style={{ color: "var(--rl-topbar-ink)" }} />
        <AlphaChip
          style={{ color: "var(--rl-topbar-ink-soft)", borderColor: "rgba(245, 241, 232, 0.25)" }}
        />
      </RouterLink>

      <div className="rl-topbar-right">
        {context}
        <nav className="rl-topnav">
          <RouterLink to="/library">Library</RouterLink>
          {/* preload=false so a hover-preload of the logout route doesn't sign out. */}
          <RouterLink to="/auth/logout" preload={false}>
            Log out
          </RouterLink>
        </nav>
      </div>
    </header>
  );
}

/** The knobs the brand marks expose — the rest of their type is fixed. */
type BrandProps = Pick<TextProps, "size" | "saliency" | "style">;

/**
 * The wordmark. Also used by the landing and login pages, which sit on the cream
 * canvas and so take their colour from the theme rather than the bar.
 */
export function BrandName({ size, saliency = "high", style }: BrandProps) {
  return (
    <Text
      as="span"
      size={size}
      saliency={saliency}
      weight="superbold"
      textTransform="uppercase"
      letterSpacing="widest"
      style={style}
    >
      RhymeLab
    </Text>
  );
}

/** The bordered "Alpha" pill next to the wordmark. */
export function AlphaChip({ size = "xs", saliency, style }: BrandProps) {
  return (
    <Text
      as="span"
      size={size}
      saliency={saliency}
      weight="bold"
      textTransform="uppercase"
      className="rl-chip-beta"
      letterSpacing="widest"
      style={style}
    >
      Alpha
    </Text>
  );
}

/**
 * The "Analyzing / Editing <title>" pair the workbench and edit pages hang in the
 * bar. Kept here so the label treatment and its dark-chrome colours live in one
 * place rather than being repeated by each page that sets a context.
 */
export function TopBarContext({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="rl-topbar-context">
      <Text
        as="span"
        size="xs"
        weight="bold"
        textTransform="uppercase"
        letterSpacing="widest"
        style={{ color: "var(--rl-topbar-ink-soft)" }}
      >
        {label}
      </Text>
      <Text
        as="span"
        size="sm"
        weight="semibold"
        whiteSpace="nowrap"
        style={{ color: "var(--rl-topbar-ink)", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {value}
      </Text>
    </span>
  );
}
