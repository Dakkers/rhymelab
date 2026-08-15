import { Button, Flex, Heading, Link, Text } from "@saintly-software/baritone";

export interface ErrorPageProps {
  /** Re-renders the route that threw, per TanStack Router's `errorComponent`
   *  contract. Optional so the page still renders standalone in tests. */
  reset?: () => void;
}

/**
 * ErrorPage — full-viewport fallback for a route that threw. The sibling of
 * `NotFound` (which handles "nothing matched" and "matched but the fetched
 * resource is gone"); this one is for everything else — a genuine bug, a
 * network failure, a 500 — so it stays deliberately vague and offers a retry
 * instead of guessing at the cause. Wired up from `RouteError`.
 */
export function ErrorPage({ reset }: ErrorPageProps) {
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
        Something went wrong
      </Heading>
      <Text saliency="low">An unexpected error occurred. Try again, or head back home.</Text>
      <Flex gap="3">
        {reset && (
          <Button type="button" appearance="text" onClick={reset}>
            Try again
          </Button>
        )}
        <Link href="/">Go home</Link>
      </Flex>
    </Flex>
  );
}
