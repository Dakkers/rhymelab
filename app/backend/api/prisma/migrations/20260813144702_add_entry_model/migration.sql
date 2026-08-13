-- CreateTable
CREATE TABLE "entries" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "year" INTEGER,
    "excerpt" TEXT NOT NULL,
    "line_count" INTEGER NOT NULL,
    "word_count" INTEGER NOT NULL,
    "artist" TEXT,
    "album" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entries_user_id_idx" ON "entries"("user_id");

-- CreateIndex
CREATE INDEX "entries_kind_idx" ON "entries"("kind");
