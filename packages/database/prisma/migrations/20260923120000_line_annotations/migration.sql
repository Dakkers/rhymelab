-- CreateTable
CREATE TABLE "line_annotations" (
    "entry_id" UUID NOT NULL,
    "line_index" INTEGER NOT NULL,
    "quote" TEXT NOT NULL,
    "rhyme_group" INTEGER,
    "enjambed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_annotations_pkey" PRIMARY KEY ("entry_id","line_index")
);

-- CreateIndex
CREATE INDEX "line_annotations_entry_id_rhyme_group_idx" ON "line_annotations"("entry_id", "rhyme_group");

-- AddForeignKey
ALTER TABLE "line_annotations" ADD CONSTRAINT "line_annotations_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "lyric_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddCheckConstraint
ALTER TABLE "line_annotations" ADD CONSTRAINT "line_annotations_line_index_check" CHECK ("line_index" >= 0);
ALTER TABLE "line_annotations" ADD CONSTRAINT "line_annotations_rhyme_group_check" CHECK ("rhyme_group" = -1 OR "rhyme_group" >= 1);

-- AddComment
COMMENT ON COLUMN "line_annotations"."rhyme_group" IS 'Song-wide rhyme group id (>= 1). -1 = deliberately unrhymed (X). NULL = not annotated.';
COMMENT ON COLUMN "line_annotations"."line_index" IS '0-based index among the entry body''s lines, song-wide (not per section).';
