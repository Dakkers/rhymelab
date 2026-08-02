-- Sections are untyped now (labelled positionally as "Section N"); drop the
-- structural-type column. The verse/chorus/… concept lives in git history.
ALTER TABLE "sections" DROP COLUMN "type";
