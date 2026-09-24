/**
 * Full-viewport screens the router renders when a route can't show its
 * content. Each renders its own `<main>`, so only the router SHOULD mount
 * them; inside a route that already has one, they'd duplicate the landmark.
 */
import { Button, Flex, Heading, Link, Text } from "@saintly-software/baritone";
import { ORPCError } from "@orpc/client";
import type { ErrorComponentProps } from "@tanstack/react-router";

/**
 * Render a thrown route error: the not-found screen for an oRPC `NOT_FOUND`,
 * otherwise the generic error screen.
 *
 * The `NOT_FOUND` check only works on client-side navigation; loaders SHOULD
 * use `#/lib/orpc-not-found` instead (see there for why).
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  if (error instanceof ORPCError && error.code === "NOT_FOUND") {
    return <NotFoundScreen />;
  }

  return <ErrorScreen reset={reset} />;
}

/**
 * The not-found screen, for both an unmatched URL and a missing resource.
 *
 * The copy doesn't say which, because it can't know: the router renders a
 * loader's `notFound()` with no props (`renderRouteNotFound(router, route,
 * undefined)` in `Match.tsx`), so `notFound({ data })` never arrives.
 */
export function NotFoundScreen() {
  return (
    <StatusScreen
      title="Not found"
      message="We couldn't find what you were looking for. It may have been moved or deleted."
    />
  );
}

/** The generic error screen, with a retry button when `reset` is given. */
export function ErrorScreen({ reset }: ErrorScreenProps) {
  return (
    <StatusScreen
      title="Something went wrong"
      message="An unexpected error occurred. Try again, or head back home."
      action={
        reset && (
          <Button type="button" appearance="text" onClick={reset}>
            Try again
          </Button>
        )
      }
    />
  );
}

function StatusScreen({ title, message, action }: StatusScreenProps) {
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
      <Flex gap="3">
        {action}
        <Link href="/">Go home</Link>
      </Flex>
    </Flex>
  );
}

interface StatusScreenProps {
  title: string;
  message: string;
  /** Rendered next to the "Go home" link, e.g. a retry button. */
  action?: React.ReactNode;
}

export interface ErrorScreenProps {
  /** Re-render the route that threw. */
  reset?: () => void;
}
