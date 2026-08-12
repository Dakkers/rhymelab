-- Drop the product data model (entries / sections / annotations / entry_tags).
--
-- The workbench product surface was removed while the UX is redesigned from the
-- ground up (schema.prisma now defines no models). This drops the now-orphaned
-- tables so the DB matches the empty schema; the new model gets its own migration
-- once the UX settles.
--
-- DESTRUCTIVE: this deletes all entries, sections, annotations and tags. The
-- CASCADE clears each table's foreign keys (incl. the sections self-reference and
-- the annotations→sections link), so drop order doesn't matter.

-- DropTable
DROP TABLE IF EXISTS "annotations" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "entry_tags" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "sections" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "entries" CASCADE;
