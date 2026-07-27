/**
 * Server-only session helpers. Import these ONLY from inside server-function
 * handlers (or a route `beforeLoad`, which runs on the server for the initial
 * request) — never from a module that reaches the client bundle.
 *
 * The session is a signed, httpOnly cookie — no server-side store, which suits a
 * Worker. Alpha is a single user behind one shared password; swap in a real user
 * store + password hashing when that changes.
 */
import { useSession } from "@tanstack/react-start/server";

type SessionData = {
  authed?: boolean;
};

// Secrets come from the environment. Under Cloudflare's `nodejs_compat`, Worker
// `vars` and secrets are exposed on `process.env`; locally they come from
// `.config/.dev.vars`. Both fall back to insecure defaults so the app runs with
// zero setup — the fallbacks must never reach production (see the warning below).
const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me-0123456789";
const DEV_APP_PASSWORD = "password";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (import.meta.env.PROD) {
    console.warn(
      "[session] SESSION_SECRET is unset or too short in production; using an insecure fallback. Set it with `wrangler secret put SESSION_SECRET --config .config/wrangler.jsonc`.",
    );
  }
  return DEV_SESSION_SECRET;
}

export function appPassword(): string {
  return process.env.APP_PASSWORD || DEV_APP_PASSWORD;
}

export function appSession() {
  return useSession<SessionData>({
    name: "rhymelab_session",
    password: sessionSecret(),
    maxAge: 60 * 60 * 24 * 30, // 30 days
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: import.meta.env.PROD,
      path: "/",
    },
  });
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

/**
 * Call at the top of every authenticated data server function (via the `authed`
 * middleware). The route guard protects navigations; each server function is its
 * own public endpoint and must re-check.
 */
export async function requireAuth(): Promise<void> {
  const session = await appSession();
  if (session.data.authed !== true) {
    throw new Response("Unauthorized", { status: 401 });
  }
}
