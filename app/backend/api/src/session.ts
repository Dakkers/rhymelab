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

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/** Secret that signs the session cookie. `@fastify/cookie` is registered with it. */
export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[session] SESSION_SECRET is unset or too short in production; using an insecure fallback.",
    );
  }
  return DEV_SESSION_SECRET;
}

export function appPassword(): string {
  return process.env.APP_PASSWORD || DEV_APP_PASSWORD;
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
