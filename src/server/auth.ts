/**
 * Auth server functions — the client calls these; the handlers run on the server.
 * These are deliberately unauthed (login must work before you have a session).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { appPassword, appSession, passwordsMatch } from "./session";

const loginInput = z.object({ password: z.string().min(1) });

export const login = createServerFn({ method: "POST" })
  .validator(loginInput)
  .handler(async ({ data }) => {
    if (!(await passwordsMatch(data.password, appPassword()))) {
      return { ok: false as const };
    }
    const session = await appSession();
    await session.update({ authed: true });
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await appSession();
  await session.clear();
  return { ok: true as const };
});

/** Read the current auth state — used by the `_authenticated` route guard. */
export const getAuth = createServerFn().handler(async () => {
  const session = await appSession();
  return { authed: session.data.authed === true };
});
