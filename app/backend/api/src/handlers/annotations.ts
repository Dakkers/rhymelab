/**
 * Annotation mutations (semantics v2, Phase 2 addressing).
 *
 * Writes address a whole line by `(sectionId, lineInSection)`. `setLineGroups`
 * (REPLACE-at-line + X-exclusive, D-4/D-5) and `clearLines` (delete the group) run
 * in ONE transaction opened with the entry row lock, check the client's base
 * `version` (409 on a stale lyrics view — D-9/invariant 3), then apply a plan from
 * the shared pure core (`@rhymelab/core`) so the backend and the MSW mock never
 * drift (D-22). The core resolves the duplicate write-redirect (a write on a linked
 * section lands on its canonical). `quote` is recomputed from stored lyrics inside
 * the plan — never trusted from the client. `deleteAnnotation` targets a stable id
 * and is version-exempt. `unlinkSection`/`relinkSection` drive the duplicate
 * lifecycle (§5.3): unlink copies the canonical's rows down and stands the section
 * alone; relink drops the section's own rows and re-shares the canonical's.
 */
import { ORPCError } from "@orpc/server";
import {
  InvalidLineAddressError,
  makeWriteContext,
  parseLines,
  planClearLines,
  planSetLineGroups,
  type ExistingAnnotation,
  type WriteSection,
} from "@rhymelab/core";
import { Prisma } from "../_generated/prisma/client";
import { prisma } from "../db";
import { authed } from "../orpc";

interface LockedEntry {
  lyrics: string;
  sections: Array<{
    id: number;
    startOffset: number;
    endOffset: number;
    canonicalSectionId: number | null;
    manualUnlink: boolean;
  }>;
  annotations: ExistingAnnotation[];
}

/**
 * Lock the entry row, assert the client's base `version` still matches (a plain
 * read has a TOCTOU window against a concurrent save — invariant 3), and load the
 * lyrics + sections + annotation rows the write planner needs, all in the same
 * transaction as the write that follows.
 */
async function lockEntry(
  tx: Prisma.TransactionClient,
  entryId: number,
  version: number,
): Promise<LockedEntry> {
  const rows = await tx.$queryRaw<Array<{ lyrics: string; version: number }>>`
    SELECT lyrics, version FROM entries WHERE id = ${entryId} AND deleted_at IS NULL FOR UPDATE`;
  if (rows.length === 0) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
  if (rows[0]!.version !== version) {
    throw new ORPCError("CONFLICT", { message: "Lyrics changed — reload and try again" });
  }
  const [sections, annotations] = await Promise.all([
    tx.section.findMany({
      where: { entryId },
      select: {
        id: true,
        startOffset: true,
        endOffset: true,
        canonicalSectionId: true,
        manualUnlink: true,
      },
    }),
    tx.annotation.findMany({
      where: { entryId },
      select: {
        id: true,
        sectionId: true,
        lineInSection: true,
        startChar: true,
        endChar: true,
        value: true,
        detached: true,
      },
    }),
  ]);
  return { lyrics: rows[0]!.lyrics, sections, annotations };
}

/** Map a core line-address validation failure to a 400; rethrow anything else. */
function as400(err: unknown): never {
  if (err instanceof InvalidLineAddressError) {
    throw new ORPCError("BAD_REQUEST", { message: "Each selection must be a whole line" });
  }
  throw err;
}

/** A section's non-blank line texts (index ⇒ lineInSection). */
function sectionLines(lyrics: string, startOffset: number, endOffset: number): string[] {
  return parseLines(lyrics)
    .filter((l) => !l.blank && l.start >= startOffset && l.end <= endOffset)
    .map((l) => l.text);
}

export const setLineGroups = authed.entries.setLineGroups.handler(async ({ input }) => {
  await prisma.$transaction(async (tx) => {
    const { lyrics, sections, annotations } = await lockEntry(tx, input.entryId, input.version);
    const ctx = makeWriteContext(lyrics, sections as WriteSection[]);

    let plan;
    try {
      plan = planSetLineGroups(ctx, annotations, input.items);
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
          sectionId: i.sectionId,
          lineInSection: i.lineInSection,
          startChar: i.startChar,
          endChar: i.endChar,
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
    const { lyrics, sections, annotations } = await lockEntry(tx, input.entryId, input.version);
    const ctx = makeWriteContext(lyrics, sections as WriteSection[]);

    let plan;
    try {
      plan = planClearLines(ctx, annotations, input.items);
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

export const unlinkSection = authed.entries.unlinkSection.handler(async ({ input }) => {
  await prisma.$transaction(async (tx) => {
    const { lyrics, sections } = await lockEntry(tx, input.entryId, input.version);
    const section = sections.find((s) => s.id === input.sectionId);
    if (!section) throw new ORPCError("NOT_FOUND", { message: "Section not found" });
    // Only a linked duplicate can be unlinked; anything else is already standalone.
    if (section.canonicalSectionId === null) return;

    const canonicalId = section.canonicalSectionId;
    const now = new Date();
    // Copy the canonical's live rows down at the same coordinates (byte-equal text
    // guarantees validity), recomputing quote from THIS section's lyrics.
    const lines = sectionLines(lyrics, section.startOffset, section.endOffset);
    const canonRows = await tx.annotation.findMany({
      where: { entryId: input.entryId, sectionId: canonicalId, detached: false },
    });
    const copies = canonRows
      .filter((r) => r.lineInSection !== null)
      .map((r) => {
        const line = lines[r.lineInSection!] ?? "";
        const quote = r.startChar === null ? line : line.slice(r.startChar, r.endChar ?? undefined);
        return {
          entryId: input.entryId,
          sectionId: section.id,
          lineInSection: r.lineInSection,
          startChar: r.startChar,
          endChar: r.endChar,
          quote,
          value: r.value,
          createdAt: now,
          updatedAt: now,
        };
      });
    if (copies.length) await tx.annotation.createMany({ data: copies });

    await tx.section.update({
      where: { id: section.id },
      data: { canonicalSectionId: null, manualUnlink: true, updatedAt: now },
    });
  });

  return { ok: true as const };
});

export const relinkSection = authed.entries.relinkSection.handler(async ({ input }) => {
  await prisma.$transaction(async (tx) => {
    const { lyrics, sections } = await lockEntry(tx, input.entryId, input.version);
    const section = sections.find((s) => s.id === input.sectionId);
    if (!section) throw new ORPCError("NOT_FOUND", { message: "Section not found" });

    const now = new Date();
    const text = lyrics.slice(section.startOffset, section.endOffset);
    // The group's canonical: a byte-equal, standalone (canonical), non-unlinked peer.
    const canonical = sections.find(
      (s) =>
        s.id !== section.id &&
        s.canonicalSectionId === null &&
        !s.manualUnlink &&
        lyrics.slice(s.startOffset, s.endOffset) === text,
    );

    if (canonical) {
      // Relinking shares the canonical's rows again — drop this section's own rows
      // (the client confirmed the deletion) and point at the canonical.
      await tx.annotation.deleteMany({ where: { entryId: input.entryId, sectionId: section.id } });
      await tx.section.update({
        where: { id: section.id },
        data: { canonicalSectionId: canonical.id, manualUnlink: false, updatedAt: now },
      });
    } else {
      // No canonical to share — just lift the exemption; the next save's election
      // will place this section in its group.
      await tx.section.update({
        where: { id: section.id },
        data: { manualUnlink: false, updatedAt: now },
      });
    }
  });

  return { ok: true as const };
});
