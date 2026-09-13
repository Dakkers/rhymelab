/**
 * Auth procedures. Deliberately unauthenticated — `login` must work before a
 * session exists, and `me` reports the current session state for route guards.
 *
 * Each carries a `.route({ method, path })` so oRPC serves it over the OpenAPI
 * (REST) protocol: the server mounts an `OpenAPIHandler` under `/api`, so these
 * resolve to `POST /api/auth/login`, `POST /api/auth/logout`, and
 * `GET /api/auth/me`.
 *
 * `logout` and `me` take no input, so they omit `.input()` entirely rather than
 * declaring `z.void()`: over the OpenAPI protocol a bodyless request decodes to
 * `{}`, which `z.void()` rejects ("expected void, received object"). Leaving the
 * input unspecified is the REST-safe way to say "no input".
 */
import { oc } from "@orpc/contract";
import { z } from "zod";

export const login = oc
  .route({ method: "POST", path: "/auth/login" })
  .input(z.object({ password: z.string().min(1) }))
  .output(z.object({ ok: z.boolean() }));

export const logout = oc
  .route({ method: "POST", path: "/auth/logout" })
  .output(z.object({ ok: z.literal(true) }));

/** Read the current auth state — used by the `_authenticated` route guard. */
export const me = oc
  .route({ method: "GET", path: "/auth/me" })
  .output(z.object({ authed: z.boolean() }));
