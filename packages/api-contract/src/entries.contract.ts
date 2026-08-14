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

/**
 * Derive the list-view fields (`excerpt`, `lineCount`, `wordCount`) from an
 * entry's `body`. Kept beside the schema they populate and shared by the API
 * handler (which derives them on read) and the web MSW mock (which mirrors it),
 * so the two can't drift. A line is anything between newlines, blank ones
 * included; `excerpt` previews the opening non-blank lines.
 */
export function deriveEntrySummaryFields(body: string): {
  excerpt: string;
  lineCount: number;
  wordCount: number;
} {
  const lines = body.split("\n");
  const excerpt =
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" / ") || body.trim();
  return {
    excerpt,
    lineCount: lines.length,
    wordCount: body.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * A saved entry as it's stored: the full `body` plus the nullable columns, before
 * any of it is dressed for the wire. Declared structurally rather than imported
 * from the backend's generated Prisma client — a shared package can't depend on
 * the app — so Prisma's `Entry` is assignable to it and `toEntrySummary` accepts
 * a real row unchanged.
 */
export type EntryRow = {
  id: string;
  userId: string;
  kind: string;
  title: string;
  author: string | null;
  year: number | null;
  /** The full saved text; the summary's derived fields come from this. */
  body: string;
  artist: string | null;
  album: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Map a stored row onto the wire shape this contract promises: derive the
 * list-view fields from `body`, collapse the nullable columns onto the contract's
 * shape (`author` a plain string, `year` absent when unset), and attach the
 * lyrics-only fields on that arm alone.
 *
 * Lives here beside the schema it satisfies, not in the API, because three
 * callers need the same mapping — the handler, the web MSW mock, and the fixtures
 * package — and a second copy is a drift waiting to happen.
 */
export function toEntrySummary(entry: EntryRow): EntrySummary {
  const base = {
    id: entry.id,
    title: entry.title,
    author: entry.author ?? "",
    year: entry.year ?? undefined,
    ...deriveEntrySummaryFields(entry.body),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };

  return entry.kind === "lyrics"
    ? { ...base, kind: "lyrics", artist: entry.artist ?? "", album: entry.album ?? "" }
    : { ...base, kind: "poem" };
}

/** List the current user's saved entries. The handler returns them newest-first. */
export const list = oc.input(z.void()).output(z.array(EntrySummarySchema));

/**
 * Fields a client submits to save a new piece — distinct from `EntrySummarySchema`:
 * it carries the full `body` text (the source of truth) rather than the derived
 * `excerpt`/`lineCount`/`wordCount`, and has no `id`/timestamps yet.
 */
const EntryCreateBaseSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().optional(),
  year: z.number().int().positive().optional(),
  /** The full saved text; `excerpt`, `lineCount`, and `wordCount` are derived from this. */
  body: z.string().trim().min(1),
});

const PoemCreateSchema = EntryCreateBaseSchema.extend({ kind: z.literal("poem") });

const LyricsCreateSchema = EntryCreateBaseSchema.extend({
  kind: z.literal("lyrics"),
  artist: z.string().trim().optional(),
  album: z.string().trim().optional(),
});

export const EntryCreateInputSchema = z.discriminatedUnion("kind", [
  PoemCreateSchema,
  LyricsCreateSchema,
]);
export type EntryCreateInput = z.infer<typeof EntryCreateInputSchema>;

/** Save a new piece. Returns the saved entry's summary, as `list` would render it. */
export const create = oc.input(EntryCreateInputSchema).output(EntrySummarySchema);
