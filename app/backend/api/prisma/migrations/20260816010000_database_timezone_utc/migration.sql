-- Pin `timezone = 'UTC'` on the database itself, so every session gets it —
-- including the ones that never go through `src/db.ts`.
--
-- The application pool already pins `TimeZone=UTC` in its startup options, and
-- that remains the authoritative guarantee for app queries. This covers the
-- connections that pool doesn't own:
--
--   * the Prisma CLI, which connects straight from `DATABASE_URL` — so a future
--     migration doing a bare `now()` backfill inherits UTC rather than the
--     host's zone,
--   * psql sessions, one-off scripts, and any future service pointed at this
--     database.
--
-- As a migration, this runs against each database the schema is deployed to,
-- which is the point: a preview/branch database spun up by the platform gets it
-- when its migrations run, without any provisioning step of ours having to know
-- the database exists. Per-database settings are not copied by `CREATE DATABASE`
-- from a template, so this is the only thing that reliably reaches a fresh one.
--
-- `current_database()` via dynamic SQL because `ALTER DATABASE` takes a literal
-- identifier and the name differs everywhere: `rhymelab` locally,
-- `rhymelab_<worktree-slug>` under `./sandbox`, and whatever the platform names
-- a preview branch.
--
-- Note this affects *new* sessions only — the session running this migration
-- keeps the zone it started with. Nothing here depends on it taking effect
-- immediately.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'UTC');
EXCEPTION
  -- `ALTER DATABASE` requires *ownership* of the database — `GRANT ALL` is not
  -- enough. On a managed host the migration role may well not be the owner, and
  -- there the raised error would abort the migration and block the deploy over
  -- what is a defence-in-depth measure, not a correctness requirement: the
  -- `entries` trigger converts explicitly and the app pool pins its own session,
  -- so both are already correct without this. So a privilege failure degrades to
  -- a warning. Any other error still propagates.
  WHEN insufficient_privilege THEN
    RAISE WARNING
      'Could not set timezone=UTC on database %: %. The app pool pins TimeZone=UTC per-connection, so application writes are unaffected; sessions outside it (psql, the Prisma CLI) will inherit the server default. Grant ownership to fix.',
      current_database(), SQLERRM;
END $$;
