-- Annotations are single-purpose now: a line span carrying a rhyme group. The
-- multi-mode machinery is gone (rhyme-scheme was the only mode), notes (`body`)
-- and the per-theme hue (`color`) went with the other lenses. Drop the dead
-- columns and the mode index. The removed lenses live in git history.
DROP INDEX "annotations_entry_id_mode_idx";

ALTER TABLE "annotations"
  DROP COLUMN "mode",
  DROP COLUMN "body",
  DROP COLUMN "color";
