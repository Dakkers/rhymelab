import { ORPCError } from "@orpc/client";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { ErrorPage } from "#/components/ErrorPage";
import { NotFound } from "#/components/NotFound";

/**
 * RouteError — the root route's `errorComponent`. Loaders should route a
 * "this specific thing is missing" outcome through `#/lib/orpc-not-found`
 * (`notFound()`) rather than letting the raw error land here — that's the
 * reliable path, including on a full-page load. This still checks for an
 * `ORPCError` with `code: "NOT_FOUND"` as a fallback for anywhere that isn't
 * (a client-side navigation keeps the real error shape, so the check does
 * work there), so a loader that skips the helper still degrades to the
 * friendly copy instead of the scary one. Everything else — a real bug, a
 * network failure, a 500 — falls through to `ErrorPage`.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  if (error instanceof ORPCError && error.code === "NOT_FOUND") {
    return (
      <NotFound
        title="Not found"
        message="That item doesn't exist, or you don't have access to it."
      />
    );
  }

  return <ErrorPage reset={reset} />;
}
