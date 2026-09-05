-- AlterTable
-- `author` and `artist` become lists: a piece can credit more than one writer or
-- performer. Absence is now `[]` rather than NULL, so the columns are NOT NULL
-- with an empty-array default. Existing single values are wrapped into a
-- one-element array; NULL (and the "" left by older rows) becomes `{}`.
ALTER TABLE "entries"
  ALTER COLUMN "author" DROP DEFAULT,
  ALTER COLUMN "author" TYPE TEXT[]
    USING CASE
      WHEN "author" IS NULL OR btrim("author") = '' THEN '{}'::TEXT[]
      ELSE ARRAY["author"]
    END,
  ALTER COLUMN "author" SET NOT NULL,
  ALTER COLUMN "author" SET DEFAULT '{}';

ALTER TABLE "entries"
  ALTER COLUMN "artist" DROP DEFAULT,
  ALTER COLUMN "artist" TYPE TEXT[]
    USING CASE
      WHEN "artist" IS NULL OR btrim("artist") = '' THEN '{}'::TEXT[]
      ELSE ARRAY["artist"]
    END,
  ALTER COLUMN "artist" SET NOT NULL,
  ALTER COLUMN "artist" SET DEFAULT '{}';
