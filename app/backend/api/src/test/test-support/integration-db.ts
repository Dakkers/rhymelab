/**
 * Shared setup for DB-backed integration tests.
 *
 * `../db` reads `DATABASE_URL` on import, so it MUST be imported dynamically
 * after `loadEnv()`; a static import would be hoisted above it.
 */
import { loadEnv } from "../load-env";

loadEnv();

const db = await import("../db");
export const prisma = db.prisma;

/**
 * A prefix unique to each test file's run. The database is never reset;
 * scoping rows under this prefix isolates runs from existing data.
 */
export const RUN = `itest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let seq = 0;

/** A new userId under this run's scope. Each test SHOULD use its own. */
export function freshUser(label = "u"): string {
  seq += 1;
  return `${RUN}-${label}-${seq}`;
}

/** Delete every row this run created. */
export async function cleanupRun(): Promise<void> {
  await prisma.entry.deleteMany({ where: { userId: { startsWith: RUN } } });
}
