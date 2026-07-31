/**
 * Entry / section / annotation procedures. All are authenticated (the backend
 * attaches the auth middleware). Inputs come from `./schemas`; outputs from
 * `./dtos`.
 */
import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  byId,
  createEntryInput,
  deleteAnnotationInput,
  saveLyricsInput,
  setAnnotationInput,
  updateEntryInput,
  updateSectionInput,
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
  .output(z.object({ ok: z.literal(true), detached: z.number() }));
export const del = oc.input(byId).output(ok);

/* Section mutations */
export const updateSection = oc.input(updateSectionInput).output(ok);

/* Annotation mutations */
export const setAnnotation = oc
  .input(setAnnotationInput)
  .output(z.object({ ok: z.literal(true), cleared: z.boolean(), id: z.number().nullable() }));
export const deleteAnnotation = oc.input(deleteAnnotationInput).output(ok);
