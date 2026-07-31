import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./_generated/prisma/client";

/**
 * The Prisma client over Postgres, using the `pg` driver adapter. `DATABASE_URL`
 * must already be in the environment (see `load-env.ts`, called from `main.ts`
 * before this module is imported).
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });

export const prisma = new PrismaClient({ adapter });
