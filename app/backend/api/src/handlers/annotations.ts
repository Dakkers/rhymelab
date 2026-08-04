/**
 * Annotation mutations.
 *
 * On every write `quote` is recomputed from the stored lyrics rather than
 * trusting the client — lyrics text stays authoritative.
 */
import { ORPCError } from "@orpc/server";
import type { Prisma } from "../_generated/prisma/client";
import { prisma } from "../db";
import { authed } from "../orpc";

/** One span's desired state — the payload shared by the single and batch forms. */
interface AnnotationSpan {
  startOffset: number;
  endOffset: number;
  value: string | null;
}

/**
 * Upsert (or clear) the rhyme-group annotation for `span` against `db` — either
 * the base client or a transaction client, so the batch form can run many of
 * these atomically. A `null` `value` soft-deletes any existing annotation there;
 * otherwise the annotation at that exact span is updated in place, or created.
 * Callers must have validated the offsets against `lyrics` first (see
 * `loadEntryForSpans`).
 */
async function applyAnnotation(
  db: Prisma.TransactionClient,
  entryId: number,
  lyrics: string,
  span: AnnotationSpan,
  now: Date,
): Promise<{ cleared: boolean; id: number | null }> {
  const quote = lyrics.slice(span.startOffset, span.endOffset);

  const existing = await db.annotation.findMany({
    where: {
      entryId,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      deletedAt: null,
    },
  });

  if (span.value === null) {
    if (existing.length) {
      await db.annotation.updateMany({
        where: { id: { in: existing.map((e) => e.id) } },
        data: { deletedAt: now },
      });
    }
    return { cleared: true, id: null };
  }

  if (existing.length) {
    const keep = existing[0]!;
    await db.annotation.update({
      where: { id: keep.id },
      data: { value: span.value, quote, detached: false, updatedAt: now },
    });
    // Defensive: collapse any accidental duplicates at this exact span.
    const extras = existing.slice(1).map((e) => e.id);
    if (extras.length) {
      await db.annotation.updateMany({
        where: { id: { in: extras } },
        data: { deletedAt: now },
      });
    }
    return { cleared: false, id: keep.id };
  }

  const inserted = await db.annotation.create({
    data: {
      entryId,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      quote,
      value: span.value,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });

  return { cleared: false, id: inserted.id };
}

/** Load the live entry and assert every span fits its lyrics, or throw. */
async function loadEntryForSpans(entryId: number, maxEndOffset: number) {
  const entry = await prisma.entry.findFirst({ where: { id: entryId, deletedAt: null } });
  if (!entry) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
  if (maxEndOffset > entry.lyrics.length) {
    throw new ORPCError("BAD_REQUEST", { message: "Selection out of range" });
  }
  return entry;
}

export const setAnnotation = authed.entries.setAnnotation.handler(async ({ input }) => {
  const now = new Date();
  const entry = await loadEntryForSpans(input.entryId, input.endOffset);
  const { cleared, id } = await applyAnnotation(prisma, input.entryId, entry.lyrics, input, now);
  return { ok: true as const, cleared, id };
});

/**
 * Batch upsert-or-clear: assign a rhyme group to many spans in a single
 * transaction (e.g. several selected lines at once). `results` line up with
 * `input.items`, in order.
 */
export const setAnnotations = authed.entries.setAnnotations.handler(async ({ input }) => {
  const now = new Date();
  const maxEnd = input.items.reduce((m, it) => Math.max(m, it.endOffset), 0);
  const entry = await loadEntryForSpans(input.entryId, maxEnd);

  const results = await prisma.$transaction(async (tx) => {
    const out: Array<{ cleared: boolean; id: number | null }> = [];
    for (const item of input.items) {
      out.push(await applyAnnotation(tx, input.entryId, entry.lyrics, item, now));
    }
    return out;
  });

  return { ok: true as const, results };
});

export const deleteAnnotation = authed.entries.deleteAnnotation.handler(async ({ input }) => {
  await prisma.annotation.updateMany({ where: { id: input.id }, data: { deletedAt: new Date() } });
  return { ok: true as const };
});
