-- Move `entries.created_at` and `entries.updated_at` off the application clock
-- and onto the database's.
--
-- Neither Prisma attribute does what its name suggests. `@updatedAt` is a
-- client-side feature: it does not compile to SQL, it computes `new Date()` in
-- Node and sends the result as a bind parameter. `@default(now())` *does* emit a
-- real `DEFAULT CURRENT_TIMESTAMP` in the DDL, but with the `prisma-client`
-- generator and the pg driver adapter the client resolves `now()` itself and
-- binds a Node timestamp on INSERT, so the default never fires. Verified against
-- this client: both columns have been carrying the API server's clock.
--
-- That drifts from the database whenever the two hosts disagree, and makes any
-- SQL-side comparison against `now()` meaningless. It also can't be fixed for one
-- column alone: stamping `updated_at` DB-side while `created_at` stayed app-side
-- would let a freshly inserted row have `created_at` *later* than `updated_at`
-- whenever the app host ran ahead. Both columns move together, or neither does.
--
-- So: a trigger, not a default, is what actually guarantees the values, and the
-- `@updatedAt` attribute comes off the Prisma model in the same change so the
-- client stops offering an opinion at all.
--
-- `now()` (not `clock_timestamp()`) is deliberate: it is the transaction's start
-- time, so every row touched by one transaction gets one identical stamp.

-- Kept for writers that don't go through Prisma (migrations, psql, future
-- services). Prisma's own inserts never reach it — the trigger below is the
-- guarantee.
ALTER TABLE "entries" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- Deliberately named for the table it serves rather than generically: it hard-
-- codes both column names, and plpgsql resolves those at execution time, so
-- attaching a "reusable" version of this to a table shaped differently would
-- create cleanly and then fail on that table's first write. A second table that
-- wants this behaviour should get its own function.
CREATE OR REPLACE FUNCTION entries_stamp_timestamps() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."created_at" := now();
  ELSE
    -- `created_at` is immutable once set: an UPDATE carrying a different value
    -- (Prisma sends the whole row on some paths) is discarded rather than
    -- honoured.
    NEW."created_at" := OLD."created_at";
  END IF;

  NEW."updated_at" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

-- INSERT as well as UPDATE, and unconditional in both: the stamps are not the
-- caller's to choose, so a client that sends its own (deliberately, or — as
-- Prisma does on INSERT — by accident) is overridden. The cost is that neither
-- column is settable any more, from a test or a backfill; anything that wants a
-- chosen ordering has to touch rows in that order instead.
DROP TRIGGER IF EXISTS entries_set_updated_at ON "entries";
DROP TRIGGER IF EXISTS entries_stamp_timestamps ON "entries";
CREATE TRIGGER entries_stamp_timestamps
  BEFORE INSERT OR UPDATE ON "entries"
  FOR EACH ROW
  EXECUTE FUNCTION entries_stamp_timestamps();

-- The generic-name first draft of this migration, if it was ever applied.
DROP FUNCTION IF EXISTS set_updated_at();
