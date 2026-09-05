-- Phase 1 — Annotation semantics v2.
--
-- Purge genuinely-dead annotation rows BEFORE tightening the column, then tighten
-- the schema. The annotations table was backed up out-of-band first (see
-- app/backend/api/.backups/) — the DELETEs below are unrecoverable from git.
--
-- Migration hygiene (D-20): only genuinely-dead rows are deleted here — tombstones
-- (soft-deleted), null-value rows, and off-palette values. Live rows whose span
-- is not a single non-blank line are NOT deleted; they are detached by the Phase 1
-- data script (scripts/detach-nonline-annotations.ts), never dropped (invariant 4).

-- 1. Tombstones: annotations that were soft-deleted (deleted_at). The column is
--    being removed, so these are dead-by-design.
DELETE FROM "annotations" WHERE "deleted_at" IS NOT NULL;

-- 2. Legacy null-value ("cleared") rows — no longer representable (value is NOT NULL now).
DELETE FROM "annotations" WHERE "value" IS NULL;

-- 3. Off-palette values (anything outside the A–F / X rhyme vocabulary).
DELETE FROM "annotations" WHERE "value" NOT IN ('A', 'B', 'C', 'D', 'E', 'F', 'X');

-- 4. value is now the required rhyme group.
ALTER TABLE "annotations" ALTER COLUMN "value" SET NOT NULL;

-- 5. Drop the annotation soft-delete column. Entry.deleted_at is untouched (D-3).
ALTER TABLE "annotations" DROP COLUMN "deleted_at";

-- 6. Optimistic-concurrency counter for entries (D-9). Bumped on every lyrics save.
ALTER TABLE "entries" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
