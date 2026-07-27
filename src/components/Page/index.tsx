import type { ReactNode } from "react";
import { Heading, Text } from "@saintly-software/baritone";

export interface PageProps {
  /** The page title, rendered as the semantic `<h1>`. */
  title: ReactNode;
  /** Optional secondary text shown directly beneath the title. */
  subtitle?: ReactNode;
  /** Optional content shown opposite the title, e.g. an action button. */
  actions?: ReactNode;
  /** The page content, rendered below the header. */
  children?: ReactNode;
}

/**
 * Page — the top-level wrapper for a route's content. Renders the title as an
 * `<h1>` (optionally with a `subtitle` and trailing `actions` in a `<header>`),
 * followed by the content below it.
 */
export function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <div style={{ padding: "2rem", maxWidth: 900, marginInline: "auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: subtitle != null ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "2rem",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Heading level={1} size="2xl">
            {title}
          </Heading>
          {subtitle != null && (
            <Text size="sm" saliency="low">
              {subtitle}
            </Text>
          )}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}
