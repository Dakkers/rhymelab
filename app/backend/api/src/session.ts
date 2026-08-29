/**
 * Session helpers. Alpha is a single user behind one shared password; the
 * session is a signed, httpOnly cookie holding nothing but "authenticated" —
 * no server-side store. Swap in a real user store + password hashing when that
 * changes.
 *
 * Ported from the original TanStack Start `session.ts`; the cookie is now issued
 * by Fastify (`@fastify/cookie`) instead of `useSession`.
 */
import type { CookieSerializeOptions } from "@fastify/cookie";

const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me-0123456789";
const DEV_APP_PASSWORD = "password";

/** Cookie name + the sentinel value stored in it. */
export const COOKIE_NAME = "rhymelab_session";
export const COOKIE_VALUE = "authed";

/**
 * Stand-in owner id for every row written while the app is single-user. The
 * session carries no identity yet (see `Session` in `orpc.ts`), so per-user
 * queries scope to this constant until real accounts land — at which point
 * this goes away in favor of an id pulled from the session.
 */
export const SINGLE_USER_ID = "single-user";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/** Secret that signs the session cookie. `@fastify/cookie` is registered with it. */
export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    // Fail loudly rather than sign production cookies with the public dev
    // secret. A missing/short SESSION_SECRET is a deploy misconfiguration, not
    // something to paper over — crashing at startup surfaces it immediately.
    throw new Error(
      "[session] SESSION_SECRET is unset or shorter than 32 characters in production. " +
        "Refusing to fall back to the insecure dev secret; set SESSION_SECRET in the environment.",
    );
  }
  return DEV_SESSION_SECRET;
}

export function appPassword(): string {
  const password = process.env.APP_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV === "production") {
    // Never accept the well-known dev password ("password") in production; a
    // missing APP_PASSWORD means the deploy env is incomplete, so refuse it.
    throw new Error(
      "[session] APP_PASSWORD is unset in production. " +
        "Refusing to fall back to the well-known dev password; set APP_PASSWORD in the environment.",
    );
  }
  return DEV_APP_PASSWORD;
}

/** Options for `reply.setCookie` when issuing the session. */
export function cookieOptions(): CookieSerializeOptions {
  return {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    // localhost cross-port is same-*site*, so Lax is sent without needing Secure.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  };
}

/** Constant-time password check: compare SHA-256 digests byte-by-byte. */
export async function passwordsMatch(candidate: string, actual: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(candidate)),
    crypto.subtle.digest("SHA-256", enc.encode(actual)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i]! ^ vb[i]!;
  return diff === 0;
}
