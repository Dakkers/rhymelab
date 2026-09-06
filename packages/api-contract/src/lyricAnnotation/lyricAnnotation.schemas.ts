import z from "zod";

/**
 * How an annotation's range is measured. `line` addresses whole lines of the
 * body; `word` addresses a character range within it. The units are fixed by
 * this field *alone* — never by `type` — so a reader interprets the half-open
 * `[startIndex, endIndex)` range off `granularity` and nothing else.
 */
export const ANNOTATION_GRANULARITIES = ["line", "word"] as const;
export type AnnotationGranularity = (typeof ANNOTATION_GRANULARITIES)[number];
export const annotationGranularitySchema = z.enum(["line", "word"]);

/**
 * What an annotation asserts about the slice it covers. A closed set, like
 * {@link SECTION_TYPES} — validated at the API.
 */
export const ANNOTATION_TYPES = ["rhyme", "enjambment"] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];
export const annotationTypeSchema = z.enum(ANNOTATION_TYPES);

export type Annotation = z.infer<typeof annotationSchema>;

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
