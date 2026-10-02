import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");

const { initializeDb } = await import("../app/initializeDb");

/** The Prisma client for integration tests, connected to this run's throwaway database. */
export const prisma = initializeDb();
