-- Make the `entries` timestamp stamps independent of the database session's
-- `TimeZone`.
--
-- The trigger added by `20260815120000_entry_updated_at_db_clock` assigns bare
-- `now()`, which is a `timestamptz`. Both target columns are `timestamp(3)
-- without time zone` — Prisma maps `DateTime` to a zoneless timestamp — so the
-- assignment is an implicit `timestamptz -> timestamp` cast, and *that* cast
-- reads the session's `TimeZone` to decide which wall clock to record.
--
-- Nothing pins that setting: `src/db.ts` builds `PrismaPg` from a bare
-- connection string carrying no timezone option, so the value is whatever the
-- server defaults to. On a UTC server (the dev container, and why this was
-- invisible locally) the cast is a no-op; on a server configured to a local zone
-- every stamp lands in local wall time while Prisma decodes it back as UTC:
--
--     SET TIME ZONE 'America/New_York';
--     SELECT (now())::timestamp(3)       -- 2026-08-16 20:17:38.208  <- stored
--          , (now() AT TIME ZONE 'UTC')  -- 2026-08-17 00:17:38.207  <- correct
--
-- Four hours out, and on the wrong calendar day.
--
-- `AT TIME ZONE 'UTC'` applied to a `timestamptz` yields the zoneless timestamp
-- *in UTC*, with no dependence on the session — which is what the columns have
-- always been read as meaning.
--
-- `now()` (not `clock_timestamp()`) is still deliberate, for the reason the
-- original migration gives: one identical stamp for every row a transaction
-- touches.
--
-- The trigger already shipped, so this replaces the function rather than editing
-- the applied migration.

-- The column defaults carry the same exposure and get the same fix: both were
-- `CURRENT_TIMESTAMP`, which is `timestamptz` exactly as `now()` is. (As the
-- previous migration notes, Prisma's own inserts never reach these — they are
-- for writers that don't go through the client. `created_at`'s default came from
-- the initial schema rather than that migration, but it is wrong in precisely
-- the same way, so it is corrected here too.) The expressions are parenthesised
-- because a non-constant column default has to be.
ALTER TABLE "entries" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "entries" ALTER COLUMN "updated_at" SET DEFAULT (now() AT TIME ZONE 'UTC');

CREATE OR REPLACE FUNCTION entries_stamp_timestamps() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."created_at" := now() AT TIME ZONE 'UTC';
  ELSE
    -- `created_at` is immutable once set: an UPDATE carrying a different value
    -- (Prisma sends the whole row on some paths) is discarded rather than
    -- honoured.
    NEW."created_at" := OLD."created_at";
  END IF;

  NEW."updated_at" := now() AT TIME ZONE 'UTC';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

-- No backfill. Rows already stamped are wrong only by the offset the writing
-- session's `TimeZone` had at the time, which is not recorded anywhere — there
-- is no expression that could correct them without knowing it. Every server that
-- has run the old trigger is UTC (the dev/CI container sets it; the migration is
-- not yet deployed anywhere else), so the offset is zero and existing rows are
-- already correct. A future non-UTC server would only ever produce correct rows,
-- because this migration lands before it.
