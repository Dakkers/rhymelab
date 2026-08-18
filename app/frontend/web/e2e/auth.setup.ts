/**
 * Mints the signed-in session that every real spec reuses (see the `setup`
 * project in `.config/playwright.config.ts`). RhymeLab's auth is a single app
 * password: `auth.login({ password })` sets an httpOnly session cookie, and the
 * `_authenticated` route guard just checks that cookie exists. There is no login
 * *page* to click through, so we log in over the API and save the cookie as
 * Playwright storage state.
 *
 * Requires `E2E_APP_PASSWORD` in the environment — the same value as `PASSWORD`
 * in `app/backend/api/.config/.env`. Never hard-code it here.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as setup } from "@playwright/test";
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract } from "@rhymelab/api-contract";

const API_URL = process.env.VITE_API_URL ?? "http://localhost:4000/api";
const AUTH_FILE = fileURLToPath(new URL("./.auth/state.json", import.meta.url));

setup("authenticate", async () => {
  const password = process.env.E2E_APP_PASSWORD;
  expect(
    password,
    "Set E2E_APP_PASSWORD to the app password (the `PASSWORD` in app/backend/api/.config/.env).",
  ).toBeTruthy();

  // oRPC builds the fully-serialized request for us; we just wrap the transport
  // so we can read the login response's Set-Cookie(s). This keeps us off oRPC's
  // wire format entirely — we send exactly what the app's own client would.
  const setCookies: string[] = [];
  const link = new OpenAPILink(contract, {
    url: API_URL,
    fetch: async (request, init) => {
      const res = await globalThis.fetch(request, init);
      for (const c of res.headers.getSetCookie?.() ?? []) setCookies.push(c);
      return res;
    },
  });
  const client = createORPCClient(link) as JsonifiedClient<ContractRouterClient<typeof contract>>;

  const result = await client.auth.login({ password: password! });
  expect(result.ok, "Login was rejected — is E2E_APP_PASSWORD correct?").toBe(true);
  expect(setCookies.length, "Login set no cookie — is the API (:4000) running?").toBeGreaterThan(0);

  // Cookies ignore port, so a `localhost` cookie the API (:4000) sets is also
  // sent to the web app (:3000) — one entry covers both origins. We read the
  // name/value/expiry off the header and fill the rest from what the API sets
  // (httpOnly, SameSite=Lax, path=/; see app/backend/api/src/session.ts).
  const cookies = setCookies.map((raw) => {
    const [pair, ...attrs] = raw.split(";").map((s) => s.trim());
    const eq = pair.indexOf("=");
    const attrKeys = attrs.map((a) => a.toLowerCase());
    const maxAge = attrs.find((a) => /^max-age=/i.test(a))?.split("=")[1];
    const expiresAt = attrs.find((a) => /^expires=/i.test(a))?.slice("expires=".length);
    const path = attrs.find((a) => /^path=/i.test(a))?.slice("path=".length) ?? "/";

    let expires = -1; // -1 = session cookie
    if (maxAge) expires = Math.floor(Date.now() / 1000) + Number(maxAge);
    else if (expiresAt) expires = Math.floor(new Date(expiresAt).getTime() / 1000);

    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: "localhost",
      path,
      expires,
      httpOnly: attrKeys.includes("httponly"),
      secure: attrKeys.includes("secure"),
      sameSite: "Lax" as const,
    };
  });

  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify({ cookies, origins: [] }, null, 2));
});
