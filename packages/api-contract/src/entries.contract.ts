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
  /**
   * The writers — a poem's poet(s), or a song's lyricist(s). Ordered as credited;
   * empty when no author was given.
   */
  author: z.array(z.string().trim()),
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
  /** The performing artists or bands, ordered as credited; empty when unknown. */
  artist: z.array(z.string().trim()),
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
 * List the current user's saved entries. The handler returns them newest-first.
 *
 * Served over REST as `GET /api/entries` — the `.route({ method, path })` here
 * (and on every procedure below) is what lets oRPC's `OpenAPIHandler` map it to
 * an HTTP verb and path; an un-annotated procedure would fall back to a default
 * `POST /<key>` route.
 *
 * Takes no input, so it omits `.input()` rather than declaring `z.void()`: over
 * OpenAPI a bodyless request decodes to `{}`, which `z.void()` would reject.
 */
export const list = oc
  .route({ method: "GET", path: "/entries" })
  .output(z.array(EntrySummarySchema));

/**
 * Fields a single saved piece carries for the detail view — `EntryBaseSchema`
 * with the derived preview fields (`excerpt`/`lineCount`/`wordCount`) swapped
 * for the full `body` text, since the detail view renders the whole piece
 * rather than a preview card.
 */
const EntryDetailBaseSchema = EntryBaseSchema.pick({
  id: true,
  title: true,
  author: true,
  year: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  body: z.string().trim(),
});

/** A poem's detail shape — carries none of the lyrics-only fields. */
export const PoemDetailSchema = EntryDetailBaseSchema.extend({
  kind: z.literal("poem"),
});

/** A song's lyrics detail shape — adds the performer and the record it's on. */
export const LyricsDetailSchema = EntryDetailBaseSchema.extend({
  kind: z.literal("lyrics"),
  artist: z.array(z.string().trim()),
  album: z.string(),
});

/** A saved piece's full detail: a poem or a song's lyrics, discriminated by `kind`. */
export const EntryDetailSchema = z.discriminatedUnion("kind", [
  PoemDetailSchema,
  LyricsDetailSchema,
]);

export type EntryDetail = z.infer<typeof EntryDetailSchema>;

/**
 * Fetch a single saved piece by id. The handler 404s (`NOT_FOUND`) both when the
 * id doesn't exist and when it belongs to another user — the two look identical
 * to the caller, so existence can't be probed for a piece you don't own.
 *
 * Served as `GET /api/entries/{id}` — the `{id}` path segment binds to the `id`
 * input field.
 */
export const get = oc
  .route({ method: "GET", path: "/entries/{id}" })
  .input(z.object({ id: z.uuidv4() }))
  .output(EntryDetailSchema);

/**
 * Delete a saved piece. The delete is *soft* — the row is tombstoned and stops
 * appearing anywhere, but survives in the database, so this stays recoverable by
 * hand. 404s on an unknown id and on another user's piece alike, for the same
 * reason `get` does.
 *
 * Named `remove` here because `delete` is a reserved word and can't be an export
 * binding; it's exposed on the contract as `entries.delete` and served as
 * `DELETE /api/entries/{id}`.
 */
export const remove = oc
  .route({ method: "DELETE", path: "/entries/{id}" })
  .input(z.object({ id: z.uuidv4() }))
  .output(z.object({ ok: z.literal(true) }));

/**
 * Fields a client submits to save a new piece — distinct from `EntrySummarySchema`:
 * it carries the full `body` text (the source of truth) rather than the derived
 * `excerpt`/`lineCount`/`wordCount`, and has no `id`/timestamps yet.
 */
const EntryCreateBaseSchema = z.object({
  title: z.string().trim().min(1),
  // Defaulted rather than optional so the write path always receives a list and
  // never has to decide what an omitted author means.
  author: z.array(z.string().trim().min(1)).default([]),
  year: z.number().int().positive().optional(),
  /** The full saved text; `excerpt`, `lineCount`, and `wordCount` are derived from this. */
  body: z.string().trim().min(1),
});

const PoemCreateSchema = EntryCreateBaseSchema.extend({ kind: z.literal("poem") });

const LyricsCreateSchema = EntryCreateBaseSchema.extend({
  kind: z.literal("lyrics"),
  artist: z.array(z.string().trim().min(1)).default([]),
  album: z.string().trim().optional(),
});

export const EntryCreateInputSchema = z.discriminatedUnion("kind", [
  PoemCreateSchema,
  LyricsCreateSchema,
]);
export type EntryCreateInput = z.infer<typeof EntryCreateInputSchema>;

/**
 * Save a new piece. Returns the saved entry's summary, as `list` would render it.
 * Served as `POST /api/entries`, answering `201 Created` on success.
 */
export const create = oc
  .route({ method: "POST", path: "/entries", successStatus: 201 })
  .input(EntryCreateInputSchema)
  .output(EntrySummarySchema);
