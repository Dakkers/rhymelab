import {
  appPassword,
  COOKIE_NAME,
  COOKIE_VALUE,
  cookieOptions,
  passwordsMatch,
} from "../../app/session";
import type { ContractImplementer } from "../../app/createOrpcRouter";

export function createAuthHandlers(os: ContractImplementer) {
  return {
    login: os.auth.login.handler(async ({ context, input }) => {
      if (!(await passwordsMatch(input.password, appPassword()))) {
        return { ok: false };
      }
      context.reply.setCookie(COOKIE_NAME, COOKIE_VALUE, cookieOptions());
      return { ok: true };
    }),
    logout: os.auth.logout.handler(async ({ context }) => {
      context.reply.clearCookie(COOKIE_NAME, { path: "/" });
      return { ok: true as const };
    }),
    me: os.auth.me.handler(async ({ context }) => {
      return { authed: context.session !== null };
    }),
  };
}
