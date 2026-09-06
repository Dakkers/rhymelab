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
