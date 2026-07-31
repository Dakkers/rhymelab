import { Flex, Heading, Link, Text } from "@saintly-software/baritone";

/**
 * NotFound — the fallback shown when no route matches the current URL.
 */
export function NotFound() {
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
        Page not found
      </Heading>
      <Text saliency="low">That URL doesn't match any route.</Text>
      <Link href="/">Go home</Link>
    </Flex>
  );
}
