-- CreateEnum
CREATE TYPE "LyricEntryKind" AS ENUM ('poem', 'song');

-- CreateEnum
CREATE TYPE "LyricEntrySectionType" AS ENUM ('verse', 'chorus', 'bridge', 'prechorus', 'intro', 'outro', 'stanza', 'postchorus', 'refrain', 'interlude');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lyric_entries" (
    "id" UUID NOT NULL,
    "kind" "LyricEntryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "structure" "LyricEntrySectionType"[] DEFAULT ARRAY[]::"LyricEntrySectionType"[],
    "authors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "year" INTEGER,
    "artists" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "album" TEXT,
    "isrc" TEXT,
    "iswc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" UUID NOT NULL,

    CONSTRAINT "lyric_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "lyric_entries_kind_idx" ON "lyric_entries"("kind");

-- CreateIndex
CREATE INDEX "lyric_entries_user_id_deleted_at_idx" ON "lyric_entries"("user_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "lyric_entries" ADD CONSTRAINT "lyric_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
