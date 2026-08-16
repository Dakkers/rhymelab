-- AlterTable
-- Soft-delete tombstone. NULL (the default for every existing row) means live,
-- so nothing currently in the table is affected.
ALTER TABLE "entries" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
-- The library read is "this user's live entries", so index the pair.
CREATE INDEX "entries_user_id_deleted_at_idx" ON "entries"("user_id", "deleted_at");
