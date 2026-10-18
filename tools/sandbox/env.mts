/**
 * The sandbox's environment. Derived from the committed `.config/.env`
 * defaults, so it can't drift from what the apps read, then overridden with
 * this worktree's database and ports. Exported to the child processes rather
 * than written to a file: dotenv and Vite never override an already-set
 * variable, so these beat every committed and gitignored `.env*` file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Identity } from "./identity.mts";

export const API_ENV_FILE = "app/backend/api/.config/.env";
export const WEB_ENV_FILE = "app/frontend/web/.config/.env";

export interface Ports {
  web: number;
  api: number;
}

/** The variables every sandbox process MUST see. */
export function sandboxEnv(id: Identity, ports: Ports): Record<string, string> {
  return {
    ...parseDotenv(readFileSync(resolve(id.root, API_ENV_FILE), "utf8")),
    ...parseDotenv(readFileSync(resolve(id.root, WEB_ENV_FILE), "utf8")),
    NODE_ENV: "development",
    RHYMELAB_SANDBOX: "1",
    DATABASE_URL: id.dbUrl,
    PORT: String(ports.api),
    FRONTEND_ORIGIN: webUrl(ports),
    VITE_API_URL: apiUrl(ports),
  };
}

/** The sandbox's login password: the committed default. */
export function sandboxPassword(id: Identity): string {
  return (
    parseDotenv(readFileSync(resolve(id.root, API_ENV_FILE), "utf8")).APP_PASSWORD ?? "password"
  );
}

export function webUrl(ports: Ports): string {
  return `http://localhost:${ports.web}`;
}

export function apiUrl(ports: Ports): string {
  return `http://localhost:${ports.api}/api`;
}

/** Parse `KEY=value` lines. Quotes around a value are stripped; `#` lines are skipped. */
export function parseDotenv(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, key = "", raw = ""] = match;
    vars[key] = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/, "");
  }
  return vars;
}
