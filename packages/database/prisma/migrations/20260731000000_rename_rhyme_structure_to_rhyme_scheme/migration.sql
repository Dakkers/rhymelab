-- Rename the "rhyme-structure" annotation mode to "rhyme-scheme".
-- The mode column is a plain String (the zod contract is the validator), so
-- existing rows must be migrated explicitly.
UPDATE "annotations" SET "mode" = 'rhyme-scheme' WHERE "mode" = 'rhyme-structure';
