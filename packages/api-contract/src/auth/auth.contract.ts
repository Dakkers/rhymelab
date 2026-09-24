/**
 * Auth procedures. Unauthenticated: `login` must work before a session exists.
 *
 * `logout` and `me` omit `.input()` rather than declaring `z.void()`: over
 * OpenAPI a bodyless request decodes to `{}`, which `z.void()` rejects.
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

/** Report whether the current request has a valid session. */
export const me = oc
  .route({ method: "GET", path: "/auth/me" })
  .output(z.object({ authed: z.boolean() }));
