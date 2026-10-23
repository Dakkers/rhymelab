/**
 * End-to-end regression suite for the sandbox itself: boot, probe, drive every
 * flow, break it, heal it, tear it down. Exits non-zero on the first failed
 * assertion. Pass `--keep` to leave the stack running afterwards.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { identityFor, REPO_ROOT } from "./identity.mts";
import { readRunState } from "./stack.mts";

const SHIM = resolve(REPO_ROOT, "rhymelab-sandbox");
const keep = process.argv.includes("--keep");
let failures = 0;

interface Run {
  code: number;
  json: Record<string, unknown>;
}

function sandbox(...args: string[]): Run {
  const result = spawnSync(SHIM, [...args, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}");
  } catch {}
  return { code: result.status ?? -1, json };
}

function check(label: string, ok: boolean, detail?: unknown): void {
  process.stdout.write(`${ok ? "✓" : "✗"} ${label}\n`);
  if (!ok) {
    failures++;
    if (detail !== undefined) process.stdout.write(`  ${JSON.stringify(detail)}\n`);
  }
}

function expectFlow(args: string[], outcome: string): void {
  const run = sandbox("flow", ...args, "--expect", outcome);
  check(`flow ${args.join(" ")} → ${outcome}`, run.code === 0, run.json);
}

const up = sandbox("up");
check("up boots the stack", up.code === 0 && up.json.ok === true, up.json);
if (up.code !== 0) process.exit(1);

const doctor = sandbox("doctor");
check("doctor is green", doctor.code === 0, doctor.json);

const again = sandbox("up");
check("a second up is a no-op", again.code === 0 && again.json.alreadyRunning === true, again.json);

const creds = sandbox("creds");
const res = await fetch(`${creds.json.apiUrl}/entries`, {
  headers: { cookie: String(creds.json.cookie) },
});
const entries = (await res.json()) as unknown[];
check("planted creds read the seeded library", res.status === 200 && entries.length >= 5, {
  status: res.status,
  entries: entries.length,
});

expectFlow(["login"], "ok");
expectFlow(["login", "--password", "not-the-password"], "rejected");
expectFlow(["forged-session"], "unauthorized");
expectFlow(["foreign-entry"], "not-found");
expectFlow(["browse", "--title", "Stopping by Woods on a Snowy Evening"], "ok");
expectFlow(["create-entry", "--title", "e2e entry", "--body", "one\\ntwo\\n\\nthree"], "created");
expectFlow(["edit-entry", "--last", "--structure", "verse,chorus"], "updated");
expectFlow(["delete-entry", "--last"], "deleted");
expectFlow(["lifecycle"], "ok");

const mismatch = sandbox("flow", "login", "--expect", "rejected");
check("a mismatched --expect exits 1", mismatch.code === 1, mismatch.json);

sandbox("flow", "create-entry", "--title", "to be reset");
const reset = sandbox("reset", "--yes");
const counts = reset.json.counts as { entries?: number } | undefined;
check(
  "soft reset leaves exactly the seeded corpus",
  reset.code === 0 && counts?.entries === 5,
  reset.json,
);

const status = sandbox("status");
check("status reports the detached servers", status.json.servers === "detached", status.json);

const killed = killApi();
const degraded = sandbox("doctor");
check("doctor exits 1 once the API dies", killed && degraded.code === 1, degraded.json);

const healed = sandbox("up");
const healedDoctor = sandbox("doctor");
check(
  "up heals a half-dead stack",
  healed.code === 0 && healedDoctor.code === 0,
  healedDoctor.json,
);

if (!keep) {
  const down = sandbox("down");
  const after = sandbox("doctor");
  check("down stops the stack and doctor says so", down.code === 0 && after.code === 1, after.json);
  const downAgain = sandbox("down");
  check("a second down is a no-op", downAgain.code === 0 && downAgain.json.stopped === false);
}

process.stdout.write(
  failures === 0 ? "\nsandbox e2e: all green\n" : `\nsandbox e2e: ${failures} failed\n`,
);
process.exit(failures === 0 ? 0 : 1);

function killApi(): boolean {
  const state = readRunState(identityFor());
  if (!state) return false;
  try {
    process.kill(-state.apiPid, "SIGKILL");
    return true;
  } catch {
    return false;
  }
}
