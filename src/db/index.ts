import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * The Drizzle client over the D1 binding. Call `db()` inside a server function —
 * `env` comes from `cloudflare:workers`, so this module (and anything it pulls
 * in) must never reach the client bundle.
 */
export function db() {
  return drizzle(env.DB, { schema });
}
