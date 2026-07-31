/**
 * Annotation mutations.
 *
 * On every write `quote` is recomputed from the stored lyrics rather than
 * trusting the client — lyrics text stays authoritative.
 */
import { ORPCError } from "@orpc/server";
import { themeColor } from "@rhymelab/core";
import { prisma } from "../db";
import { authed } from "../orpc";

/**
 * Upsert (or clear) one annotation for a `(mode, span)`. Clearing — both `value`
 * and `body` null — soft-deletes any existing annotation there. Otherwise the
 * annotation at that exact span+mode is updated in place, or created.
 */
export const setAnnotation = authed.entries.setAnnotation.handler(async ({ input }) => {
  const now = new Date();

  const entry = await prisma.entry.findFirst({ where: { id: input.entryId, deletedAt: null } });
  if (!entry) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
  if (input.endOffset > entry.lyrics.length) {
    throw new ORPCError("BAD_REQUEST", { message: "Selection out of range" });
  }
  const quote = entry.lyrics.slice(input.startOffset, input.endOffset);

  const existing = await prisma.annotation.findMany({
    where: {
      entryId: input.entryId,
      mode: input.mode,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      deletedAt: null,
    },
  });

  const cleared = input.value === null && input.body === null;
  if (cleared) {
    if (existing.length) {
      await prisma.annotation.updateMany({
        where: { id: { in: existing.map((e) => e.id) } },
        data: { deletedAt: now },
      });
    }
    return { ok: true as const, cleared: true, id: null };
  }

  const color = input.mode === "theme" && input.value ? themeColor(input.value) : null;

  if (existing.length) {
    const keep = existing[0]!;
    await prisma.annotation.update({
      where: { id: keep.id },
      data: { value: input.value, body: input.body, quote, color, detached: false, updatedAt: now },
    });
    // Defensive: collapse any accidental duplicates at this exact span.
    const extras = existing.slice(1).map((e) => e.id);
    if (extras.length) {
      await prisma.annotation.updateMany({
        where: { id: { in: extras } },
        data: { deletedAt: now },
      });
    }
    return { ok: true as const, cleared: false, id: keep.id };
  }

  const inserted = await prisma.annotation.create({
    data: {
      entryId: input.entryId,
      mode: input.mode,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      quote,
      value: input.value,
      body: input.body,
      color,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });

  return { ok: true as const, cleared: false, id: inserted.id };
});

export const deleteAnnotation = authed.entries.deleteAnnotation.handler(async ({ input }) => {
  await prisma.annotation.updateMany({ where: { id: input.id }, data: { deletedAt: new Date() } });
  return { ok: true as const };
});
