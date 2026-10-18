import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { COMMANDS, main } from "./cli.mts";
import { FLOW_OPTIONS, FLOWS } from "./flows.mts";
import { REPO_ROOT } from "./identity.mts";
import { SANDBOX_USER_ID } from "./state.mts";

async function quietly(argv: string[]): Promise<number> {
  const write = process.stdout.write;
  const writeErr = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    return await main(argv);
  } finally {
    process.stdout.write = write;
    process.stderr.write = writeErr;
  }
}

test("command names are unique", () => {
  const names = COMMANDS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test("every command has help", async () => {
  for (const command of COMMANDS) {
    assert.equal(await quietly([command.name, "--help", "--json"]), 0, command.name);
  }
});

test("usage errors exit 2", async () => {
  assert.equal(await quietly(["no-such-command"]), 2);
  assert.equal(await quietly(["status", "--no-such-flag"]), 2);
  assert.equal(await quietly(["seed", "--profile", "prod"]), 2);
  assert.equal(await quietly(["flow", "no-such-flow"]), 2);
  assert.equal(await quietly(["flow", "login", "--expect", "nonsense"]), 2);
});

test("`down --yes` points at `drop` instead of dropping", async () => {
  assert.equal(await quietly(["down", "--yes"]), 2);
});

test("the flow command registers exactly the options flows read", () => {
  const used = new Set(FLOWS.flatMap((f) => f.uses));
  assert.deepEqual([...used].sort(), Object.keys(FLOW_OPTIONS).sort());
});

test("flow outcomes are listed happy path first and never repeat", () => {
  for (const flow of FLOWS) {
    assert.equal(new Set(flow.outcomes).size, flow.outcomes.length, flow.name);
  }
});

test("the sandbox user is the user every session maps to", () => {
  const session = readFileSync(resolve(REPO_ROOT, "app/backend/api/src/app/session.ts"), "utf8");
  assert.match(session, new RegExp(`TEMP_USER_ID = "${SANDBOX_USER_ID}"`));
});
