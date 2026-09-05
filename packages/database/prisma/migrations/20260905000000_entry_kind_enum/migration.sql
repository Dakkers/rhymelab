CREATE TYPE "EntryKind" AS ENUM ('poem', 'song');

ALTER TABLE "entries" ALTER COLUMN "kind" TYPE "EntryKind" USING ("kind"::"EntryKind");
