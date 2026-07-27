import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit only *generates* SQL migrations from the schema here — it never
 * connects to a database. Applying them is Wrangler's job (`pnpm db:migrate:*`,
 * which runs `wrangler d1 migrations apply` against the `./drizzle` dir below).
 *
 * SQLite today (Cloudflare D1); the schema is written to migrate cleanly to
 * Postgres later, so avoid sqlite-only column tricks in `src/db/schema.ts`.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
