import z from "zod";
import { EntryModelSchema } from "@rhymelab/database";
import { normalizeEntryBody } from "./lyricEntry.util";

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

export const lyricEntryListItemSchema = entryBaseSchema
  .pick({
    title: true,
    body: true,
    author: true,
    year: true,
    album: true,
    artist: true,
  })
  .extend({
    excerpt: z.string(),
    lineCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
  });

export const readLyricEntryDetailSchema = entryBaseSchema
  .pick({
    title: true,
    body: true,
    author: true,
    year: true,
    album: true,
    artist: true,
  })
  .extend({
    lineCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
  });

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
    kind: z.literal("song"),
  }),

  createLyricEntrySchemaBase.omit(SONG_SPECIFIC_FIELDS).extend({
    kind: z.literal("poem"),
  }),
]);

export type LyricEntry = z.infer<typeof lyricEntrySchema>;
export type LyricEntryListItem = z.infer<typeof lyricEntryListItemSchema>;
export type ReadLyricEntryDetail = z.infer<typeof readLyricEntryDetailSchema>;
export type CreateLyricEntryInput = z.infer<typeof createLyricEntrySchema>;
