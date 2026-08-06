/**
 * Input validators for every procedure that takes input — the `.input(...)` of
 * the oRPC contracts in this package. oRPC uses each schema's *input* type for
 * the client call signature and hands the *parsed/transformed* value to the
 * backend handler.
 *
 * The client sends already-typed JSON (numbers, arrays, `null`) rather than raw
 * form strings, so these can be strict — the one concession is turning empty
 * strings into `null` for the optional text fields.
 */
import { z } from "zod";
import { ENTRY_KINDS, RHYME_GROUPS } from "@rhymelab/core";

const id = z.int().positive();

/** A trimmed optional string: `""`, `null`, and `undefined` all become `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => {
      const s = (v ?? "").trim();
      return s.length ? s : null;
    });

/** Case-insensitive dedupe, first spelling wins. */
function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** Optimistic-concurrency base version the client last saw (D-9). */
const version = z.int().min(0);

const title = z.string().trim().min(1, "Title is required").max(200);
const kind = z.enum(ENTRY_KINDS);
const year = z
  .number()
  .int()
  .min(0)
  .max(3000)
  .nullable()
  .optional()
  .transform((v) => v ?? null);
const tags = z
  .array(z.string().trim().min(1).max(40))
  .max(50)
  .optional()
  .transform((v) => dedupeTags(v ?? []));
const lyrics = z.string().max(50_000).default("");

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export const byId = z.object({ id });

/* ------------------------------------------------------------------ */
/* Entry mutations                                                     */
/* ------------------------------------------------------------------ */

/** Shared metadata shape for create + update. */
const entryMeta = {
  title,
  kind,
  artist: optionalText(200),
  collection: optionalText(200),
  year,
  notes: optionalText(4000),
  tags,
};

export const createEntryInput = z.object({ ...entryMeta, lyrics });
export const updateEntryInput = z.object({ id, ...entryMeta });
export const saveLyricsInput = z.object({ id, version, lyrics });

/* ------------------------------------------------------------------ */
/* Annotation mutations                                                */
/* ------------------------------------------------------------------ */

// A whole-line address: the section id + the 0-based line within it. The server
// resolves the write-redirect (linked → canonical) and validates the line exists.
const lineAddressFields = { sectionId: id, lineInSection: z.int().min(0) };

/**
 * Assign a rhyme group to whole lines — REPLACE-at-line, not additive (D-4). Each
 * item addresses a non-blank line by `(sectionId, lineInSection)`; the server
 * resolves the duplicate redirect and 400s on an invalid address. Carries the base
 * `version`; a lyrics change since the client loaded → 409 (D-9). `value` is the
 * A–F / X vocabulary, no free text (P13); clearing is a separate op (`clearLines`).
 */
export const setLineGroupsInput = z.object({
  entryId: id,
  version,
  items: z
    .array(z.object({ ...lineAddressFields, value: z.enum(RHYME_GROUPS) }))
    .min(1, "No lines given")
    .max(500),
});

/** Clear (hard-delete) the rhyme group on whole lines. User-explicit (D-3). */
export const clearLinesInput = z.object({
  entryId: id,
  version,
  items: z
    .array(z.object({ ...lineAddressFields }))
    .min(1, "No lines given")
    .max(500),
});

/** Delete one annotation row by id. Version-exempt — targets a stable id (D-9). */
export const deleteAnnotationInput = z.object({ id });

/**
 * Unlink a duplicate section so it can be annotated on its own (§5.3): the server
 * copies the canonical's rows down, sets `manualUnlink`, and clears the pointer.
 * Carries `version` (a lyrics change since load → 409, D-9).
 */
export const unlinkSectionInput = z.object({ entryId: id, version, sectionId: id });

/**
 * Relink a manually-unlinked section back to its duplicate group (§5.3). This
 * DELETES the section's own rows (it will render the canonical's again) — the
 * client must confirm first. Carries `version` (409 on a stale lyrics view).
 */
export const relinkSectionInput = z.object({ entryId: id, version, sectionId: id });

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type CreateEntryInput = z.infer<typeof createEntryInput>;
export type UpdateEntryInput = z.infer<typeof updateEntryInput>;
export type SaveLyricsInput = z.infer<typeof saveLyricsInput>;
export type SetLineGroupsInput = z.infer<typeof setLineGroupsInput>;
export type ClearLinesInput = z.infer<typeof clearLinesInput>;
export type UnlinkSectionInput = z.infer<typeof unlinkSectionInput>;
export type RelinkSectionInput = z.infer<typeof relinkSectionInput>;
