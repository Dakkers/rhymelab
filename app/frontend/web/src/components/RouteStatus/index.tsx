/**
 * The screens the *router* renders when a route can't show its content —
 * a URL that matches nothing, a loader that threw. They're grouped here, and
 * named `*Screen`, because they're a different category from the rest of
 * `components/`: each one occupies the whole viewport and owns the page's
 * `<main>`, so they're terminal states rather than pieces you compose into a
 * page. Nesting one inside a route that already renders `<main>` (the
 * convention here — see `routes/index.tsx`, `auth/login`) would produce two
 * `<main>` landmarks. Only the router should mount these.
 */
import { Button, Flex, Heading, Link, Text } from "@saintly-software/baritone";
import { ORPCError } from "@orpc/client";
import type { ErrorComponentProps } from "@tanstack/react-router";

/**
 * The root route's `errorComponent`. Loaders should route a "this specific
 * thing is missing" outcome through `#/lib/orpc-not-found` rather than letting
 * the raw error land here — that's the path that works on a full page load
 * too. This still checks for an `ORPCError` with `code: "NOT_FOUND"` as a
 * backstop for anywhere that doesn't (on a client-side navigation the error
 * keeps its real shape, so the check does fire), so a loader that skips the
 * helper degrades to the not-found screen rather than the scary one.
 * Everything else falls through to `ErrorScreen`.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  if (error instanceof ORPCError && error.code === "NOT_FOUND") {
    return <NotFoundScreen />;
  }

  return <ErrorScreen reset={reset} />;
}

/**
 * "There's nothing here." Serves both not-found cases — a URL that matched no
 * route, and a URL that matched fine whose underlying row is gone (see
 * `#/lib/orpc-not-found`).
 *
 * The copy is deliberately neutral between the two. It'd read better to say
 * "that URL doesn't match any route" for the first and "that item doesn't
 * exist" for the second, but the router can't reliably tell this component
 * which it is: a not-found raised from a loader reaches it through a branch
 * that renders it with *no props at all* (`renderRouteNotFound(router, route,
 * undefined)` in `Match.tsx`), so a `notFound({ data })` payload doesn't
 * survive the trip. One honest message beats a confidently wrong one — saying
 * "that URL doesn't match any route" about a valid URL whose entry was deleted
 * sends the reader off checking their address bar for nothing.
 */
export function NotFoundScreen() {
  return (
    <StatusScreen
      title="Not found"
      message="We couldn't find what you were looking for. It may have been moved or deleted."
    />
  );
}

/**
 * The fallback for a genuine failure — a bug, a network error, a 500. Stays
 * deliberately vague rather than guessing at the cause, and offers a retry.
 */
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

/**
 * The shared shell, deliberately not exported: one definition of the
 * full-viewport `<main>` so the screens below can't drift apart.
 */
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
  /** Re-renders the route that threw, per TanStack Router's `errorComponent`
   *  contract. Optional so the screen still renders standalone in tests. */
  reset?: () => void;
}
