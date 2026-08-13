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
  id: z.uuidv4(),
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

/**
 * Fields a client submits to save a new piece — distinct from `EntrySummarySchema`:
 * it carries the full `body` text (the source of truth) rather than the derived
 * `excerpt`/`lineCount`/`wordCount`, and has no `id`/timestamps yet.
 */
const EntryCreateBaseSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim(),
  year: z.number().int().positive().optional(),
  /** The full saved text; `excerpt`, `lineCount`, and `wordCount` are derived from this. */
  body: z.string().trim().min(1),
});

const PoemCreateSchema = EntryCreateBaseSchema.extend({ kind: z.literal("poem") });

const LyricsCreateSchema = EntryCreateBaseSchema.extend({
  kind: z.literal("lyrics"),
  artist: z.string().trim().min(1),
  album: z.string().trim().min(1),
});

export const EntryCreateInputSchema = z.discriminatedUnion("kind", [
  PoemCreateSchema,
  LyricsCreateSchema,
]);
export type EntryCreateInput = z.infer<typeof EntryCreateInputSchema>;

/** Save a new piece. Returns the saved entry's summary, as `list` would render it. */
export const create = oc.input(EntryCreateInputSchema).output(EntrySummarySchema);
