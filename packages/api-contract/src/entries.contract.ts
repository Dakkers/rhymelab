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

/**
 * The section labels a `structure` array is built from. A closed set so the
 * column is validated at the API and a future picker is a plain dropdown;
 * `verse` doubles as the generic stanza label and is the default a section takes
 * before anyone assigns it. Poem-specific vocabulary can be added later — the
 * set is easy to extend.
 */
export const SECTION_TYPES = ["intro", "verse", "prechorus", "chorus", "bridge", "outro"] as const;

/** The label a section carries until it's assigned one — see `initStructure`. */
export const DEFAULT_SECTION_TYPE: SectionType = "verse";

const SECTION_TYPE_SET: ReadonlySet<string> = new Set(SECTION_TYPES);

/**
 * The `structure` a freshly-saved body gets: one {@link DEFAULT_SECTION_TYPE}
 * per section, so the invariant holds from the first write and the user assigns
 * real labels afterward.
 */
export function initStructure(body: string): SectionType[] {
  return Array.from({ length: splitSections(body).length }, () => DEFAULT_SECTION_TYPE);
}

/**
 * Split a `body` into its sections — the units a `structure` array labels. One
 * definition of "a section" for every path: normalize first (so a section is a
 * run of non-blank lines, delimited by exactly one blank line), then split on
 * the blank line. An empty body has no sections.
 *
 * The invariant the whole feature rests on is `structure.length ===
 * splitSections(body).length`; this is the right-hand side.
 */
export function splitSections(body: string): string[] {
  const normalized = normalizeEntryBody(body);
  return normalized === "" ? [] : normalized.split("\n\n");
}

/**
 * Standardize a submitted `body` before it's stored: trim every line, and
 * separate sections (runs of non-blank lines) by exactly one blank line.
 *
 * Concretely — trim each line, collapse any run of blank lines to a single one,
 * and drop leading/trailing blank lines. So a body pasted with ragged trailing
 * spaces and multi-line gaps between verses lands as the same clean shape every
 * time, whichever path (create or edit) submits it.
 *
 * Trimming each line also normalizes `\r\n` newlines to `\n` (the `\r` is
 * whitespace the trim removes), so a Windows-pasted body stores identically.
 */
export function normalizeEntryBody(body: string): string {
  const lines = body.split("\n").map((line) => line.trim());
  const normalized: string[] = [];
  for (const line of lines) {
    // Skip a blank line when the previous kept line was also blank (collapsing
    // runs) or when nothing non-blank has been kept yet (trimming the top).
    if (line === "" && (normalized.length === 0 || normalized.at(-1) === "")) {
      continue;
    }
    normalized.push(line);
  }
  // A single trailing blank can survive the loop (a blank following content);
  // drop it so the body ends on its last non-blank line.
  if (normalized.at(-1) === "") {
    normalized.pop();
  }
  return normalized.join("\n");
}

/**
 * Re-derive an entry's `structure` after its `body` was edited, so the array
 * never drifts from the section count — the crux of the feature.
 *
 * It aligns the old and new sections by their *text* (a longest-common-
 * subsequence over the section blocks, exact-match), then: a section that
 * survived the edit keeps whatever label it had; an inserted section takes the
 * default; a removed section's label is dropped with it. Because the alignment
 * respects order, this is correct even when the edit is in the middle of the
 * piece — inserting a verse after the first chorus doesn't shift every label
 * below it, the way a naive "pad/truncate the tail" would.
 *
 * The result is always exactly `splitSections(nextBody).length` labels long.
 *
 * Not handled specially (all acceptable — the count invariant always holds):
 * reordering sections and editing text *within* a section both read as a
 * remove + insert, so the affected section falls back to the default label.
 */
export function resyncStructure(
  prevBody: string,
  prevStructure: readonly string[],
  nextBody: string,
): SectionType[] {
  const prev = splitSections(prevBody);
  const next = splitSections(nextBody);
  const prevLabels = coerceStructure(prevStructure, prev.length);

  // LCS length table over the two section-text sequences.
  const lcs: number[][] = Array.from({ length: prev.length + 1 }, () =>
    Array.from({ length: next.length + 1 }, () => 0),
  );
  for (let i = 1; i <= prev.length; i++) {
    for (let j = 1; j <= next.length; j++) {
      lcs[i][j] =
        prev[i - 1] === next[j - 1]
          ? lcs[i - 1][j - 1] + 1
          : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  // Backtrack: matched sections inherit their old label; everything else stays
  // the pre-filled default (covers inserted sections and any head insertions
  // left when the walk reaches the top edge).
  const result: SectionType[] = Array.from({ length: next.length }, () => DEFAULT_SECTION_TYPE);
  let i = prev.length;
  let j = next.length;
  while (i > 0 && j > 0) {
    if (prev[i - 1] === next[j - 1]) {
      result[j - 1] = prevLabels[i - 1];
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      i--; // old section removed
    } else {
      j--; // new section inserted
    }
  }
  return result;
}

/**
 * Coerce a stored `structure` to a clean array of exactly `length` labels —
 * padding short arrays (a legacy row that predates the column reads as `[]`) and
 * mapping any value that isn't a current section type to the default. Keeps the
 * alignment below working on trustworthy input.
 */
function coerceStructure(structure: readonly string[], length: number): SectionType[] {
  return Array.from({ length }, (_, i) =>
    isSectionType(structure[i]) ? structure[i] : DEFAULT_SECTION_TYPE,
  );
}

function isSectionType(value: string | undefined): value is SectionType {
  return value !== undefined && SECTION_TYPE_SET.has(value);
}

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

/** Zod form of {@link SECTION_TYPES}, for the schemas below. */
export const SectionTypeSchema = z.enum(SECTION_TYPES);

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

/* ------------------------------------------------------------------ */
/* Annotations — a user's marks over a slice of an entry's body        */
/* ------------------------------------------------------------------ */

/**
 * How an annotation's range is measured. `line` addresses whole lines of the
 * body; `word` addresses a character range within it. The units are fixed by
 * this field *alone* — never by `type` — so a reader interprets the half-open
 * `[startIndex, endIndex)` range off `granularity` and nothing else.
 */
export const ANNOTATION_GRANULARITIES = ["line", "word"] as const;
export type AnnotationGranularity = (typeof ANNOTATION_GRANULARITIES)[number];
export const AnnotationGranularitySchema = z.enum(ANNOTATION_GRANULARITIES);

/**
 * What an annotation asserts about the slice it covers. A closed set, like
 * {@link SECTION_TYPES} — validated at the API, and easy to extend as the
 * workbench grows more marks.
 */
export const ANNOTATION_TYPES = ["rhyme", "enjambment"] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];
export const AnnotationTypeSchema = z.enum(ANNOTATION_TYPES);

/**
 * A single annotation as the detail view receives it. The anchor is the
 * half-open range `[startIndex, endIndex)`, measured in the units `granularity`
 * names, so the covered length is `endIndex - startIndex`. `quote` is the exact
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
 * so the workbench UI can be built against the real wire contract before the DB
 * model is committed to.
 */
export const AnnotationSchema = z.object({
  id: z.uuidv4(),
  granularity: AnnotationGranularitySchema,
  type: AnnotationTypeSchema,
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
  quote: z.string(),
  value: z.string().optional(),
  detached: z.boolean(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;

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
  /**
   * One label per body section, in order — the piece's structure. Kept exactly
   * as long as `body` has sections (`splitSections`): the API re-syncs it on
   * every body edit, so it can't drift.
   */
  structure: z.array(SectionTypeSchema),
  /**
   * The user's marks over this piece — rhyme groupings, enjambments, and so on.
   * Order is not significant; each carries its own anchor. Empty until the
   * annotation store lands (see {@link AnnotationSchema}).
   */
  annotations: z.array(AnnotationSchema),
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
  body: z.string().transform(normalizeEntryBody).pipe(z.string().min(1)),
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

/**
 * Save a new piece. Returns the saved entry's summary, as `list` would render it.
 * Served as `POST /api/entries`, answering `201 Created` on success.
 */
export const create = oc
  .route({ method: "POST", path: "/entries", successStatus: 201 })
  .input(EntryCreateInputSchema)
  .output(EntrySummarySchema);

/**
 * Rewrite a saved piece's text. Named for the half of the entry it touches —
 * `body` and nothing else — so the metadata edit that lands beside it can be
 * `updateMetadata` and neither has to claim the bare `update` name.
 *
 * The input is the id plus the replacement text, and the whole updated piece
 * comes back as the detail shape, ready to drop straight into the detail view's
 * cache.
 *
 * Served as `PUT /api/entries/{id}/body`: the text is addressed as a sub-resource
 * and replaced whole, which is what this write does. That deliberately leaves
 * `PATCH /api/entries/{id}` unclaimed, in case the edits are ever folded into one
 * partial-update endpoint.
 *
 * 404s on an unknown id and on another user's piece alike, for the same reason
 * `get` does.
 */
export const updateBody = oc
  .route({ method: "PUT", path: "/entries/{id}/body" })
  .input(
    z.object({
      id: z.uuidv4(),
      body: z.string().transform(normalizeEntryBody).pipe(z.string().min(1)),
    }),
  )
  .output(EntryDetailSchema);

/**
 * Re-label a saved piece's sections — replace its `structure` array. The body is
 * untouched; only the labels change.
 *
 * The array's length must match the piece's current section count (the handler
 * rejects a mismatch): the whole point of `structure` is that it stays aligned
 * with `body`, so a caller can only ever set a full, correctly-sized labelling,
 * not leave the two out of step. Each entry is validated to be a known
 * `SectionType` here; the length check is against the *stored* body and so lives
 * in the handler.
 *
 * Served as `PUT /api/entries/{id}/structure`, the labels addressed as a
 * sub-resource and replaced whole — the mirror of `updateBody`. 404s on an
 * unknown id and on another user's piece alike, for the same reason `get` does.
 */
export const updateStructure = oc
  .route({ method: "PUT", path: "/entries/{id}/structure" })
  .input(z.object({ id: z.uuidv4(), structure: z.array(SectionTypeSchema) }))
  .output(EntryDetailSchema);

export type EntrySummary = z.infer<typeof EntrySummarySchema>;

export type EntryKind = EntrySummary["kind"];

export type SectionType = (typeof SECTION_TYPES)[number];

export type EntryDetail = z.infer<typeof EntryDetailSchema>;

export type EntryCreateInput = z.infer<typeof EntryCreateInputSchema>;
