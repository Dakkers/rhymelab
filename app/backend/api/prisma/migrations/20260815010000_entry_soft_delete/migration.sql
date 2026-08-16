-- AlterTable
-- Soft-delete tombstone. NULL (the default for every existing row) means live,
-- so nothing currently in the table is affected.
ALTER TABLE "entries" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
-- The library read is "this user's live entries", so index the pair.
CREATE INDEX "entries_user_id_deleted_at_idx" ON "entries"("user_id", "deleted_at");

-- DropIndex
-- Redundant now: `user_id` is the leading column of the index above, so a
-- lookup on it alone is served there. Keeping both would cost a second b-tree
-- update on every insert / update / delete for no query's benefit.
DROP INDEX "entries_user_id_idx";
