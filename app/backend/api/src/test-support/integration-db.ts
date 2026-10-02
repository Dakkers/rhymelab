import { loadEnv } from "../load-env";

loadEnv();

const { initializeDb } = await import("../app/initializeDb");

/** The Prisma client for DB-backed integration tests. */
export const prisma = initializeDb();

/**
 * A prefix unique to this test file's run. Rows a test writes MUST be tagged
 * with it so cleanup never touches pre-existing data.
 */
export const RUN = `itest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
