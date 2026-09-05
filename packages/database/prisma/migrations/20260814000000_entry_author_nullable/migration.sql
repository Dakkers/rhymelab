-- AlterTable
-- `author` joins `year` / `artist` / `album` as nullable, so every optional field
-- records absence the same way. Rows written while the column was NOT NULL stored
-- an omitted author as "" — normalize those to NULL.
ALTER TABLE "entries" ALTER COLUMN "author" DROP NOT NULL;

UPDATE "entries" SET "author" = NULL WHERE "author" = '';
