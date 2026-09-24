/**
 * Global hooks for DB-backed integration tests. There is no `afterEach`: tests
 * isolate themselves with `freshUser()` instead of resetting the database.
 */
import { afterAll, beforeAll } from "vitest";
import { cleanupRun, prisma } from "./integration-db";

beforeAll(async () => {
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
  await cleanupRun();
  await prisma.$disconnect();
});
