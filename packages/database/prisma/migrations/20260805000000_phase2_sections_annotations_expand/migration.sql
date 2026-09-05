-- Phase 2 — Durable sections + duplicate sharing (R5): EXPAND step (§5.6).
--
-- Adds the Phase 2 addressing columns (annotations) and duplicate-link columns
-- (sections) as NULLABLE, plus every constraint/index that is already valid on
-- today's data (all new FK columns are NULL, so the FKs pass). The OLD absolute-
-- offset columns (annotations.start_offset/end_offset) and sections.label are KEPT
-- here — the JS backfill (scripts/backfill-phase2-addressing.ts) needs them to
-- compute the new (section_id, line_in_section, chars) addressing in JS (invariant
-- 5: never in SQL). The CONTRACT migration drops them afterwards.
--
-- BACK UP FIRST (out-of-band, kept until Phase 2 ships):
--   pg_dump "$DATABASE_URL" -t annotations -t sections > .backups/phase2_pre.sql

-- 1. Sections: duplicate-link columns (D-10/D-12). NULL canonical_section_id ⟺
--    standalone/canonical; manual_unlink = "exempt from auto-linking".
ALTER TABLE "sections" ADD COLUMN "canonical_section_id" INTEGER;
ALTER TABLE "sections" ADD COLUMN "manual_unlink" BOOLEAN NOT NULL DEFAULT false;

-- 2. Annotations: (section, line, chars) addressing (D-1/D-2). All nullable — the
--    backfill populates them, then CONTRACT drops start_offset/end_offset.
ALTER TABLE "annotations" ADD COLUMN "section_id" INTEGER;
ALTER TABLE "annotations" ADD COLUMN "line_in_section" INTEGER;
ALTER TABLE "annotations" ADD COLUMN "start_char" INTEGER;
ALTER TABLE "annotations" ADD COLUMN "end_char" INTEGER;

-- 3. Unique constraints (D-15). (entry_id, id) is the FK target for the same-entry
--    compound relations, so it must be a real UNIQUE CONSTRAINT (Postgres will not
--    reference a bare index). (entry_id, order_index) is DEFERRABLE so the
--    reconciler can reorder sections mid-transaction (SET CONSTRAINTS … DEFERRED)
--    without tripping the constraint between statements; Prisma's default name is
--    kept so its diff still matches (DEFERRABLE is invisible to Prisma).
ALTER TABLE "sections" ADD CONSTRAINT "sections_entry_id_id_key" UNIQUE ("entry_id", "id");
ALTER TABLE "sections" ADD CONSTRAINT "sections_entry_id_order_index_key" UNIQUE ("entry_id", "order_index") DEFERRABLE INITIALLY IMMEDIATE;

-- 4. Self-canonical guard (D-15) — invisible to Prisma's diff, so no drift.
ALTER TABLE "sections" ADD CONSTRAINT "sections_no_self_canonical" CHECK ("canonical_section_id" IS DISTINCT FROM "id");

-- 5. Same-entry compound foreign keys. Restrict is the loud backstop (D-14): the
--    app re-points/orphans rows before any section delete, so these fire only on a
--    bug rather than silently cascading a delete.
ALTER TABLE "sections" ADD CONSTRAINT "sections_entry_id_canonical_section_id_fkey" FOREIGN KEY ("entry_id", "canonical_section_id") REFERENCES "sections"("entry_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_entry_id_section_id_fkey" FOREIGN KEY ("entry_id", "section_id") REFERENCES "sections"("entry_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Indexes.
CREATE INDEX "sections_canonical_section_id_idx" ON "sections"("canonical_section_id");
CREATE INDEX "annotations_section_id_line_in_section_idx" ON "annotations"("section_id", "line_in_section");
