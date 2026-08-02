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
import { ANNOTATION_MODES, ENTRY_KINDS } from "@rhymelab/core";

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
export const saveLyricsInput = z.object({ id, lyrics });

/* ------------------------------------------------------------------ */
/* Annotation mutations                                                */
/* ------------------------------------------------------------------ */

/**
 * Create/update/clear one annotation for a span. The server recomputes `quote`
 * from the entry's lyrics at these offsets (never trusting a client-sent quote).
 * When both `value` and `body` come back `null`, the annotation is cleared.
 */
export const setAnnotationInput = z
  .object({
    entryId: id,
    mode: z.enum(ANNOTATION_MODES),
    startOffset: z.int().min(0),
    endOffset: z.int().min(0),
    value: optionalText(120),
    body: optionalText(4000),
  })
  .refine((v) => v.endOffset > v.startOffset, {
    message: "Selection is empty",
    path: ["endOffset"],
  });

/**
 * Batch form of `setAnnotation`: apply one `mode`'s annotations to several spans
 * at once — e.g. assign a rhyme group to a set of selected lines. Each item is
 * upserted-or-cleared exactly like the single form (per-item `value`/`body`
 * null clears that span); the backend runs the whole batch in one transaction.
 */
export const setAnnotationsInput = z.object({
  entryId: id,
  mode: z.enum(ANNOTATION_MODES),
  items: z
    .array(
      z
        .object({
          startOffset: z.int().min(0),
          endOffset: z.int().min(0),
          value: optionalText(120),
          body: optionalText(4000),
        })
        .refine((v) => v.endOffset > v.startOffset, {
          message: "Selection is empty",
          path: ["endOffset"],
        }),
    )
    .min(1, "No spans given")
    .max(500),
});

export const deleteAnnotationInput = z.object({ id });

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type CreateEntryInput = z.infer<typeof createEntryInput>;
export type UpdateEntryInput = z.infer<typeof updateEntryInput>;
export type SaveLyricsInput = z.infer<typeof saveLyricsInput>;
export type SetAnnotationInput = z.infer<typeof setAnnotationInput>;
export type SetAnnotationsInput = z.infer<typeof setAnnotationsInput>;
