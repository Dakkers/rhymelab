import z from "zod";
import { EntryModelSchema } from "@rhymelab/database";

const entryBaseSchema = EntryModelSchema.omit({
  kind: true,
});

export const poemEntrySchema = entryBaseSchema
  .omit({
    year: true,
    album: true,
    artist: true,
  })
  .extend({
    kind: z.literal("poem"),
  });

export const songEntrySchema = entryBaseSchema.omit({}).extend({
  kind: z.literal("song"),
});

export const lyricEntrySchema = z.discriminatedUnion("kind", [poemEntrySchema, songEntrySchema]);

/** Zod form of {@link SECTION_TYPES}, for the schemas below. */
export const sectionTypeSchema = z.enum([
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "outro",
]);
