import z from "zod";
import { LineAnnotationModelSchema, LyricEntryModelSchema } from "@rhymelab/database/schemas";
import { normalizeEntryBody } from "./lyricEntry.util";

const SONG_SPECIFIC_FIELDS = {
  album: true,
  artists: true,
} as const;

/**
 * The DB's sentinel `rhymeGroup` value for "deliberately unrhymed" (X). MUST NOT
 * appear on the wire — {@link readLineAnnotationSchema} maps it to
 * `{ rhymeGroup: null, unrhymed: true }`.
 */
export const UNRHYMED_SENTINEL = -1;

const entryBaseSchema = LyricEntryModelSchema.omit({
  kind: true,
});

export const poemEntrySchema = entryBaseSchema.omit(SONG_SPECIFIC_FIELDS).extend({
  kind: z.literal("poem"),
});

export const songEntrySchema = entryBaseSchema.omit({}).extend({
  kind: z.literal("song"),
});

/** A "proper typesafe" version of the {@link LyricEntryModelSchema} - discriminated union on `kind`. */
export const lyricEntrySchema = z.discriminatedUnion("kind", [poemEntrySchema, songEntrySchema]);

export const lyricEntryListItemSchema = LyricEntryModelSchema.pick({
  kind: true,
  id: true,
  title: true,
  body: true,
  authors: true,
  year: true,
  album: true,
  artists: true,
  createdAt: true,
  updatedAt: true,
})
  .extend({
    excerpt: z.string(),
    lineCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
  })
  .transform((datum) => ({
    authorsFormatted: formatAuthorList(datum.authors),
    updatedAtFormatted: formatSince(datum.updatedAt),
    bylineParts: buildBylineParts(datum),
    ...datum,
  }));

/**
 * A `LineAnnotation` row on the wire: the DB's `-1` sentinel is resolved to
 * `unrhymed`, so `rhymeGroup` is either a real song-wide group id or `null`.
 * Carries no `entryId`/timestamps — it is always nested under its entry.
 */
export const readLineAnnotationSchema = LineAnnotationModelSchema.pick({
  lineIndex: true,
  quote: true,
  rhymeGroup: true,
  enjambed: true,
})
  .extend({
    rhymeGroup: z
      .number()
      .int()
      .refine((value) => value === UNRHYMED_SENTINEL || value >= 1)
      .nullable(),
  })
  .transform(({ rhymeGroup, ...rest }) => ({
    ...rest,
    rhymeGroup: rhymeGroup === UNRHYMED_SENTINEL ? null : rhymeGroup,
    unrhymed: rhymeGroup === UNRHYMED_SENTINEL,
  }));

export const readLyricEntryDetailSchema = LyricEntryModelSchema.pick({
  kind: true,
  id: true,
  title: true,
  body: true,
  authors: true,
  year: true,
  album: true,
  artists: true,
  createdAt: true,
  updatedAt: true,
  structure: true,
}).extend({
  lineCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  annotations: z.array(readLineAnnotationSchema),
});

const createLyricEntrySchemaBase = entryBaseSchema
  .pick({
    title: true,
    body: true,
    authors: true,
    year: true,
    album: true,
    artists: true,
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

/**
 * Build the byline parts shown under an entry's title, in display order.
 * Songs yield artists, album, year. Poems yield authors, year.
 * Empty parts are dropped. The result MAY be empty.
 */
function buildBylineParts(datum: {
  kind: "song" | "poem";
  authors: readonly string[];
  artists: readonly string[];
  album?: string | null;
  year?: number | null;
}): string[] {
  const credits = datum.kind === "song" ? datum.artists : datum.authors;
  return [
    formatAuthorList(credits),
    datum.kind === "song" ? datum.album : null,
    datum.year === null || datum.year === undefined ? null : String(datum.year),
  ].filter((part): part is string => Boolean(part));
}

/**
 * Render an instant as a coarse "time ago" label ("just now", "3h ago", "2mo ago"),
 * relative to the moment the value is serialized.
 */
function formatSince(at: Date | string): string {
  const diff = Date.now() - (at instanceof Date ? at.getTime() : Date.parse(at));
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

function formatAuthorList(list: readonly string[]): string {
  if (list.length < 2) return list[0] ?? "";
  const last = list[list.length - 1];
  const rest = list.slice(0, -1);
  return `${rest.join(", ")}${rest.length > 1 ? "," : ""} & ${last}`;
}

export type LyricEntry = z.infer<typeof lyricEntrySchema>;
export type LyricEntryListItem = z.infer<typeof lyricEntryListItemSchema>;
export type ReadLyricEntryDetail = z.infer<typeof readLyricEntryDetailSchema>;
export type ReadLineAnnotation = z.infer<typeof readLineAnnotationSchema>;
export type CreateLyricEntryInput = z.infer<typeof createLyricEntrySchema>;
