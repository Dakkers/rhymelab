import { defineConfig } from "prisma/config";
import { withUtcTimeZone } from "./src/database-url";
import { loadEnv } from "./src/load-env";

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
