-- Move `entries.updated_at` off the application clock and onto the database's.
--
-- Prisma's `@updatedAt` is a client-side feature: it does not compile to SQL, it
-- computes `new Date()` in Node and sends the result as a bind parameter. Every
-- `updated_at` written so far therefore carries the API server's clock, not
-- Postgres's — so the column drifts if the two hosts disagree, and comparing it
-- against `now()` in SQL is meaningless. `created_at` never had this problem:
-- `@default(now())` is a real column default and already resolves DB-side.
--
-- The fix is symmetric with `created_at`: give the column a DB default for the
-- INSERT, and a BEFORE UPDATE trigger for every subsequent write. `@updatedAt`
-- comes off the Prisma model in the same change, so the client stops sending a
-- value at all and the database is the only writer.
--
-- `now()` (not `clock_timestamp()`) is deliberate: it is the transaction's start
-- time, so every row touched by one transaction gets one identical stamp, and it
-- matches what `@default(now())` already compiles to for `created_at`.

-- A column default is not enough on its own. Verified against this client: with
-- the `prisma-client` generator and the pg driver adapter, Prisma resolves
-- `@default(now())` itself and binds a Node timestamp on INSERT, so the default
-- never fires. It is set anyway for the benefit of writers that don't go through
-- Prisma (migrations, psql, future services), but the trigger below is what
-- actually guarantees the value.
ALTER TABLE "entries" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- Named generically and created with OR REPLACE so the next table that needs
-- this reuses the one function rather than cloning it.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- INSERT as well as UPDATE, and unconditional in both: the stamp is not the
-- caller's to choose, so a client that sends its own `updated_at` (deliberately,
-- or — as Prisma does on INSERT — by accident) is overridden rather than
-- honoured. The cost is that `updated_at` is no longer settable from a test or a
-- backfill; anything that wants a chosen ordering has to touch rows in that
-- order instead.
DROP TRIGGER IF EXISTS entries_set_updated_at ON "entries";
CREATE TRIGGER entries_set_updated_at
  BEFORE INSERT OR UPDATE ON "entries"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
