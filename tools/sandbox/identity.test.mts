import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseName, identityFor, slugify } from "./identity.mts";

test("slugify folds every non-alphanumeric run to one underscore", () => {
  assert.equal(slugify("PR-67 merge--conflicts_2c9984"), "pr_67_merge_conflicts_2c9984");
  assert.equal(slugify("--edge--"), "edge");
});

test("the primary checkout keeps the shared database; worktrees get their own", () => {
  assert.equal(databaseName("rhymelab"), "rhymelab");
  assert.equal(databaseName("rhymelab_feature"), "rhymelab_feature");
  assert.equal(databaseName("feature"), "rhymelab_feature");
});

test("long names fit Postgres's limit and stay distinct", () => {
  const a = databaseName(`${"x".repeat(70)}_one`);
  const b = databaseName(`${"x".repeat(70)}_two`);
  assert.ok(a.length <= 63 && b.length <= 63);
  assert.notEqual(a, b);
});

test("identity is deterministic per directory", () => {
  const first = identityFor("/tmp/some/worktree-abc");
  const second = identityFor("/tmp/other/worktree-abc");
  assert.deepEqual(
    { db: first.db, web: first.webBase, api: first.apiBase },
    { db: second.db, web: second.webBase, api: second.apiBase },
  );
  assert.equal(first.apiBase - first.webBase, 1000);
});
