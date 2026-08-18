-- AlterTable
-- The piece's structure: one section label per body section, in order. The
-- `DEFAULT ARRAY[]` only serves the create input's optional field — the write
-- path always supplies a correctly-sized array (see `structure` helpers in
-- `@rhymelab/api-contract`), and the backfill below sizes every existing row.
--
-- (Prisma's diff also wants to reset `created_at` / `updated_at` to
-- `CURRENT_TIMESTAMP` here — that's the recurring, un-expressible drift the
-- `entry_timestamps_utc` migration explains: the real defaults are
-- `(now() AT TIME ZONE 'UTC')`, which `@default(now())` can't render. Those
-- reverts are dropped on purpose; this migration only touches `structure`.)
ALTER TABLE "entries" ADD COLUMN "structure" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: give every existing row one `verse` per section, so the invariant
-- `structure.length = (number of body sections)` holds from the moment the
-- column exists rather than only after a row's next edit.
--
-- A section is a blank-line-separated block. This counts them the way
-- `splitSections` does: trim the body's outer whitespace, then split on a blank
-- line (a newline, optional intra-line whitespace, then one or more newlines).
-- `greatest(1, …)` floors a single-section body (no separator) at one section.
-- Best-effort for exotic legacy whitespace the JS trim treats differently (e.g.
-- a non-breaking-space-only line) — any such row self-heals on its next
-- `updateBody`, which re-syncs `structure` with the same JS `splitSections`.
UPDATE "entries"
SET "structure" = array_fill('verse'::text, ARRAY[
  greatest(1, coalesce(array_length(
    regexp_split_to_array(btrim("body", E' \t\r\n'), E'\n[ \t\r]*\n+'), 1), 1))
]);
