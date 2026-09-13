/**
 * Shared plumbing for the DB-backed integration tests. Imported by the global
 * hooks (`integration-setup.ts`, wired in as the integration project's
 * `setupFiles`) and by the test files themselves.
 *
 * Env is NOT auto-loaded by Vitest, and `../db` reads `DATABASE_URL` the moment
 * it's imported. `loadEnv()` runs here first, then `db` is pulled in via a
 * dynamic import so it's evaluated *after* — a static top-level `import` would be
 * hoisted above `loadEnv()` and build the Prisma client against an empty
 * connection string. Because Vitest evaluates `setupFiles` before the test
 * files, importing this module makes a plain `import { prisma }` safe everywhere
 * downstream.
 */
import { loadEnv } from "../load-env";

loadEnv();

const db = await import("../db");
export const prisma = db.prisma;

/**
 * A prefix unique to this test file's run. The tests never reset the database;
 * instead every row they write is scoped under this prefix, so a run is
 * insensitive to anything already in the DB — leftovers from a crashed run, rows
 * from a parallel test file, or a second run of this same suite. `Math.random`/
 * `Date.now` are fine here — this is an ordinary test process.
 *
 * Vitest isolates each test file in its own module graph, so this is distinct
 * per file, and `afterAll` cleanup scoped to it can't touch another file's rows.
 */
export const RUN = `itest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let seq = 0;

/**
 * A fresh, never-before-used userId under this run's scope. Give each test its
 * own so tests can't see each other's rows — the reason no per-test cleanup is
 * needed.
 */
export function freshUser(label = "u"): string {
  seq += 1;
  return `${RUN}-${label}-${seq}`;
}

/** Delete every row this run created. Scoped to `RUN`, so it's parallel-safe. */
export async function cleanupRun(): Promise<void> {
  await prisma.entry.deleteMany({ where: { userId: { startsWith: RUN } } });
}
