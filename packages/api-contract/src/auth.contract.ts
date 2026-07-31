/**
 * Auth procedures. Deliberately unauthenticated — `login` must work before a
 * session exists, and `me` reports the current session state for route guards.
 */
import { oc } from "@orpc/contract";
import { z } from "zod";

export const login = oc
  .input(z.object({ password: z.string().min(1) }))
  .output(z.object({ ok: z.boolean() }));

export const logout = oc.input(z.void()).output(z.object({ ok: z.literal(true) }));

/** Read the current auth state — used by the `_authenticated` route guard. */
export const me = oc.input(z.void()).output(z.object({ authed: z.boolean() }));
