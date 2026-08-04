/**
 * Output shapes for the API — serialisable DTOs returned by the entries
 * procedures. These reproduce the exact shapes the app rendered before the
 * backend split (timestamps as epoch-ms `number`s), so the frontend's rendering
 * code is untouched. The inferred types are the app's canonical data types.
 */
import { z } from "zod";
import { ENTRY_KINDS } from "@rhymelab/core";

export const EntrySummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: z.enum(ENTRY_KINDS),
  artist: z.string().nullable(),
  collection: z.string().nullable(),
  year: z.number().nullable(),
  tags: z.array(z.string()),
  annotationCount: z.number(),
  hasLyrics: z.boolean(),
  updatedAt: z.number(),
});
export type EntrySummary = z.infer<typeof EntrySummarySchema>;

export const SectionDTOSchema = z.object({
  id: z.number(),
  orderIndex: z.number(),
  label: z.string(),
  startOffset: z.number(),
  endOffset: z.number(),
});
export type SectionDTO = z.infer<typeof SectionDTOSchema>;

export const AnnotationDTOSchema = z.object({
  id: z.number(),
  startOffset: z.number(),
  endOffset: z.number(),
  quote: z.string(),
  /** The rhyme group (A–F / X), or null once cleared. */
  value: z.string().nullable(),
  detached: z.boolean(),
});
export type AnnotationDTO = z.infer<typeof AnnotationDTOSchema>;

export const EntryDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: z.enum(ENTRY_KINDS),
  artist: z.string().nullable(),
  collection: z.string().nullable(),
  year: z.number().nullable(),
  notes: z.string().nullable(),
  lyrics: z.string(),
  tags: z.array(z.string()),
  sections: z.array(SectionDTOSchema),
  annotations: z.array(AnnotationDTOSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type EntryDetail = z.infer<typeof EntryDetailSchema>;
