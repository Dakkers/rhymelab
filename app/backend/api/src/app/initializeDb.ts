import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@rhymelab/database";

export function initializeDb() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    options: "-c TimeZone=UTC",
  });

  return new PrismaClient({ adapter });
}
