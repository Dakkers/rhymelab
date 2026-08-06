/**
 * Entry / section / annotation procedures. All are authenticated (the backend
 * attaches the auth middleware). Inputs come from `./schemas`; outputs from
 * `./dtos`.
 */
import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  byId,
  clearLinesInput,
  createEntryInput,
  deleteAnnotationInput,
  relinkSectionInput,
  saveLyricsInput,
  setLineGroupsInput,
  unlinkSectionInput,
  updateEntryInput,
} from "./schemas";
import { EntryDetailSchema, EntrySummarySchema } from "./dtos";

const ok = z.object({ ok: z.literal(true) });

/* Reads */
export const list = oc.input(z.void()).output(z.array(EntrySummarySchema));
export const get = oc.input(byId).output(EntryDetailSchema.nullable());

/* Entry mutations */
export const create = oc.input(createEntryInput).output(z.object({ id: z.number() }));
export const update = oc.input(updateEntryInput).output(ok);
export const saveLyrics = oc
  .input(saveLyricsInput)
  .output(z.object({ ok: z.literal(true), detached: z.number(), version: z.number() }));
export const del = oc.input(byId).output(ok);

/* Annotation mutations. A stale base `version` (lyrics changed since load) throws
   CONFLICT → HTTP 409; `deleteAnnotation` is version-exempt (D-9). */
export const setLineGroups = oc.input(setLineGroupsInput).output(ok);
export const clearLines = oc.input(clearLinesInput).output(ok);
export const deleteAnnotation = oc.input(deleteAnnotationInput).output(ok);

/* Duplicate lifecycle (§5.3). Both carry `version` (409 on a stale lyrics view);
   relink deletes the section's own rows, so the client confirms first. */
export const unlinkSection = oc.input(unlinkSectionInput).output(ok);
export const relinkSection = oc.input(relinkSectionInput).output(ok);
