import type { ReactNode } from "react";
import { Box, Flex, Heading, Text } from "@saintly-software/baritone";
import "./index.css";

/**
 * Page — the top-level wrapper for a route's content. Renders the title as an
 * `<h1>` (optionally with a `subtitle` and trailing `actions` in a `<header>`),
 * followed by the content below it, with an optional `sidebar` in the left margin, so the content stays aligned with the title.
 */
export function Page({ title, subtitle, actions, sidebar, children }: PageProps) {
  return (
    <Box p="8" mx="auto" style={{ maxWidth: 900 }}>
      <Flex
        render={<header />}
        align={subtitle != null ? "start" : "center"}
        justify="between"
        gap="3"
        mb="8"
      >
        <div style={{ minWidth: 0 }}>
          <Heading level={1} size="2xl" font="serif" lineHeight="title">
            {title}
          </Heading>
          {subtitle != null && (
            <Text size="sm" saliency="low">
              {subtitle}
            </Text>
          )}
        </div>
        {actions}
      </Flex>
      <div className="rl-page-body">
        {sidebar != null && (
          <aside className="rl-page-sidebar">
            <div className="rl-page-sidebar-inner">{sidebar}</div>
          </aside>
        )}
        {children}
      </div>
    </Box>
  );
}

export interface PageProps {
  /** The page title, rendered as the semantic `<h1>`. */
  title: ReactNode;
  /** Optional secondary text shown directly beneath the title. */
  subtitle?: ReactNode;
  /** Optional content shown opposite the title, e.g. an action button. */
  actions?: ReactNode;
  /** Optional content hanging in the left margin beside the content, kept in view while scrolling. It stacks above the content on narrow screens. */
  sidebar?: ReactNode;
  /** The page content, rendered below the header. */
  children?: ReactNode;
}
