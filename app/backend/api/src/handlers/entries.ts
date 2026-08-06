/**
 * Entry reads and mutations.
 *
 * The invariant that shapes these handlers: **lyrics text is authoritative**, and
 * sections + annotations are addressed against it — sections by offset, annotations
 * by `(sectionId, lineInSection, chars)`. On every lyrics change the pure
 * `reconcile` (in `@rhymelab/core`) produces a plan — durable section ids, moved /
 * detached / orphaned annotations, duplicate links — which `applyPlan` lands in ONE
 * transaction opened with the per-entry row lock and the optimistic version check
 * (invariant 3, D-9). Offsets/line indices are computed in JS, never SQL (invariant
 * 5). Projection of duplicate sections is the client's job (D-18); the wire carries
 * raw rows + link metadata.
 */
import { ORPCError } from "@orpc/server";
import {
  defaultSectionLabel,
  normalizeText,
  reconcile,
  type EntryKind,
  type ReconcileAnnotation,
  type ReconcileSection,
  type RhymeGroup,
} from "@rhymelab/core";
import { prisma } from "../db";
import { authed } from "../orpc";
import { applyPlan } from "./apply-plan";

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const list = authed.entries.list.handler(async () => {
  const [rows, tagRows, countRows] = await Promise.all([
    prisma.entry.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" } }),
    prisma.entryTag.findMany(),
    // Detached annotations are hidden everywhere in the workbench, so the library
    // badge counts only the ones the user can actually see. Counted per entry via
    // the retained entryId, so unlink (which duplicates rows) bumps the count (D-19).
    prisma.annotation.groupBy({
      by: ["entryId"],
      where: { detached: false },
      _count: { _all: true },
    }),
  ]);

  const tagsByEntry = new Map<number, string[]>();
  for (const t of tagRows) {
    const list = tagsByEntry.get(t.entryId) ?? [];
    list.push(t.name);
    tagsByEntry.set(t.entryId, list);
  }
  const countByEntry = new Map<number, number>();
  for (const c of countRows) countByEntry.set(c.entryId, c._count._all);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind as EntryKind,
    artist: r.artist,
    collection: r.collection,
    year: r.year,
    tags: (tagsByEntry.get(r.id) ?? []).sort((a, b) => a.localeCompare(b)),
    annotationCount: countByEntry.get(r.id) ?? 0,
    hasLyrics: r.lyrics.trim().length > 0,
    updatedAt: r.updatedAt.getTime(),
  }));
});

export const get = authed.entries.get.handler(async ({ input }) => {
  const row = await prisma.entry.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!row) return null;

  const [tagRows, sectionRows, annRows] = await Promise.all([
    prisma.entryTag.findMany({ where: { entryId: input.id } }),
    prisma.section.findMany({ where: { entryId: input.id }, orderBy: { orderIndex: "asc" } }),
    // Ordered by id so rendering/report priority is deterministic (D-7).
    prisma.annotation.findMany({ where: { entryId: input.id }, orderBy: { id: "asc" } }),
  ]);

  return {
    id: row.id,
    title: row.title,
    kind: row.kind as EntryKind,
    artist: row.artist,
    collection: row.collection,
    year: row.year,
    notes: row.notes,
    lyrics: row.lyrics,
    version: row.version,
    tags: tagRows.map((t) => t.name).sort((a, b) => a.localeCompare(b)),
    sections: sectionRows.map((s) => ({
      id: s.id,
      orderIndex: s.orderIndex,
      // "Section N" is derived positionally now (D-16); the column is gone.
      label: defaultSectionLabel(s.orderIndex + 1),
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      canonicalSectionId: s.canonicalSectionId,
      manualUnlink: s.manualUnlink,
    })),
    annotations: annRows.map((a) => ({
      id: a.id,
      sectionId: a.sectionId,
      lineInSection: a.lineInSection,
      startChar: a.startChar,
      endChar: a.endChar,
      quote: a.quote,
      // Server-validated on write; always a rhyme group (A–F / X) now.
      value: a.value as RhymeGroup,
      detached: a.detached,
    })),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
});

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export const create = authed.entries.create.handler(async ({ input }) => {
  const now = new Date();
  const lyrics = normalizeText(input.lyrics ?? "");

  // One transaction — no row lock needed (the id is fresh). The reconciler runs
  // with zero old state, so the plan is all creations + duplicate links (D-21).
  const id = await prisma.$transaction(async (tx) => {
    const row = await tx.entry.create({
      data: {
        title: input.title,
        kind: input.kind,
        artist: input.artist,
        collection: input.collection,
        year: input.year,
        notes: input.notes,
        lyrics,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    if (input.tags.length) {
      await tx.entryTag.createMany({
        data: input.tags.map((name) => ({ entryId: row.id, name })),
      });
    }
    if (lyrics.length) {
      const plan = reconcile("", [], [], lyrics);
      await applyPlan(tx, row.id, plan, now);
    }

    return row.id;
  });

  return { id };
});

export const update = authed.entries.update.handler(async ({ input }) => {
  const now = new Date();

  await prisma.entry.updateMany({
    where: { id: input.id, deletedAt: null },
    data: {
      title: input.title,
      kind: input.kind,
      artist: input.artist,
      collection: input.collection,
      year: input.year,
      notes: input.notes,
      updatedAt: now,
    },
  });

  // Replace tags wholesale.
  await prisma.entryTag.deleteMany({ where: { entryId: input.id } });
  if (input.tags.length) {
    await prisma.entryTag.createMany({
      data: input.tags.map((name) => ({ entryId: input.id, name })),
    });
  }

  return { ok: true as const };
});

export const saveLyrics = authed.entries.saveLyrics.handler(async ({ input }) => {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Take the per-entry row lock and validate existence + version inside it — a
    // plain read has a TOCTOU window against a concurrent save (invariant 3).
    const locked = await tx.$queryRaw<Array<{ version: number; lyrics: string }>>`
      SELECT version, lyrics FROM entries WHERE id = ${input.id} AND deleted_at IS NULL FOR UPDATE`;
    if (locked.length === 0) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
    if (locked[0]!.version !== input.version) {
      throw new ORPCError("CONFLICT", { message: "Lyrics changed — reload and try again" });
    }
    const oldLyrics = locked[0]!.lyrics;
    const nextVersion = locked[0]!.version + 1;

    // Load the old sections + annotations as the reconciler's pure inputs.
    const [sectionRows, annRows] = await Promise.all([
      tx.section.findMany({ where: { entryId: input.id }, orderBy: { orderIndex: "asc" } }),
      tx.annotation.findMany({ where: { entryId: input.id } }),
    ]);
    const oldSections: ReconcileSection[] = sectionRows.map((s) => ({
      id: s.id,
      orderIndex: s.orderIndex,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      canonicalSectionId: s.canonicalSectionId,
      manualUnlink: s.manualUnlink,
    }));
    const oldAnnotations: ReconcileAnnotation[] = annRows.map((a) => ({
      id: a.id,
      sectionId: a.sectionId,
      lineInSection: a.lineInSection,
      startChar: a.startChar,
      endChar: a.endChar,
      quote: a.quote,
      value: a.value,
      detached: a.detached,
    }));

    const plan = reconcile(oldLyrics, oldSections, oldAnnotations, input.lyrics);
    // The I2/I3 self-heal surfaces a race/bug it repaired — log it (impl §5.2).
    for (const w of plan.warnings) console.warn(`[reconcile entry ${input.id}] ${w}`);
    await applyPlan(tx, input.id, plan, now);

    // Count rows this save newly orphaned (were attached, now detached) for the UI.
    const wasAttached = new Map(annRows.map((a) => [a.id, !a.detached]));
    let detached = 0;
    for (const a of plan.annotations) {
      if (a.id !== null && a.detached && wasAttached.get(a.id)) detached++;
    }

    // Bump the version so any annotation write racing on the old lyrics 409s (D-9).
    await tx.entry.update({
      where: { id: input.id },
      data: { lyrics: plan.newLyrics, version: nextVersion, updatedAt: now },
    });

    return { detached, version: nextVersion };
  });

  return { ok: true as const, detached: result.detached, version: result.version };
});

export const del = authed.entries.delete.handler(async ({ input }) => {
  await prisma.entry.updateMany({ where: { id: input.id }, data: { deletedAt: new Date() } });
  return { ok: true as const };
});
