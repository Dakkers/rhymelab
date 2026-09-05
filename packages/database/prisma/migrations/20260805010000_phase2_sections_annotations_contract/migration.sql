-- Phase 2 — CONTRACT step (§5.6): drop the now-derived legacy columns.
--
-- RUN ONLY AFTER scripts/backfill-phase2-addressing.ts --apply has populated
-- (section_id, line_in_section, start_char, end_char) for every entry. The guard
-- below ABORTS the migration (rolling it back, data intact) if a live annotation
-- still lacks section_id — i.e. the backfill has not run. If that happens: run the
-- backfill, then `prisma migrate resolve --rolled-back <this migration>` and
-- `prisma migrate deploy` again.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "annotations" WHERE "detached" = false AND "section_id" IS NULL) THEN
    RAISE EXCEPTION 'Phase 2 contract aborted: live annotations still lack section_id — run scripts/backfill-phase2-addressing.ts --apply first';
  END IF;
END $$;

-- Absolute offsets are now derived from (section_id, line_in_section, chars).
ALTER TABLE "annotations" DROP COLUMN "start_offset";
ALTER TABLE "annotations" DROP COLUMN "end_offset";

-- Section labels are derived positionally ("Section N") into the DTO (D-16).
ALTER TABLE "sections" DROP COLUMN "label";
