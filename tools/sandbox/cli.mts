/**
 * The `sandbox` CLI. One registry drives dispatch and `--help`, so nothing is
 * dispatchable but undocumented. Every command takes `--json`; exit codes are
 * assertions: 0 ok, 1 failed (or `--expect` mismatched), 2 usage error.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { curlExamples, plantCredentials, readCredentials } from "./creds.mts";
import { runDoctor } from "./doctor.mts";
import { apiUrl, sandboxEnv, sandboxPassword, webUrl, type Ports } from "./env.mts";
import { DEFAULT_DB, identityFor, type Identity } from "./identity.mts";
import { FLOW_OPTIONS, FLOWS } from "./flows.mts";
import { ApiClient } from "./http.mts";
import { dbExists, dropDb, ensureDb, queryRows, selectBackend } from "./postgres.mts";
import { freePort, log, portBusy, SandboxError } from "./proc.mts";
import {
  ensureDeps,
  logFile,
  migrate,
  migrationStatus,
  probeApi,
  readRunState,
  seed,
  SEED_PROFILES,
  serversAlive,
  startServers,
  stopServers,
  tailLog,
  truncateAll,
  type SeedProfile,
} from "./stack.mts";
import { readLastEntryId, readWorld, writeLastEntryId } from "./state.mts";

interface OptionSpec {
  type: "string" | "boolean";
  short?: string;
  description: string;
  default?: string | boolean;
}

interface Ctx {
  id: Identity;
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
  json: boolean;
}

export interface Result {
  ok: boolean;
  data: Record<string, unknown>;
  text: string[];
  exitCode?: number;
}

export interface Command {
  name: string;
  group: "Lifecycle" | "Data" | "Auth" | "Flows" | "Meta";
  summary: string;
  args?: string;
  options?: Record<string, OptionSpec>;
  run(ctx: Ctx): Promise<Result>;
}

const GLOBAL_OPTIONS: Record<string, OptionSpec> = {
  json: { type: "boolean", description: "Print one JSON object on stdout" },
  help: { type: "boolean", short: "h", description: "Show help for this command" },
};

const YES: OptionSpec = {
  type: "boolean",
  short: "y",
  description: "Skip the confirmation prompt",
};

const PROFILE: OptionSpec = {
  type: "string",
  description: `Seed profile: ${SEED_PROFILES.join(" | ")}`,
  default: "default",
};

export const COMMANDS: Command[] = [
  {
    name: "up",
    group: "Lifecycle",
    summary: "Install, start Postgres, migrate, seed, run API + web, plant creds",
    options: {
      fg: { type: "boolean", description: "Stay in the foreground; Ctrl-C stops both servers" },
      profile: PROFILE,
      "no-seed": { type: "boolean", description: "Skip seeding" },
    },
    async run({ id, values }) {
      const existing = readRunState(id);
      if (serversAlive(existing) && (await probeApi(existing.ports)).ok) {
        const creds = readCredentials(id) ?? (await plantCredentials(id, existing.ports));
        return upResult(id, existing.ports, creds.cookie, true);
      }
      if (existing) await stopServers(id);
      const profile = parseProfile(values.profile);
      ensureDeps(id);
      const pg = selectBackend();
      await pg.ensure();
      ensureDb(pg, id.db);
      migrate(id);
      const ports: Ports = {
        web: await freePort(id.webBase),
        api: await freePort(id.apiBase),
      };
      const env = sandboxEnv(id, ports);
      if (!values["no-seed"]) seed(id, env, profile);
      log(`Starting API on :${ports.api} and web on :${ports.web}…`);
      const foreground = values.fg === true;
      const { children } = await startServers(id, env, ports, { foreground });
      const creds = await plantCredentials(id, ports);
      const result = upResult(id, ports, creds.cookie, false);
      if (!foreground) return result;
      emit("up", result, false);
      log("Ctrl-C stops both servers.");
      await new Promise<void>((done) => {
        process.once("SIGINT", done);
        process.once("SIGTERM", done);
        for (const child of children) child.once("exit", () => done());
      });
      await stopServers(id);
      return { ok: true, data: { stopped: true }, text: ["Stopped."] };
    },
  },
  {
    name: "down",
    group: "Lifecycle",
    summary: "Stop this worktree's API + web (the database is kept)",
    options: {
      yes: {
        type: "boolean",
        short: "y",
        description: "(moved) `down` no longer drops the database — use `drop --yes`",
      },
    },
    async run({ id, values }) {
      if (values.yes) {
        throw new SandboxError("`down` now stops the servers and keeps the database.", {
          exitCode: 2,
          fix: "To destroy the database, run `./rhymelab-sandbox drop --yes`.",
        });
      }
      const stopped = await stopServers(id);
      return {
        ok: true,
        data: { stopped },
        text: [stopped ? "Stopped API + web. The database is kept." : "Already down."],
      };
    },
  },
  {
    name: "status",
    group: "Lifecycle",
    summary: "Show the slug, database, backend, ports, and whether servers run",
    async run({ id }) {
      const state = readRunState(id);
      const running = serversAlive(state);
      let backend: string;
      let database = "unknown (postgres down)";
      try {
        const pg = selectBackend();
        backend = `${pg.kind} (${pg.running() ? "up" : "down"})`;
        if (pg.running()) database = dbExists(pg, id.db) ? "present" : "absent";
      } catch (err) {
        backend = `unavailable — ${(err as Error).message}`;
      }
      const ports = running ? state.ports : { web: id.webBase, api: id.apiBase };
      const portNote = async (port: number): Promise<string> =>
        running ? "listening" : (await portBusy(port)) ? "busy (other process)" : "free";
      const data = {
        worktree: id.root,
        slug: id.slug,
        backend,
        database: id.db,
        databaseState: database,
        dbUrl: id.dbUrl,
        servers: running ? state.mode : "stopped",
        web: webUrl(ports),
        api: apiUrl(ports),
        credentials: readCredentials(id) ? id.credentialsFile : null,
      };
      return {
        ok: true,
        data,
        text: [
          `worktree : ${id.root}`,
          `slug     : ${id.slug}`,
          `postgres : ${backend} @ localhost:5433`,
          `database : ${id.db} (${database})`,
          `db url   : ${id.dbUrl}`,
          `servers  : ${data.servers}`,
          `api      : ${data.api} (${await portNote(ports.api)})`,
          `web      : ${data.web} (${await portNote(ports.web)})`,
          `creds    : ${data.credentials ?? "none planted"}`,
        ],
      };
    },
  },
  {
    name: "doctor",
    group: "Lifecycle",
    summary: "Probe every dependency; exits 1 if any critical check fails",
    async run({ id }) {
      const checks = await runDoctor(id);
      const ok = checks.every((c) => c.ok || !c.critical);
      return {
        ok,
        data: { checks },
        text: checks.map((c) => {
          const mark = c.ok ? "✓" : c.critical ? "✗" : "!";
          return `${mark} ${c.name.padEnd(13)} ${c.detail}${!c.ok && c.fix ? `  → ${c.fix}` : ""}`;
        }),
      };
    },
  },
  {
    name: "logs",
    group: "Lifecycle",
    summary: "Print the tail of the API and/or web log",
    args: "[api|web]",
    options: { lines: { type: "string", description: "Lines per log", default: "40" } },
    async run({ id, positionals, values }) {
      const which = positionals[0];
      if (which !== undefined && which !== "api" && which !== "web") {
        throw new SandboxError(`unknown log "${which}"; expected api or web`, { exitCode: 2 });
      }
      const services: ("api" | "web")[] = which === undefined ? ["api", "web"] : [which];
      const lines = Number(values.lines);
      const logs = Object.fromEntries(services.map((s) => [s, tailLog(id, s, lines)]));
      return {
        ok: true,
        data: { logs, files: services.map((s) => logFile(id, s)) },
        text: services.flatMap((s) => [`--- ${s} (${logFile(id, s)}) ---`, logs[s] || "(empty)"]),
      };
    },
  },
  {
    name: "migrate",
    group: "Data",
    summary: "Create the database if needed and apply migrations (no servers)",
    async run({ id }) {
      ensureDeps(id);
      const pg = selectBackend();
      await pg.ensure();
      const created = ensureDb(pg, id.db);
      migrate(id);
      const status = migrationStatus(id, pg);
      return {
        ok: true,
        data: { database: id.db, created, ...status },
        text: [`${id.db}: ${status.applied}/${status.onDisk} migrations applied.`],
      };
    },
  },
  {
    name: "seed",
    group: "Data",
    summary: "Seed a profile into the database (idempotent)",
    options: { profile: PROFILE },
    async run({ id, values }) {
      const profile = parseProfile(values.profile);
      const pg = selectBackend();
      await pg.ensure();
      if (!dbExists(pg, id.db)) {
        throw new SandboxError(`database "${id.db}" doesn't exist`, {
          fix: "./rhymelab-sandbox migrate",
        });
      }
      seed(id, sandboxEnv(id, { web: id.webBase, api: id.apiBase }), profile);
      const world = readWorld(id, pg);
      return {
        ok: true,
        data: { profile, counts: world.counts },
        text: [`Seeded "${profile}": ${world.counts.entries} entries.`],
      };
    },
  },
  {
    name: "reset",
    group: "Data",
    summary: "Empty all tables and reseed; --hard drops and re-migrates",
    options: {
      hard: { type: "boolean", description: "Drop + recreate + migrate instead of truncating" },
      profile: PROFILE,
      yes: YES,
    },
    async run({ id, values }) {
      const hard = values.hard === true;
      const profile = parseProfile(values.profile);
      await confirmDestructive(id, hard ? "drop and recreate" : "empty", values.yes === true);
      const pg = selectBackend();
      await pg.ensure();
      if (hard || !dbExists(pg, id.db)) {
        dropDb(pg, id.db);
        ensureDb(pg, id.db);
        migrate(id);
      } else {
        truncateAll(id, pg);
      }
      writeLastEntryId(id, null);
      seed(id, sandboxEnv(id, { web: id.webBase, api: id.apiBase }), profile);
      const world = readWorld(id, pg);
      return {
        ok: true,
        data: { hard, profile, counts: world.counts },
        text: [`Reset ${id.db} (${hard ? "hard" : "soft"}); seeded "${profile}".`],
      };
    },
  },
  {
    name: "drop",
    group: "Data",
    summary: "Stop the servers and destroy this worktree's database",
    options: { yes: YES },
    async run({ id, values }) {
      await confirmDestructive(id, "drop", values.yes === true);
      await stopServers(id);
      const pg = selectBackend();
      await pg.ensure();
      dropDb(pg, id.db);
      writeLastEntryId(id, null);
      return { ok: true, data: { dropped: id.db }, text: [`Dropped ${id.db}.`] };
    },
  },
  {
    name: "state",
    group: "Data",
    summary: "Counts and entry IDs scoped to the sandbox login",
    async run({ id }) {
      const pg = selectBackend();
      if (!pg.running() || !dbExists(pg, id.db)) {
        throw new SandboxError(`database "${id.db}" isn't available`, {
          fix: "./rhymelab-sandbox up",
        });
      }
      const world = readWorld(id, pg);
      return {
        ok: true,
        data: { database: id.db, ...world },
        text: [
          `${id.db}: ${world.counts.entries} entries, ${world.counts.annotations} annotations, ${world.counts.users} users`,
          ...world.entries.map(
            (e) =>
              `  ${e.id}  ${e.kind.padEnd(4)}  ${e.title} (${e.sections} sections, ${e.annotations} annotated lines)`,
          ),
          `last flow entry: ${world.lastEntryId ?? "none"}`,
        ],
      };
    },
  },
  {
    name: "sql",
    group: "Data",
    summary: "Run one SQL statement non-interactively; SELECTs return rows",
    args: "<statement>",
    async run({ id, positionals }) {
      const statement = positionals.join(" ").trim().replace(/;\s*$/, "");
      if (!statement) throw new SandboxError("sql needs a statement", { exitCode: 2 });
      const pg = selectBackend();
      if (/^\s*(select|with|values|table)\b/i.test(statement)) {
        const rows = queryRows(pg, id.db, statement);
        return { ok: true, data: { rows }, text: rows.map((r) => JSON.stringify(r)) };
      }
      const result = pg.sql(id.db, statement);
      if (!result.ok) throw new SandboxError(result.stderr);
      return { ok: true, data: { output: result.stdout }, text: [result.stdout || "OK"] };
    },
  },
  {
    name: "psql",
    group: "Data",
    summary: "Open an interactive psql shell (humans only; agents use `sql`)",
    async run({ id }) {
      const pg = selectBackend();
      await pg.ensure();
      pg.interactive(id.db);
      return { ok: true, data: {}, text: [] };
    },
  },
  {
    name: "creds",
    group: "Auth",
    summary: "Log in through the real route; print the session and curl examples",
    async run({ id }) {
      const state = readRunState(id);
      if (!serversAlive(state)) {
        throw new SandboxError("The sandbox isn't running.", { fix: "./rhymelab-sandbox up" });
      }
      const creds = await plantCredentials(id, state.ports);
      const curl = curlExamples(creds);
      return {
        ok: true,
        data: { ...creds, file: id.credentialsFile, curl },
        text: [
          `web      : ${creds.webUrl}  (password: ${creds.password})`,
          `api      : ${creds.apiUrl}`,
          `cookie   : ${creds.cookie}`,
          `file     : ${id.credentialsFile}`,
          "",
          ...curl,
        ],
      };
    },
  },
  {
    name: "flow",
    group: "Flows",
    summary: "Run an end-to-end scenario through the real API; `flow list` shows them",
    args: "<name>|list",
    options: {
      expect: { type: "string", description: "Exit 1 unless the flow reports this outcome" },
      explain: { type: "boolean", description: "Describe the flow's hops without running it" },
      ...FLOW_OPTIONS,
    },
    async run({ id, values, positionals }) {
      const [name] = positionals;
      if (!name || name === "list") {
        return {
          ok: true,
          data: { flows: FLOWS.map(({ run: _run, ...flow }) => flow) },
          text: FLOWS.map(
            (f) => `  ${f.name.padEnd(15)} ${f.summary}  [${f.outcomes.join(" | ")}]`,
          ),
        };
      }
      const flow = FLOWS.find((f) => f.name === name);
      if (!flow) {
        throw new SandboxError(`unknown flow "${name}"`, {
          exitCode: 2,
          fix: "Run `./rhymelab-sandbox flow list`.",
        });
      }
      const expect = typeof values.expect === "string" ? values.expect : undefined;
      if (expect !== undefined && !flow.outcomes.includes(expect)) {
        throw new SandboxError(
          `flow ${name} never reports "${expect}"; it reports ${flow.outcomes.join(", ")}`,
          { exitCode: 2 },
        );
      }
      if (values.explain) {
        return {
          ok: true,
          data: { flow: name, outcomes: flow.outcomes, uses: flow.uses, explain: flow.explain },
          text: [
            `flow ${name}: ${flow.summary}`,
            ...flow.explain.map((step, i) => `  ${i + 1}. ${step}`),
            `outcomes: ${flow.outcomes.join(" | ")}`,
            flow.uses.length
              ? `options: ${flow.uses.map((u) => `--${u}`).join(" ")}`
              : "options: none",
          ],
        };
      }
      const state = readRunState(id);
      if (!serversAlive(state)) {
        throw new SandboxError("The sandbox isn't running.", { fix: "./rhymelab-sandbox up" });
      }
      const client = new ApiClient(apiUrl(state.ports));
      const started = performance.now();
      let outcome: string;
      let data: Record<string, unknown> = {};
      let error: string | undefined;
      try {
        ({ outcome, data } = await flow.run(
          {
            id,
            pg: selectBackend(),
            apiBase: apiUrl(state.ports),
            password: sandboxPassword(id),
            values,
            lastEntryId: readLastEntryId(id),
          },
          client,
        ));
      } catch (err) {
        if (err instanceof SandboxError && err.exitCode === 2) throw err;
        outcome = "error";
        error = (err as Error).message;
      }
      const totalMs = Math.round(performance.now() - started);
      const matched = error === undefined && (expect === undefined || outcome === expect);
      const verdict =
        error !== undefined
          ? ` — ${error}`
          : expect === undefined
            ? ""
            : matched
              ? " (as expected)"
              : ` (expected ${expect})`;
      return {
        ok: matched,
        data: {
          flow: name,
          outcome,
          expected: expect ?? null,
          matched,
          error,
          totalMs,
          hops: client.trace,
          ...data,
        },
        text: [
          `flow ${name}: ${outcome}${verdict}`,
          ...client.trace.map(
            (hop) =>
              `  ${hop.method.padEnd(6)} ${hop.path.padEnd(46)} → ${hop.status}  ${hop.ms}ms`,
          ),
          `  total ${totalMs}ms`,
        ],
      };
    },
  },
  {
    name: "help",
    group: "Meta",
    summary: "List commands, or show one command's options",
    args: "[command]",
    async run({ positionals }) {
      const [name] = positionals;
      if (!name) return { ok: true, data: { commands: COMMANDS.map(describe) }, text: overview() };
      const command = COMMANDS.find((c) => c.name === name);
      if (!command) throw unknownCommand(name);
      return { ok: true, data: describe(command), text: commandHelp(command) };
    },
  },
];

function upResult(id: Identity, ports: Ports, cookie: string, already: boolean): Result {
  return {
    ok: true,
    data: {
      alreadyRunning: already,
      database: id.db,
      web: webUrl(ports),
      api: apiUrl(ports),
      cookie,
    },
    text: [
      already ? "Already running:" : "Sandbox is up:",
      `  web       ${webUrl(ports)}`,
      `  api       ${apiUrl(ports)}`,
      `  database  ${id.db}`,
      `  creds     ${id.credentialsFile}`,
      "Next: ./rhymelab-sandbox doctor · creds · flow list · down",
    ],
  };
}

function parseProfile(value: string | boolean | undefined): SeedProfile {
  const profile = typeof value === "string" ? value : "default";
  if (!(SEED_PROFILES as readonly string[]).includes(profile)) {
    throw new SandboxError(`unknown profile "${profile}"; expected ${SEED_PROFILES.join(", ")}`, {
      exitCode: 2,
    });
  }
  return profile as SeedProfile;
}

async function confirmDestructive(id: Identity, action: string, yes: boolean): Promise<void> {
  if (id.db === DEFAULT_DB) {
    throw new SandboxError(`refusing to ${action} the shared default database "${DEFAULT_DB}"`, {
      fix: "Sandboxes are per-worktree; run this from a worktree, not the primary checkout.",
    });
  }
  if (yes) return;
  if (!process.stdin.isTTY) {
    throw new SandboxError(`refusing to ${action} "${id.db}" without confirmation`, {
      exitCode: 2,
      fix: "Pass --yes.",
    });
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(`About to ${action} database "${id.db}". Continue? [y/N] `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) throw new SandboxError("Aborted.");
}

function describe(command: Command) {
  return {
    name: command.name,
    group: command.group,
    summary: command.summary,
    args: command.args ?? null,
    options: { ...command.options, ...GLOBAL_OPTIONS },
  };
}

function overview(): string[] {
  const lines = ["Usage: ./rhymelab-sandbox <command> [options] [--json]", ""];
  for (const group of ["Lifecycle", "Data", "Auth", "Flows", "Meta"] as const) {
    lines.push(`${group}:`);
    for (const c of COMMANDS.filter((cmd) => cmd.group === group)) {
      lines.push(`  ${`${c.name} ${c.args ?? ""}`.padEnd(22)} ${c.summary}`);
    }
    lines.push("");
  }
  lines.push("Run `./rhymelab-sandbox help <command>` for its options.");
  return lines;
}

function commandHelp(command: Command): string[] {
  const options = Object.entries({ ...command.options, ...GLOBAL_OPTIONS }).map(([name, spec]) => {
    const flag = `${spec.short ? `-${spec.short}, ` : ""}--${name}${spec.type === "string" ? " <value>" : ""}`;
    const fallback = spec.default === undefined ? "" : ` (default: ${spec.default})`;
    return `  ${flag.padEnd(26)} ${spec.description}${fallback}`;
  });
  return [
    `Usage: ./rhymelab-sandbox ${command.name}${command.args ? ` ${command.args}` : ""} [options]`,
    "",
    command.summary,
    "",
    "Options:",
    ...options,
  ];
}

function unknownCommand(name: string): SandboxError {
  return new SandboxError(`unknown command "${name}"`, {
    exitCode: 2,
    fix: "Run `./rhymelab-sandbox help` for the command list.",
  });
}

function emit(name: string, result: Result, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: result.ok, command: name, ...result.data })}\n`);
  } else if (result.text.length > 0) {
    process.stdout.write(`${result.text.join("\n")}\n`);
  }
}

/** Parse `argv`, run the named command, print its result, and return the exit code. */
export async function main(argv: string[]): Promise<number> {
  const json = argv.includes("--json");
  const index = argv.findIndex((arg) => !arg.startsWith("-"));
  const name = index === -1 ? "help" : (argv[index] ?? "help");
  const rest = index === -1 ? argv : [...argv.slice(0, index), ...argv.slice(index + 1)];
  try {
    const command = COMMANDS.find((c) => c.name === name);
    if (!command) throw unknownCommand(name);
    let parsed;
    try {
      parsed = parseArgs({
        args: rest,
        options: { ...command.options, ...GLOBAL_OPTIONS },
        allowPositionals: true,
        strict: true,
      });
    } catch (err) {
      throw new SandboxError((err as Error).message, {
        exitCode: 2,
        fix: `Run \`./rhymelab-sandbox help ${name}\`.`,
      });
    }
    if (parsed.values.help) {
      emit(name, { ok: true, data: describe(command), text: commandHelp(command) }, json);
      return 0;
    }
    const result = await command.run({
      id: identityFor(),
      values: parsed.values,
      positionals: parsed.positionals,
      json,
    });
    emit(name, result, json);
    return result.exitCode ?? (result.ok ? 0 : 1);
  } catch (err) {
    const known = err instanceof SandboxError;
    const message = (err as Error).message;
    const fix = known ? err.fix : undefined;
    if (json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, command: name, error: message, fix })}\n`,
      );
    } else {
      process.stderr.write(`error: ${message}\n${fix ? `  → ${fix}\n` : ""}`);
      if (!known) process.stderr.write(`${(err as Error).stack}\n`);
    }
    return known ? err.exitCode : 1;
  }
}
