/**
 * Entries procedures — a signed-in user's saved lyrics and poems.
 *
 * `EntrySummarySchema` is the row the Library list renders: enough to draw a card
 * without loading the full text. It's a discriminated union on `kind`, so the
 * lyrics-only fields (`artist` / `album`) exist only on the lyrics arm — reading
 * them is a type error until you've narrowed, the same XOR the frontend relied on
 * when this shape lived as a local stub.
 */
import { oc } from "@orpc/contract";
import { z } from "zod";

/** Fields every saved piece carries, whatever its kind. */
const EntryBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** The writer — a poem's poet, or a song's lyricist. */
  author: z.string(),
  /** Publication / release year. */
  year: z.number().int(),
  /** A short preview of the opening lines, for the card body. */
  excerpt: z.string(),
  lineCount: z.number().int(),
  wordCount: z.number().int(),
  /** Epoch milliseconds. */
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

/** A poem — carries none of the lyrics-only fields. */
export const PoemEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("poem"),
});

/** A song's lyrics — adds the performer and the record it appears on. */
export const LyricsEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("lyrics"),
  /** The performing artist or band. */
  artist: z.string(),
  album: z.string(),
});

/** A saved piece: a poem or a song's lyrics, discriminated by `kind`. */
export const EntrySummarySchema = z.discriminatedUnion("kind", [
  PoemEntrySchema,
  LyricsEntrySchema,
]);

export type EntrySummary = z.infer<typeof EntrySummarySchema>;
export type EntryKind = EntrySummary["kind"];

/** List the current user's saved entries. The handler returns them newest-first. */
export const list = oc.input(z.void()).output(z.array(EntrySummarySchema));
