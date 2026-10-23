/**
 * The worktree's stack: dependencies, schema, seed data, and the API + web
 * servers.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { Identity } from "./identity.mts";
import { apiUrl, webUrl, type Ports } from "./env.mts";
import { queryRows, type PgBackend } from "./postgres.mts";
import { alive, log, onPath, portBusy, run, SandboxError, sleep } from "./proc.mts";

export interface RunState {
  mode: "detached" | "foreground";
  supervisorPid: number;
  apiPid: number;
  webPid: number;
  ports: Ports;
  startedAt: string;
}

export const SEED_PROFILES = ["baseline", "default", "demo"] as const;
export type SeedProfile = (typeof SEED_PROFILES)[number];

const LOCK_MARKER = "node_modules/.sandbox-lockfile-sha256";

/**
 * Install pnpm and the workspace's dependencies when missing or stale. Stale
 * means the lockfile changed since the last install this tool ran.
 */
export function ensureDeps(id: Identity): void {
  if (!onPath("pnpm")) {
    const version = JSON.parse(readFileSync(resolve(id.root, "package.json"), "utf8"))
      .packageManager as string;
    log(`pnpm not found — installing ${version} globally with npm…`);
    run("npm", ["install", "--global", version]);
  }
  const lockHash = createHash("sha256")
    .update(readFileSync(resolve(id.root, "pnpm-lock.yaml")))
    .digest("hex");
  const marker = resolve(id.root, LOCK_MARKER);
  if (existsSync(marker) && readFileSync(marker, "utf8") === lockHash) return;
  log(
    existsSync(resolve(id.root, "node_modules"))
      ? "Lockfile changed since the last sandbox install — reinstalling…"
      : "Installing dependencies…",
  );
  run("pnpm", ["install", "--frozen-lockfile"], { cwd: id.root });
  writeFileSync(marker, lockHash);
}

/** Whether installed dependencies match the lockfile. */
export function depsCurrent(id: Identity): boolean {
  const marker = resolve(id.root, LOCK_MARKER);
  if (!existsSync(marker)) return false;
  const lockHash = createHash("sha256")
    .update(readFileSync(resolve(id.root, "pnpm-lock.yaml")))
    .digest("hex");
  return readFileSync(marker, "utf8") === lockHash;
}

/** Apply pending migrations to the worktree's database, then regenerate the Prisma client. */
export function migrate(id: Identity): void {
  log(`Applying migrations to "${id.db}"…`);
  const env = { ...process.env, DATABASE_URL: id.dbUrl };
  run("pnpm", ["--filter", "@rhymelab/database", "exec", "prisma", "migrate", "deploy"], {
    cwd: id.root,
    env,
  });
  log("Regenerating the Prisma client…");
  run("pnpm", ["--filter", "@rhymelab/database", "build"], { cwd: id.root, env });
}

/** Migration counts: on disk vs. applied to the worktree's database. */
export function migrationStatus(id: Identity, pg: PgBackend): { onDisk: number; applied: number } {
  const dir = resolve(id.root, "packages/database/prisma/migrations");
  const onDisk = readdirSync(dir).filter((entry) =>
    statSync(join(dir, entry)).isDirectory(),
  ).length;
  const table = pg.sql(id.db, "SELECT to_regclass('public._prisma_migrations') IS NOT NULL");
  if (table.stdout !== "t") return { onDisk, applied: 0 };
  const [row] = queryRows<{ n: number }>(
    pg,
    id.db,
    "SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
  );
  return { onDisk, applied: row?.n ?? 0 };
}

/** Seed `profile` into the worktree's database. Idempotent. */
export function seed(id: Identity, env: Record<string, string>, profile: SeedProfile): void {
  run(
    "pnpm",
    ["--filter", "@rhymelab/api", "exec", "tsx", "src/_dev/seed.ts", "--profile", profile],
    {
      cwd: id.root,
      env: { ...process.env, ...env },
    },
  );
}

/** Empty every application table, keeping the schema and migration history. */
export function truncateAll(id: Identity, pg: PgBackend): void {
  const tables = queryRows<{ name: string }>(
    pg,
    id.db,
    "SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  ).map((t) => t.name);
  if (tables.length === 0) return;
  log(`Truncating ${tables.length} tables…`);
  const result = pg.sql(id.db, `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
  if (!result.ok) throw new SandboxError(`truncate failed: ${result.stderr}`);
}

/** The recorded run state, or null when none is recorded. */
export function readRunState(id: Identity): RunState | null {
  try {
    return JSON.parse(readFileSync(runFile(id), "utf8")) as RunState;
  } catch {
    return null;
  }
}

/** Whether this worktree's servers are alive, per their recorded PIDs. Ports are not probed. */
export function serversAlive(state: RunState | null): state is RunState {
  return state !== null && alive(state.apiPid) && alive(state.webPid);
}

export function logFile(id: Identity, service: "api" | "web"): string {
  return join(id.stateDir, `${service}.log`);
}

/**
 * Start the API and web servers. Detached servers outlive this process and log
 * to the state directory; foreground ones share this terminal and stop with it.
 * Resolves once both answer health probes.
 *
 * @throws {SandboxError} When either server exits or stays unhealthy past the timeout.
 */
export async function startServers(
  id: Identity,
  env: Record<string, string>,
  ports: Ports,
  { foreground }: { foreground: boolean },
): Promise<{ state: RunState; children: ChildProcess[] }> {
  mkdirSync(id.stateDir, { recursive: true });
  const childEnv = { ...process.env, ...env };
  const launch = (service: "api" | "web", args: string[]): ChildProcess => {
    const fd = foreground ? null : openSync(logFile(id, service), "w");
    const child = spawn("pnpm", args, {
      cwd: id.root,
      env: childEnv,
      detached: true,
      stdio: fd === null ? ["ignore", "inherit", "inherit"] : ["ignore", fd, fd],
    });
    if (fd !== null) closeSync(fd);
    if (!foreground) child.unref();
    return child;
  };

  const api = launch("api", ["--filter", "@rhymelab/api", "dev"]);
  const web = launch("web", [
    "--filter",
    "@rhymelab/web",
    "exec",
    "vite",
    "dev",
    "--config",
    ".config/vite.config.ts",
    "--port",
    String(ports.web),
    "--strictPort",
  ]);
  const state: RunState = {
    mode: foreground ? "foreground" : "detached",
    supervisorPid: process.pid,
    apiPid: api.pid ?? -1,
    webPid: web.pid ?? -1,
    ports,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(runFile(id), JSON.stringify(state, null, 2));

  const deadline = Date.now() + 180_000;
  let apiOk = false;
  let webOk = false;
  while (!(apiOk && webOk)) {
    if (!alive(state.apiPid) || !alive(state.webPid) || (!foreground && apiCrashed(id))) {
      const dead = alive(state.webPid) ? "api" : "web";
      const hint = tailHint(id, dead);
      await stopServers(id);
      throw new SandboxError(`The ${dead} server crashed during startup.${hint}`);
    }
    if (Date.now() > deadline) {
      await stopServers(id);
      throw new SandboxError(
        `Servers weren't healthy within 180s.${tailHint(id, apiOk ? "web" : "api")}`,
      );
    }
    apiOk ||= (await probeApi(ports)).ok;
    webOk ||= apiOk && (await probeWeb(ports, 20_000)).ok;
    if (!(apiOk && webOk)) await sleep(500);
  }
  return { state, children: [api, web] };
}

/** Stop this worktree's servers and clear the run state. Idempotent. */
export async function stopServers(id: Identity): Promise<boolean> {
  const state = readRunState(id);
  if (!state) return false;
  const pids = [state.apiPid, state.webPid].filter((pid) => pid > 0);
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    for (const pid of pids) signalGroup(pid, signal);
    for (let i = 0; i < 40 && pids.some(alive); i++) await sleep(200);
    if (!pids.some(alive)) break;
  }
  for (let i = 0; i < 25 && (await portBusy(state.ports.api)); i++) await sleep(200);
  rmSync(runFile(id), { force: true });
  return true;
}

/** Probe the API's unauthenticated `auth/me` route. */
export async function probeApi(
  ports: Ports,
  timeoutMs = 2000,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${apiUrl(ports)}/auth/me`, { signal: AbortSignal.timeout(timeoutMs) });
    const body = (await res.json()) as { authed?: unknown };
    const ok = res.status === 200 && typeof body.authed === "boolean";
    return { ok, detail: `GET /api/auth/me → ${res.status}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

/** Probe the web app's landing page, which SSRs through Vite. */
export async function probeWeb(
  ports: Ports,
  timeoutMs = 5000,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(webUrl(ports), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    return { ok: res.status < 500, detail: `GET / → ${res.status}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

/** The last `lines` lines of a service's log. */
export function tailLog(id: Identity, service: "api" | "web", lines = 40): string {
  const file = logFile(id, service);
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").split("\n").slice(-lines).join("\n");
}

/** Whether the API process threw at startup. `tsx watch` outlives the crash, so the log is the signal. */
function apiCrashed(id: Identity): boolean {
  return /^Node\.js v\d+\.\d+\.\d+$/m.test(tailLog(id, "api", 200));
}

function tailHint(id: Identity, service: "api" | "web"): string {
  const tail = tailLog(id, service, 25);
  return tail ? `\n--- ${service}.log (tail) ---\n${tail}` : "";
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {}
  }
}

function runFile(id: Identity): string {
  return join(id.stateDir, "run.json");
}
