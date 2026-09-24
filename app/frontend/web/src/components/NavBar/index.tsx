import type { ReactNode } from "react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Menu, Text, type TextProps } from "@saintly-software/baritone";

/**
 * The app bar: brand on the left, account nav on the right.
 *
 * Baritone's light-theme tokens don't cover this dark strip, so its `Text`
 * gets colour explicitly.
 */
export function NavBar() {
  return (
    <header className="rl-navbar">
      <RouterLink to="/library" className="rl-brand" aria-label="RhymeLab — go home">
        <span className="rl-brand-dot" aria-hidden />
        <BrandName style={{ color: "var(--rl-navbar-ink)" }} />
        <AlphaChip
          style={{ color: "var(--rl-navbar-ink-soft)", borderColor: "rgba(245, 241, 232, 0.25)" }}
        />
      </RouterLink>

      <nav className="rl-nav">
        <Menu
          modal={false}
          trigger={
            <Menu.Trigger
              openOnHover
              render={
                <button type="button">
                  <NavLabel>Account</NavLabel>
                </button>
              }
            />
          }
          items={[
            <Menu.Item key="settings" render={<RouterLink to="/account/settings" />}>
              Settings
            </Menu.Item>,
            <Menu.Item key="profile" render={<RouterLink to="/account/profile" />}>
              Profile
            </Menu.Item>,
          ]}
        />
        <RouterLink to="/auth/logout" preload={false}>
          <NavLabel>Log out</NavLabel>
        </RouterLink>
      </nav>
    </header>
  );
}

/** The RhymeLab wordmark. Takes the theme's colour unless `style` overrides it. */
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

/** A nav link label. Inherits the link's colour; see {@link NavBar}. */
function NavLabel({ children }: { children: ReactNode }) {
  return (
    <Text as="span" size="nav" weight="medium" style={{ color: "inherit" }}>
      {children}
    </Text>
  );
}

type BrandProps = Pick<TextProps, "size" | "saliency" | "style">;
