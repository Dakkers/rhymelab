import type { ReactNode } from "react";
import { Box, Flex, Heading, Text } from "@saintly-software/baritone";

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
      {children}
    </Box>
  );
}
