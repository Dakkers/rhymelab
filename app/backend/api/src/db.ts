import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./_generated/prisma/client";

/**
 * The Prisma client over Postgres, using the `pg` driver adapter. `DATABASE_URL`
 * must already be in the environment (see `load-env.ts`, called from `main.ts`
 * before this module is imported).
 *
 * `TimeZone` is pinned on every connection this pool opens. Postgres resolves
 * that setting from the server's `postgresql.conf`, then any `ALTER DATABASE` /
 * `ALTER ROLE` override — none of which is ours in a managed environment. A
 * `timestamptz -> timestamp` cast reads it, so an unpinned session makes the
 * stored wall clock a property of *where the database happens to be hosted*.
 *
 * Pinning it here rather than at database creation is deliberate: it holds for
 * every database this app connects to however that database came to exist —
 * including preview/branch databases spun up by the platform, which no
 * provisioning step of ours ever runs against. It also beats a server or
 * per-database default outright, since a session-level setting is the last word.
 *
 * This is belt-and-braces, not the fix: the `entries` trigger converts
 * explicitly (`now() AT TIME ZONE 'UTC'`) and so is correct regardless. What
 * this covers is everything that *doesn't* convert explicitly — column defaults,
 * ad-hoc SQL, `CURRENT_DATE`, and any future writer that reaches for a bare
 * `now()` without knowing this hazard exists.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
  // libpq-style startup options. Not a `?options=` query param on the URL,
  // because that would have to be threaded into every `DATABASE_URL` we or a
  // deploy platform ever writes; here it applies to all of them.
  options: "-c TimeZone=UTC",
});

export const prisma = new PrismaClient({ adapter });
