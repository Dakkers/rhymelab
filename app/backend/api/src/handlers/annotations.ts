/**
 * Annotation mutations (semantics v2).
 *
 * Two intent-explicit ops replace the old span-upsert: `setLineGroups` (assign a
 * rhyme group to whole lines, REPLACE-at-line + X-exclusive — D-4/D-5) and
 * `clearLines` (delete the group on whole lines). Both run in ONE transaction
 * opened with the entry row lock, check the client's base `version` (409 on a
 * stale lyrics view — D-9/invariant 3), then apply a plan computed by the shared
 * pure core (`@rhymelab/core`) so the backend and the MSW mock never drift (D-22).
 * `quote` is recomputed from the stored lyrics inside the plan — never trusted
 * from the client. `deleteAnnotation` targets a stable row id and is version-exempt.
 */
import { ORPCError } from "@orpc/server";
import {
  NotALineSpanError,
  planClearLines,
  planSetLineGroups,
  type AnnotationWritePlan,
  type ExistingAnnotation,
} from "@rhymelab/core";
import { Prisma } from "../_generated/prisma/client";
import { prisma } from "../db";
import { authed } from "../orpc";

/**
 * Lock the entry row and assert the client's base `version` still matches. A
 * plain read has a TOCTOU window against a concurrent save (invariant 3), so the
 * lock and the check live in the same transaction as the write that follows.
 */
async function lockAndCheckVersion(
  tx: Prisma.TransactionClient,
  entryId: number,
  version: number,
): Promise<{ lyrics: string }> {
  const rows = await tx.$queryRaw<Array<{ lyrics: string; version: number }>>`
    SELECT lyrics, version FROM entries WHERE id = ${entryId} AND deleted_at IS NULL FOR UPDATE`;
  if (rows.length === 0) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
  if (rows[0]!.version !== version) {
    throw new ORPCError("CONFLICT", { message: "Lyrics changed — reload and try again" });
  }
  return { lyrics: rows[0]!.lyrics };
}

/** Map a core line-span validation failure to a 400; rethrow anything else. */
function as400(err: unknown): never {
  if (err instanceof NotALineSpanError) {
    throw new ORPCError("BAD_REQUEST", { message: "Each selection must be a whole line" });
  }
  throw err;
}

export const setLineGroups = authed.entries.setLineGroups.handler(async ({ input }) => {
  await prisma.$transaction(async (tx) => {
    const { lyrics } = await lockAndCheckVersion(tx, input.entryId, input.version);
    const existing = (await tx.annotation.findMany({
      where: { entryId: input.entryId },
    })) as ExistingAnnotation[];

    let plan: AnnotationWritePlan;
    try {
      plan = planSetLineGroups(lyrics, existing, input.items);
    } catch (err) {
      as400(err);
    }

    if (plan.deleteIds.length) {
      await tx.annotation.deleteMany({ where: { id: { in: plan.deleteIds } } });
    }
    if (plan.inserts.length) {
      const now = new Date();
      await tx.annotation.createMany({
        data: plan.inserts.map((i) => ({
          entryId: input.entryId,
          startOffset: i.startOffset,
          endOffset: i.endOffset,
          quote: i.quote,
          value: i.value,
          createdAt: now,
          updatedAt: now,
        })),
      });
    }
  });

  return { ok: true as const };
});

export const clearLines = authed.entries.clearLines.handler(async ({ input }) => {
  await prisma.$transaction(async (tx) => {
    const { lyrics } = await lockAndCheckVersion(tx, input.entryId, input.version);
    const existing = (await tx.annotation.findMany({
      where: { entryId: input.entryId },
    })) as ExistingAnnotation[];

    let plan: { deleteIds: number[] };
    try {
      plan = planClearLines(lyrics, existing, input.items);
    } catch (err) {
      as400(err);
    }

    if (plan.deleteIds.length) {
      await tx.annotation.deleteMany({ where: { id: { in: plan.deleteIds } } });
    }
  });

  return { ok: true as const };
});

export const deleteAnnotation = authed.entries.deleteAnnotation.handler(async ({ input }) => {
  try {
    await prisma.annotation.delete({ where: { id: input.id } });
  } catch (err) {
    // Deleting an already-gone row is a success (idempotent, version-exempt).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: true as const };
    }
    throw err;
  }
  return { ok: true as const };
});
