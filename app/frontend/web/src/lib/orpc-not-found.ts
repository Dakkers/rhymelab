/**
 * Turns an oRPC `NOT_FOUND` into the router's own `notFound()` inside a
 * loader — e.g. `loader: ({ params, context }) => orNotFound(context.queryClient
 * .ensureQueryData(orpc.entries.get.queryOptions({ input: { id: params.entryId } })))`.
 *
 * Why bother, instead of letting the `ORPCError` propagate to the root's
 * `errorComponent`: TanStack Router's SSR hydration only round-trips a plain
 * `{ name, message }` for a *thrown* error (`defaultSerializeError` in
 * `@tanstack/router-core`) — a direct navigation or full-page reload loses the
 * `ORPCError` shape entirely, so `error.code` isn't there to check by the time
 * the client re-renders. `notFound()` doesn't have that problem; it's the
 * router's own first-class "no data here" signal; the root's already-wired
 * `notFoundComponent` renders reliably for it either way. Route through this
 * whenever a loader fetches a single resource by id.
 */
import { notFound } from "@tanstack/react-router";
import { ORPCError } from "@orpc/client";

export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      throw notFound();
    }
    throw error;
  }
}
