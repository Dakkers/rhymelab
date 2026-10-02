import { afterAll, beforeAll } from "vitest";
import { prisma } from "./integration-db";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Postgres at DATABASE_URL. Start the local database before running ` +
        `\`pnpm test:integration\`. Underlying error: ${cause}`,
    );
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
