/**
 * Zod schemas for entries — a signed-in user's saved lyrics and poems.
 *
 * `entrySummarySchema` is the row the Library list renders: enough to draw a card
 * without loading the full text. It's a discriminated union on `kind`, so the
 * lyrics-only fields (`artist` / `album`) exist only on the lyrics arm — reading
 * them is a type error until you've narrowed, the same XOR the frontend relied on
 * when this shape lived as a local stub.
 */

import { z } from "zod";
import { normalizeEntryBody, SECTION_TYPES } from "./entries.util";

/** Fields every saved piece carries, whatever its kind. */
const entryBaseSchema = z.object({
  id: z.uuidv4(),
  title: z.string().trim().min(1),
  author: z.array(z.string().trim()),
  body: z.string().trim(),
  year: z.number().int().positive().optional(),
  excerpt: z.string().trim(),
  lineCount: z.number().int().positive(),
  wordCount: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** A poem — carries none of the lyrics-only fields. */
export const poemEntrySchema = entryBaseSchema.extend({
  kind: z.literal("poem"),
});

/** A song's lyrics — adds the performer and the record it appears on. */
export const lyricsEntrySchema = entryBaseSchema.extend({
  kind: z.literal("lyrics"),
  /** The performing artists or bands, ordered as credited; empty when unknown. */
  artist: z.array(z.string().trim()),
  album: z.string(),
});

/** A saved piece: a poem or a song's lyrics, discriminated by `kind`. */
export const entrySummarySchema = z.discriminatedUnion("kind", [
  poemEntrySchema,
  lyricsEntrySchema,
]);

/** Zod form of {@link SECTION_TYPES}, for the schemas below. */
export const sectionTypeSchema = z.enum(SECTION_TYPES);

/**
 * How an annotation's range is measured. `line` addresses whole lines of the
 * body; `word` addresses a character range within it. The units are fixed by
 * this field *alone* — never by `type` — so a reader interprets the half-open
 * `[startIndex, endIndex)` range off `granularity` and nothing else.
 */
export const ANNOTATION_GRANULARITIES = ["line", "word"] as const;
export type AnnotationGranularity = (typeof ANNOTATION_GRANULARITIES)[number];
export const annotationGranularitySchema = z.enum(ANNOTATION_GRANULARITIES);

/**
 * What an annotation asserts about the slice it covers. A closed set, like
 * {@link SECTION_TYPES} — validated at the API.
 */
export const ANNOTATION_TYPES = ["rhyme", "enjambment"] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];
export const annotationTypeSchema = z.enum(ANNOTATION_TYPES);

/**
 * A single annotation as the detail view receives it. The anchor is the
 * half-open range `[startIndex, endIndex)`, measured in the units `granularity`
 * names. `quote` is the exact
 * text that range covered when the mark was written, kept so the client (and a
 * future re-anchor pass) can tell whether a later body edit has drifted the
 * offsets off their target; `detached` is `true` once that anchor can no longer
 * be located and the mark is shown unanchored. `value` is the mark's payload — a
 * rhyme group's label, a note — absent for a mark that carries none.
 *
 * The `endIndex > startIndex` invariant is deliberately *not* a cross-field
 * `.refine()` here: it's enforced where annotations are written (the future
 * create/update path, and a DB CHECK), not on the wire. Keeping the wire schema
 * a plain object leaves it fakeable by `zod-schema-faker` — the mock's stub
 * generator (`fakeSchema`) assumes `fake()` yields a schema-valid value, which a
 * refinement it can't satisfy would break.
 *
 * No `entryId`, owner, or timestamps on the wire: an annotation is nested under
 * the entry that owns it, over a per-user scoped read, so none of the three add
 * anything the caller doesn't already have.
 *
 * This is the *shape*, deliberately ahead of its storage: there is no
 * annotations table yet, so `entries.get` returns `[]` for now. The field ships
 * so the UI can be built against the real wire contract before the DB model is
 * committed to.
 */
export const annotationSchema = z.object({
  id: z.uuidv4(),
  granularity: annotationGranularitySchema,
  type: annotationTypeSchema,
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
  quote: z.string(),
  value: z.string().optional(),
  detached: z.boolean(),
});

export type Annotation = z.infer<typeof annotationSchema>;

/**
 * Fields a single saved piece carries for the detail view — `entryBaseSchema`
 * with the derived preview fields (`excerpt`/`lineCount`/`wordCount`) swapped
 * for the full `body` text, since the detail view renders the whole piece
 * rather than a preview card.
 */
const entryDetailBaseSchema = entryBaseSchema
  .pick({
    id: true,
    body: true,
    title: true,
    author: true,
    year: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    /**
     * One label per body section, in order — the piece's structure. Kept exactly
     * as long as `body` has sections (`splitSections`): the API re-syncs it on
     * every body edit, so it can't drift.
     */
    structure: z.array(sectionTypeSchema),
    /**
     * The user's marks over this piece — rhyme groupings, enjambments, and so on.
     * Order is not significant; each carries its own anchor. Empty until the
     * annotation store lands (see {@link annotationSchema}).
     */
    annotations: z.array(annotationSchema),
  });

/** A poem's detail shape — carries none of the lyrics-only fields. */
export const poemDetailSchema = entryDetailBaseSchema.extend({
  kind: z.literal("poem"),
});

/** A song's lyrics detail shape — adds the performer and the record it's on. */
export const lyricsDetailSchema = entryDetailBaseSchema.extend({
  kind: z.literal("lyrics"),
  artist: z.array(z.string().trim()),
  album: z.string(),
});

/** A saved piece's full detail: a poem or a song's lyrics, discriminated by `kind`. */
export const entryDetailSchema = z.discriminatedUnion("kind", [
  poemDetailSchema,
  lyricsDetailSchema,
]);

/**
 * Fields a client submits to save a new piece — distinct from `entrySummarySchema`:
 * it carries the full `body` text (the source of truth) rather than the derived
 * `excerpt`/`lineCount`/`wordCount`, and has no `id`/timestamps yet.
 */
const entryCreateBaseSchema = z.object({
  title: z.string().trim().min(1),
  // Defaulted rather than optional so the write path always receives a list and
  // never has to decide what an omitted author means.
  author: z.array(z.string().trim().min(1)).default([]),
  year: z.number().int().positive().optional(),
  /** The full saved text; `excerpt`, `lineCount`, and `wordCount` are derived from this. */
  body: z.string().transform(normalizeEntryBody).pipe(z.string().min(1)),
});

const poemCreateSchema = entryCreateBaseSchema.extend({ kind: z.literal("poem") });

const lyricsCreateSchema = entryCreateBaseSchema.extend({
  kind: z.literal("lyrics"),
  artist: z.array(z.string().trim().min(1)).default([]),
  album: z.string().trim().optional(),
});

export const entryCreateInputSchema = z.discriminatedUnion("kind", [
  poemCreateSchema,
  lyricsCreateSchema,
]);

export type EntrySummary = z.infer<typeof entrySummarySchema>;

export type EntryKind = EntrySummary["kind"];

export type EntryDetail = z.infer<typeof entryDetailSchema>;

export type EntryCreateInput = z.infer<typeof entryCreateInputSchema>;
