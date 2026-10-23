import assert from "node:assert/strict";
import { test } from "node:test";
import { findSecrets, undeclaredReads, verifyEnv } from "./envcheck.mts";
import { REPO_ROOT } from "./identity.mts";

/** Fake secrets, assembled at runtime so no secret scanner mistakes this file for a leak. */
const PLANTED: [string, string][] = [
  ["STRIPE", ["sk", "live", "0FakeKey0".repeat(3)].join("_")],
  ["AWS", ["AK", "IA", "FAKEFAKEFAKEFAKE"].join("")],
  ["GH", ["gh", `p_${"a1B2c3D4e5".repeat(4)}`].join("")],
  ["DB", "postgresql://app:hunter2@ep-cool-name-123.us-east-2.aws.neon.tech/prod"],
  ["NEON", ["npg", "FakeFake12"].join("_")],
  ["RANDOM", "q8Z3vN7rT1xK5mW9pB2cF6hJ4yL0sD"],
];

for (const [key, value] of PLANTED) {
  test(`flags a planted ${key} secret`, () => {
    const findings = findSecrets(".env", `${key}="${value}"\n`);
    assert.equal(findings.length, 1, JSON.stringify(findings));
    assert.equal(findings[0]?.key, key);
  });
}

test("accepts the committed style of dummy values", () => {
  const text = [
    'DATABASE_URL="postgresql://rhymelab:rhymelab@localhost:5433/rhymelab"',
    'SESSION_SECRET="dev-only-insecure-session-secret-change-me-0123456789"',
    'APP_PASSWORD="password"',
    "VITE_API_URL=http://localhost:4000/api",
  ].join("\n");
  assert.deepEqual(findSecrets(".env", text), []);
});

test("reports variables the code reads but no committed file declares", () => {
  const reads = new Map([
    ["PORT", ["main.ts"]],
    ["NEW_THING", ["a.ts", "b.ts"]],
  ]);
  assert.deepEqual(undeclaredReads(reads, new Set(["PORT"])), [
    {
      file: "a.ts, b.ts",
      key: "NEW_THING",
      problem: "read by the code but missing from the committed defaults",
    },
  ]);
});

test("the repository's committed env files pass", () => {
  assert.deepEqual(verifyEnv(REPO_ROOT), []);
});
