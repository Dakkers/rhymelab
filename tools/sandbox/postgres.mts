/**
 * The sandbox's Postgres server, behind one of two backends:
 *
 * - `docker` — the shared `rhymelab-postgres` container from compose.yaml.
 * - `native` — a local cluster run with the host's own `initdb`/`pg_ctl`, for
 *   machines and cloud sandboxes without a Docker daemon.
 *
 * Both listen on localhost:5433 with the committed dummy credentials and hold
 * one database per worktree.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { PG, REPO_ROOT } from "./identity.mts";
import { capture, log, onPath, run, SandboxError, sleep } from "./proc.mts";

export type BackendKind = "docker" | "native";

export interface PgBackend {
  kind: BackendKind;
  /** Whether the server is up and accepting queries. */
  running(): boolean;
  /** Start the server, creating it first if needed. MUST be idempotent. */
  ensure(): Promise<void>;
  /** Run `sql` against `db`. Rows come back tab-separated, one per line. */
  sql(db: string, sql: string): { ok: boolean; stdout: string; stderr: string };
  /** Open an interactive psql shell on `db`. */
  interactive(db: string): void;
}

/**
 * The backend to use. `RHYMELAB_SANDBOX_PG` MAY force one; otherwise Docker
 * wins when its daemon answers, and a native install is the fallback.
 *
 * @throws {SandboxError} When neither backend is available.
 */
export function selectBackend(): PgBackend {
  const forced = process.env.RHYMELAB_SANDBOX_PG;
  if (forced === "docker") return dockerBackend;
  if (forced === "native") return nativeBackend();
  if (forced) {
    throw new SandboxError(`RHYMELAB_SANDBOX_PG must be "docker" or "native", got "${forced}"`, {
      exitCode: 2,
    });
  }
  if (dockerAvailable()) return dockerBackend;
  if (findNativeBin("initdb")) return nativeBackend();
  throw new SandboxError(
    "No Postgres backend: Docker isn't running and no native Postgres found.",
    {
      fix: "Start Docker/OrbStack, or install Postgres (brew install postgresql@17 / apt install postgresql) and retry.",
    },
  );
}

/** Whether a Docker daemon answers. */
export function dockerAvailable(): boolean {
  return onPath("docker") && capture("docker", ["info"]).ok;
}

/** Whether `db` exists on the server. */
export function dbExists(pg: PgBackend, db: string): boolean {
  return pg.sql("postgres", `SELECT 1 FROM pg_database WHERE datname = '${db}'`).stdout === "1";
}

/** Create `db` if it doesn't exist. */
export function ensureDb(pg: PgBackend, db: string): boolean {
  if (dbExists(pg, db)) return false;
  log(`Creating database "${db}"…`);
  must(pg.sql("postgres", `CREATE DATABASE "${db}"`), `create database "${db}"`);
  return true;
}

/** Drop `db`, terminating any open connections. */
export function dropDb(pg: PgBackend, db: string): void {
  log(`Dropping database "${db}"…`);
  must(pg.sql("postgres", `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`), `drop "${db}"`);
}

/**
 * Run a row-returning `query` against `db` and parse its rows as JSON objects.
 *
 * @throws {SandboxError} When the query fails.
 */
export function queryRows<T = Record<string, unknown>>(
  pg: PgBackend,
  db: string,
  query: string,
): T[] {
  const wrapped = `SELECT coalesce(json_agg(t), '[]'::json) FROM (${query}) t`;
  const result = must(pg.sql(db, wrapped), "query");
  return JSON.parse(result.stdout || "[]") as T[];
}

function must<T extends { ok: boolean; stderr: string }>(result: T, what: string): T {
  if (!result.ok) throw new SandboxError(`Postgres failed to ${what}: ${result.stderr}`);
  return result;
}

const PSQL_FLAGS = ["-XAtq", "-v", "ON_ERROR_STOP=1", "-U", PG.user];

const dockerBackend: PgBackend = {
  kind: "docker",

  running() {
    return capture("docker", ["exec", PG.container, "pg_isready", "-U", PG.user, "-d", "postgres"])
      .ok;
  },

  async ensure() {
    if (!dockerAvailable()) {
      throw new SandboxError("Docker isn't running.", { fix: "Start Docker/OrbStack and retry." });
    }
    if (this.running()) return;
    const exists = capture("docker", ["ps", "-aq", "-f", `name=^/${PG.container}$`]).stdout !== "";
    if (exists) {
      log("Starting the Postgres container…");
      run("docker", ["start", PG.container]);
    } else {
      log("Creating the Postgres container…");
      run("docker", ["compose", "-p", PG.composeProject, "up", "-d", PG.composeService], {
        cwd: REPO_ROOT,
      });
    }
    for (let tries = 0; !this.running(); tries++) {
      if (tries > 60) throw new SandboxError("Postgres didn't become ready within 30s.");
      await sleep(500);
    }
  },

  sql(db, sql) {
    return capture("docker", [
      "exec",
      "-i",
      PG.container,
      "psql",
      ...PSQL_FLAGS,
      "-d",
      db,
      "-c",
      sql,
    ]);
  },

  interactive(db) {
    spawnSync("docker", ["exec", "-it", PG.container, "psql", "-U", PG.user, "-d", db], {
      stdio: "inherit",
    });
  },
};

function nativeBackend(): PgBackend {
  const stateDir = resolve(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
    "rhymelab-sandbox",
  );
  const dataDir = join(stateDir, "pgdata");
  const bin = (name: string): string => {
    const found = findNativeBin(name);
    if (!found) {
      throw new SandboxError(`Native Postgres needs \`${name}\`, which isn't installed.`, {
        fix: "Install Postgres (brew install postgresql@17 / apt install postgresql), or start Docker.",
      });
    }
    return found;
  };
  const connection = ["-h", PG.host, "-p", String(PG.port)];

  return {
    kind: "native",

    running() {
      return capture(bin("pg_isready"), [...connection, "-U", PG.user, "-d", "postgres"]).ok;
    },

    async ensure() {
      if (this.running()) return;
      if (process.getuid?.() === 0) {
        throw new SandboxError("Native Postgres can't run as root (initdb refuses).", {
          fix: "Run the sandbox as a regular user, or start Docker and use the docker backend.",
        });
      }
      mkdirSync(stateDir, { recursive: true });
      if (!existsSync(join(dataDir, "PG_VERSION"))) {
        log(`Initializing a native Postgres cluster in ${dataDir}…`);
        run(bin("initdb"), [
          "-D",
          dataDir,
          "-U",
          PG.user,
          "--auth=trust",
          "-E",
          "UTF8",
          "--no-locale",
        ]);
      }
      log("Starting native Postgres…");
      run(bin("pg_ctl"), [
        "-D",
        dataDir,
        "-l",
        join(stateDir, "postgres.log"),
        "-o",
        `-p ${PG.port} -c listen_addresses=${PG.host} -k ${stateDir}`,
        "-w",
        "start",
      ]);
    },

    sql(db, sql) {
      return capture(bin("psql"), [...connection, ...PSQL_FLAGS, "-d", db, "-c", sql]);
    },

    interactive(db) {
      spawnSync(bin("psql"), [...connection, "-U", PG.user, "-d", db], { stdio: "inherit" });
    },
  };
}

/**
 * The path of a Postgres server binary. Checks PATH, then the usual install
 * locations, which on Debian and Homebrew are not on PATH by default. The
 * newest versioned install wins.
 */
function findNativeBin(name: string): string | null {
  const onPathResult = capture("sh", ["-c", `command -v ${name}`]);
  if (onPathResult.ok && onPathResult.stdout) return onPathResult.stdout;
  const roots: [string, (entry: string) => boolean][] = [
    ["/usr/lib/postgresql", (e) => /^\d+$/.test(e)],
    ["/Library/PostgreSQL", (e) => /^\d+$/.test(e)],
    ["/opt/homebrew/opt", (e) => e.startsWith("postgresql")],
    ["/usr/local/opt", (e) => e.startsWith("postgresql")],
  ];
  for (const [root, matches] of roots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root)
      .filter(matches)
      .sort((a, b) => versionOf(b) - versionOf(a));
    for (const version of versions) {
      const candidate = join(root, version, "bin", name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function versionOf(entry: string): number {
  return Number(/\d+/.exec(entry)?.[0] ?? 0);
}
