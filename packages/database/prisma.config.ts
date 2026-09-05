import { defineConfig } from "prisma/config";
import { withUtcTimeZone } from "../../app/backend/api/src/database-url";
import { loadEnv } from "../../app/backend/api/src/load-env";

loadEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: withUtcTimeZone(process.env["DATABASE_URL"]),
  },
});
