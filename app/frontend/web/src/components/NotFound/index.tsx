import { Flex, Heading, Link, Text } from "@saintly-software/baritone";

export interface NotFoundProps {
  /** Defaults to the generic "no route matched" copy. */
  title?: string;
  /** Defaults to the generic "no route matched" copy. */
  message?: string;
}

/**
 * NotFound — full-viewport "there's nothing here" page. Wired up two ways:
 * as the root route's `notFoundComponent` (no route matched the URL, default
 * copy), and from `RouteError` for a `NOT_FOUND` oRPC error surfaced by a
 * loader (a real route matched, but the thing it fetched doesn't exist —
 * `title`/`message` overridden to say so).
 */
export function NotFound({
  title = "Page not found",
  message = "That URL doesn't match any route.",
}: NotFoundProps) {
  return (
    <Flex
      render={<main />}
      direction="column"
      align="center"
      justify="center"
      gap="3"
      style={{ minHeight: "100vh", textAlign: "center" }}
    >
      <Heading level={1} size="2xl">
        {title}
      </Heading>
      <Text saliency="low">{message}</Text>
      <Link href="/">Go home</Link>
    </Flex>
  );
}
