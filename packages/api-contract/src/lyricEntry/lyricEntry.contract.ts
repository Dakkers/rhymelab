import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  createLyricEntrySchema,
  readLyricEntryDetailSchema,
  lyricEntryListItemSchema,
} from "./lyricEntry.schemas";
import { LyricEntrySectionTypeSchema } from "@rhymelab/database/schemas";

/**
 * Save a new piece.
 */
export const create = oc
  .route({ method: "POST", path: "/entries", successStatus: 201 })
  .input(createLyricEntrySchema)
  .output(readLyricEntryDetailSchema);

/**
 * List the current user's saved entries.
 */
export const list = oc
  .route({ method: "GET", path: "/entries" })
  .output(z.array(lyricEntryListItemSchema));

/**
 * Fetch a single saved piece by id.
 */
export const getItem = oc
  .route({ method: "GET", path: "/entries/{id}" })
  .input(z.object({ id: z.uuidv4() }))
  .output(readLyricEntryDetailSchema);

/**
 * Delete a saved piece.
 */
export const remove = oc
  .route({ method: "DELETE", path: "/entries/{id}" })
  .input(z.object({ id: z.uuidv4() }))
  .output(z.void());

/**
 * Rewrite a saved piece's text. Named for the half of the entry it touches —
 * `body` and nothing else.
 */
export const updateBody = oc
  .route({ method: "PUT", path: "/entries/{id}/body" })
  .input(
    z.object({
      id: z.uuidv4(),
      body: z.string().min(1),
    }),
  )
  .output(z.void());

/**
 * Re-label a saved piece's sections — replace its `structure` array. The body is
 * untouched; only the labels change.
 */
export const updateStructure = oc
  .route({ method: "PUT", path: "/entries/{id}/structure" })
  .input(z.object({ id: z.uuidv4(), structure: z.array(LyricEntrySectionTypeSchema) }))
  .output(z.void());
