/**
 * Global before/after hooks for every DB-backed integration test file, wired in
 * as the integration project's `setupFiles` (see `.config/vitest.config.ts`).
 * Keeping them here means the test files hold assertions only — no per-file
 * connection ceremony.
 *
 * Note there's no `afterEach`: the suite deliberately does NOT reset the database
 * between tests. Each test scopes its rows under a unique `freshUser()`, so tests
 * are idempotent against pre-existing data instead of depending on a clean slate.
 */
import { afterAll, beforeAll } from "vitest";
import { cleanupRun, prisma } from "./integration-db";

beforeAll(async () => {
  // Fail loudly (not a silent skip) if Postgres is unreachable — these are
  // integration tests, so a green run must mean the DB was actually exercised.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Postgres at DATABASE_URL=${process.env.DATABASE_URL ?? "(unset)"}. ` +
        `Start the local database (see compose.yaml: host port 5433) before running ` +
        `\`pnpm test:integration\`. Underlying error: ${cause}`,
    );
  }
});

afterAll(async () => {
  // One sweep at the end of the file — tidy on the happy path — rather than a
  // reset per test. A crashed run may leave a few rows, but the unique run scope
  // means they never affect a later run.
  await cleanupRun();
  await prisma.$disconnect();
});
