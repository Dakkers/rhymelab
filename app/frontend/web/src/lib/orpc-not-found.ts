/**
 * Await `promise`, rethrowing an oRPC `NOT_FOUND` as the router's `notFound()`.
 * Loaders SHOULD wrap single-resource fetches in this.
 *
 * SSR hydration serializes thrown errors to `{ name, message }`
 * (`defaultSerializeError` in `@tanstack/router-core`), so an `ORPCError`'s
 * `code` is lost on a full page load and it renders as a generic error.
 * `notFound()` survives.
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
