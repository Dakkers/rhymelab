/**
 * Structural auth for data server fns. Import `authedFn` / `authedPostFn` here
 * instead of `createServerFn` — a data fn can't be declared without the auth
 * middleware, so it can't accidentally ship unauthenticated.
 *
 * Server-only: this pulls in `./session`, so never import it from a module the
 * client imports outside of a server-fn chain. `auth.ts` (login/logout/getAuth)
 * stays unauthed and does NOT use these.
 */
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./session";

/** Function middleware — runs for the RPC call itself, not every request. */
export const authed = createMiddleware({ type: "function" }).server(async ({ next }) => {
  await requireAuth();
  return next();
});

/** GET data fns (reads). */
export const authedFn = createServerFn().middleware([authed]);

/** POST data fns (mutations). */
export const authedPostFn = createServerFn({ method: "POST" }).middleware([authed]);
