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
  id: z.uuid(),
  title: z.string().trim().min(1),
  /** The writer — a poem's poet, or a song's lyricist. */
  author: z.string().trim(),
  /** Publication / release year, when known. */
  year: z.number().int().positive().optional(),
  /** A short preview of the opening lines, for the card body. */
  excerpt: z.string().trim(),
  lineCount: z.number().int().positive(),
  wordCount: z.number().int().positive(),
  /** ISO-8601 timestamps. */
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
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
