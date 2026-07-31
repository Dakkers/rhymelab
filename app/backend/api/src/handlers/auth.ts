/**
 * Auth procedures. These are public (bare `os.*`, not `authed.*`): login sets
 * the session cookie, logout clears it, me reports whether the request carried a
 * valid one.
 */
import { os } from "../orpc";
import { appPassword, COOKIE_NAME, COOKIE_VALUE, cookieOptions, passwordsMatch } from "../session";

export const login = os.auth.login.handler(async ({ input, context }) => {
  if (!(await passwordsMatch(input.password, appPassword()))) {
    return { ok: false };
  }
  context.reply.setCookie(COOKIE_NAME, COOKIE_VALUE, cookieOptions());
  return { ok: true };
});

export const logout = os.auth.logout.handler(async ({ context }) => {
  context.reply.clearCookie(COOKIE_NAME, { path: "/" });
  return { ok: true as const };
});

export const me = os.auth.me.handler(async ({ context }) => ({ authed: context.session !== null }));
