import z from "zod";
import { EntryModelSchema } from "@rhymelab/database";
import { deriveEntrySummaryFields, normalizeEntryBody } from "./lyricEntry.util";

export const sectionTypeSchema = z.enum([
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "outro",
]);

const SONG_SPECIFIC_FIELDS = {
  album: true,
  artist: true,
} as const;

const entryBaseSchema = EntryModelSchema.omit({
  kind: true,
});

export const poemEntrySchema = entryBaseSchema.omit(SONG_SPECIFIC_FIELDS).extend({
  kind: z.literal("poem"),
});

export const songEntrySchema = entryBaseSchema.omit({}).extend({
  kind: z.literal("song"),
});

/** A "proper typesafe" version of the {@link EntryModelSchema} - discriminated union on `kind`. */
export const lyricEntrySchema = z.discriminatedUnion("kind", [poemEntrySchema, songEntrySchema]);

export const readLyricEntryListItemSchema = entryBaseSchema
  .pick({
    title: true,
    body: true,
    author: true,
    year: true,
    album: true,
    artist: true,
  })
  .transform(({ body, ...rest }) => ({
    ...rest,
    ...deriveEntrySummaryFields(body),
  }));

export const readLyricEntryDetailSchema = entryBaseSchema
  .pick({
    title: true,
    body: true,
    author: true,
    year: true,
    album: true,
    artist: true,
  })
  .transform((attrs) => ({
    ...attrs,
    ...deriveEntrySummaryFields(attrs.body),
  }));

const createLyricEntrySchemaBase = entryBaseSchema
  .pick({
    title: true,
    body: true,
    author: true,
    year: true,
    album: true,
    artist: true,
  })
  .extend({
    body: z.string().transform(normalizeEntryBody),
  });

export const createLyricEntrySchema = z.discriminatedUnion("kind", [
  createLyricEntrySchemaBase.omit({}).extend({
    kind: "song",
  }),

  createLyricEntrySchemaBase.omit(SONG_SPECIFIC_FIELDS).extend({
    kind: "poem",
  }),
]);

export type LyricEntry = z.infer<typeof lyricEntrySchema>;
export type LyricEntrySectionType = z.infer<typeof sectionTypeSchema>;
