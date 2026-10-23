/**
 * Health checks for the worktree's sandbox. Every check is a live probe, never
 * a recorded belief: a stale PID file is not "up".
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Identity } from "./identity.mts";
import { readCredentials } from "./creds.mts";
import { apiUrl, webUrl } from "./env.mts";
import { ApiClient } from "./http.mts";
import { dbExists, queryRows, selectBackend, type PgBackend } from "./postgres.mts";
import { onPath } from "./proc.mts";
import {
  depsCurrent,
  migrationStatus,
  probeApi,
  probeWeb,
  readRunState,
  serversAlive,
} from "./stack.mts";
import { SANDBOX_USER_ID } from "./state.mts";

export interface Check {
  name: string;
  ok: boolean;
  critical: boolean;
  detail: string;
  fix?: string;
}

const MIN_NODE: [number, number] = [22, 18];

/** Run every check. Later checks are skipped once a prerequisite fails. */
export async function runDoctor(id: Identity): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (check: Check): boolean => {
    checks.push(check);
    return check.ok;
  };
  const skip = (name: string, why: string): void => {
    checks.push({ name, ok: false, critical: true, detail: `skipped: ${why}` });
  };

  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  add({
    name: "node",
    ok: major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]),
    critical: true,
    detail: `v${process.versions.node} (needs ≥ ${MIN_NODE.join(".")} for native TypeScript)`,
    fix: "nvm install (reads .nvmrc)",
  });
  add({
    name: "pnpm",
    ok: onPath("pnpm"),
    critical: true,
    detail: onPath("pnpm") ? "on PATH" : "not found",
    fix: "./rhymelab-sandbox up installs it",
  });
  add({
    name: "dependencies",
    ok: depsCurrent(id),
    critical: true,
    detail: depsCurrent(id) ? "match pnpm-lock.yaml" : "missing or older than pnpm-lock.yaml",
    fix: "./rhymelab-sandbox up (or migrate) reinstalls",
  });
  const clientDir = resolve(id.root, "packages/database/src/_generated/prisma");
  add({
    name: "prisma-client",
    ok: existsSync(clientDir),
    critical: true,
    detail: existsSync(clientDir) ? "generated" : "not generated",
    fix: "./rhymelab-sandbox migrate",
  });

  let pg: PgBackend | null = null;
  try {
    pg = selectBackend();
  } catch (err) {
    add({ name: "postgres", ok: false, critical: true, detail: (err as Error).message });
  }
  const pgUp =
    pg !== null &&
    add({
      name: "postgres",
      ok: pg.running(),
      critical: true,
      detail: `${pg.kind} backend, ${pg.running() ? "accepting connections" : "down"} on :5433`,
      fix: "./rhymelab-sandbox up",
    });

  if (pg && pgUp) {
    const exists = add({
      name: "database",
      ok: dbExists(pg, id.db),
      critical: true,
      detail: `${id.db} ${dbExists(pg, id.db) ? "present" : "absent"}`,
      fix: "./rhymelab-sandbox migrate",
    });
    if (exists) {
      const { onDisk, applied } = migrationStatus(id, pg);
      add({
        name: "migrations",
        ok: applied === onDisk,
        critical: true,
        detail: `${applied}/${onDisk} applied`,
        fix: "./rhymelab-sandbox migrate",
      });
      if (applied > 0) {
        const [row] = queryRows<{ users: number; entries: number }>(
          pg,
          id.db,
          `SELECT (SELECT count(*) FROM users WHERE id = '${SANDBOX_USER_ID}')::int AS users,
                  (SELECT count(*) FROM lyric_entries WHERE user_id = '${SANDBOX_USER_ID}' AND deleted_at IS NULL)::int AS entries`,
        );
        add({
          name: "seed",
          ok: (row?.users ?? 0) === 1,
          critical: false,
          detail: `sandbox user ${row?.users ? "present" : "absent"}, ${row?.entries ?? 0} entries`,
          fix: "./rhymelab-sandbox seed",
        });
      }
    } else {
      skip("migrations", "no database");
    }
  } else {
    skip("database", "postgres down");
  }

  const state = readRunState(id);
  if (!serversAlive(state)) {
    for (const name of ["api", "web"]) {
      add({
        name,
        ok: false,
        critical: true,
        detail: state ? "recorded PIDs are dead (stale state)" : "not running",
        fix: "./rhymelab-sandbox up",
      });
    }
    return checks;
  }

  const api = await probeApi(state.ports);
  add({
    name: "api",
    ok: api.ok,
    critical: true,
    detail: `${apiUrl(state.ports)} — ${api.detail}`,
    fix: "./rhymelab-sandbox logs api",
  });
  const web = await probeWeb(state.ports, 15_000);
  add({
    name: "web",
    ok: web.ok,
    critical: true,
    detail: `${webUrl(state.ports)} — ${web.detail}`,
    fix: "./rhymelab-sandbox logs web",
  });
  if (api.ok) {
    const res = await fetch(`${apiUrl(state.ports)}/auth/me`, {
      headers: { origin: webUrl(state.ports) },
    }).catch(() => null);
    const allowed = res?.headers.get("access-control-allow-origin") ?? null;
    add({
      name: "cors",
      ok: allowed === webUrl(state.ports),
      critical: true,
      detail: `API allows origin ${allowed ?? "(none)"}`,
      fix: "./rhymelab-sandbox down && ./rhymelab-sandbox up",
    });
    const creds = readCredentials(id);
    const valid = creds ? await new ApiClient(apiUrl(state.ports), creds.cookie).authed() : false;
    add({
      name: "credentials",
      ok: valid,
      critical: false,
      detail: creds
        ? valid
          ? "planted session is valid"
          : "planted session rejected"
        : "none planted",
      fix: "./rhymelab-sandbox creds",
    });
  }
  return checks;
}
