/**
 * Entries procedures — a signed-in user's saved lyrics and poems.
 *
 * The schemas these procedures input/output live in `./entries/entries.schema`;
 * the plain body/structure logic they're built on lives in
 * `./entries/entries.util`. This file just wires the two to routes.
 */

import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  entryCreateInputSchema,
  entryDetailSchema,
  entrySummarySchema,
  sectionTypeSchema,
} from "./entries/entries.schema";
import { normalizeEntryBody } from "./entries/entries.util";

/**
 * List the current user's saved entries.
 */
export const list = oc
  .route({ method: "GET", path: "/entries" })
  .output(z.array(entrySummarySchema));

/**
 * Fetch a single saved entry.
 */
export const get = oc
  .route({ method: "GET", path: "/entries/{id}" })
  .input(z.object({ id: z.uuidv4() }))
  .output(entryDetailSchema);

/**
 * Delete a saved entry.
 */
export const remove = oc
  .route({ method: "DELETE", path: "/entries/{id}" })
  .input(z.object({ id: z.uuidv4() }))
  .output(z.object({ ok: z.literal(true) }));

/**
 * Save a new entry.
 */
export const create = oc
  .route({ method: "POST", path: "/entries", successStatus: 201 })
  .input(entryCreateInputSchema)
  .output(entrySummarySchema);

/**
 * Rewrite a saved entry's text.
 */
export const updateBody = oc
  .route({ method: "PUT", path: "/entries/{id}/body" })
  .input(
    z.object({
      id: z.uuidv4(),
      body: z.string().transform(normalizeEntryBody).pipe(z.string().min(1)),
    }),
  )
  .output(entryDetailSchema);

/**
 * Re-label a saved entry's sections.
 */
export const updateStructure = oc
  .route({ method: "PUT", path: "/entries/{id}/structure" })
  .input(z.object({ id: z.uuidv4(), structure: z.array(sectionTypeSchema) }))
  .output(entryDetailSchema);

export {
  ANNOTATION_GRANULARITIES,
  ANNOTATION_TYPES,
  annotationGranularitySchema,
  annotationSchema,
  annotationTypeSchema,
  entryCreateInputSchema,
  entryDetailSchema,
  entrySummarySchema,
  sectionTypeSchema,
} from "./entries/entries.schema";
export type {
  Annotation,
  AnnotationGranularity,
  AnnotationType,
  EntryCreateInput,
  EntryDetail,
  EntryKind,
  EntrySummary,
} from "./entries/entries.schema";
export {
  DEFAULT_SECTION_TYPE,
  SECTION_TYPES,
  deriveEntrySummaryFields,
  initStructure,
  normalizeEntryBody,
  resyncStructure,
  splitSections,
} from "./entries/entries.util";
export type { SectionType } from "./entries/entries.util";
