import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDotenv, sandboxEnv } from "./env.mts";
import { identityFor } from "./identity.mts";

test("parseDotenv strips quotes and skips comments", () => {
  assert.deepEqual(parseDotenv("# c\nA=\"x # y\"\nB=plain # note\nexport C='q'\n\nnot a var"), {
    A: "x # y",
    B: "plain",
    C: "q",
  });
});

test("the worktree's database and ports override the committed defaults", () => {
  const id = identityFor();
  const env = sandboxEnv(id, { web: 3333, api: 4444 });
  assert.equal(env.DATABASE_URL, id.dbUrl);
  assert.equal(env.PORT, "4444");
  assert.equal(env.FRONTEND_ORIGIN, "http://localhost:3333");
  assert.equal(env.VITE_API_URL, "http://localhost:4444/api");
  assert.equal(env.RHYMELAB_SANDBOX, "1");
  assert.ok(env.SESSION_SECRET && env.APP_PASSWORD, "committed defaults flow through");
});
