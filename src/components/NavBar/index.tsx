import { Link as RouterLink } from "@tanstack/react-router";
import { Text, type TextProps } from "@saintly-software/baritone";

/**
 * The black app bar. The brand sits left; the nav sits right. Rendered once by the
 * `_authenticated` layout, so it appears on every signed-in page and carries no
 * page-specific content.
 *
 * The bar is the one piece of chrome Baritone's tokens don't cover — a dark strip
 * inside a light theme — so the `Text` in it is given its colour explicitly
 * rather than inheriting the ambient one.
 */
export function NavBar() {
  return (
    <header className="rl-navbar">
      <RouterLink to="/library" className="rl-brand" aria-label="RhymeLab — go to library">
        <span className="rl-brand-dot" aria-hidden />
        <BrandName style={{ color: "var(--rl-navbar-ink)" }} />
        <AlphaChip
          style={{ color: "var(--rl-navbar-ink-soft)", borderColor: "rgba(245, 241, 232, 0.25)" }}
        />
      </RouterLink>

      <nav className="rl-nav">
        <RouterLink to="/library">Library</RouterLink>
        {/* preload=false so a hover-preload of the logout route doesn't sign out. */}
        <RouterLink to="/auth/logout" preload={false}>
          Log out
        </RouterLink>
      </nav>
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
