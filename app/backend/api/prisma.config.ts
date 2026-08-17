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
    // The CLI builds its own connection and never goes through `src/db.ts`, so
    // the pool's `TimeZone=UTC` startup option doesn't reach it. Pin it on the
    // URL instead, so a migration reaching for a bare `now()` can't inherit the
    // host's zone.
    url: withUtcTimeZone(process.env["DATABASE_URL"]),
  },
});
