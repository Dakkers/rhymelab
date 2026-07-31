/**
 * Entry reads and mutations.
 *
 * The invariant that shapes these handlers: **lyrics text is authoritative**,
 * and sections + annotations anchor to character offsets in it. On every lyrics
 * change we re-derive sections (see `rederiveSections`) and re-anchor
 * annotations. Writes are sequential (not wrapped in a transaction) — matching
 * the original D1 behaviour.
 */
import { ORPCError } from "@orpc/server";
import {
  normalizeText,
  reanchor,
  type AnnotationMode,
  type EntryKind,
  type SectionType,
} from "@rhymelab/core";
import { prisma } from "../db";
import { authed } from "../orpc";
import { rederiveSections } from "./sections";

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const list = authed.entries.list.handler(async () => {
  const [rows, tagRows, countRows] = await Promise.all([
    prisma.entry.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" } }),
    prisma.entryTag.findMany(),
    // Detached annotations are hidden everywhere in the workbench, so the library
    // badge counts only the ones the user can actually see.
    prisma.annotation.groupBy({
      by: ["entryId"],
      where: { deletedAt: null, detached: false },
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
    prisma.annotation.findMany({ where: { entryId: input.id, deletedAt: null } }),
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
    tags: tagRows.map((t) => t.name).sort((a, b) => a.localeCompare(b)),
    sections: sectionRows.map((s) => ({
      id: s.id,
      orderIndex: s.orderIndex,
      type: s.type as SectionType,
      label: s.label,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
    })),
    annotations: annRows.map((a) => ({
      id: a.id,
      mode: a.mode as AnnotationMode,
      startOffset: a.startOffset,
      endOffset: a.endOffset,
      quote: a.quote,
      value: a.value,
      body: a.body,
      color: a.color,
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

  const row = await prisma.entry.create({
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
    await prisma.entryTag.createMany({
      data: input.tags.map((name) => ({ entryId: row.id, name })),
    });
  }
  if (lyrics.length) {
    await rederiveSections(row.id, input.kind === "poem", lyrics, [], now);
  }

  return { id: row.id };
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

  const entry = await prisma.entry.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!entry) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });

  const nextText = normalizeText(input.lyrics);

  // Re-anchor every annotation against the new text. Previously-detached ones are
  // included so they can *re-attach* if their quote reappears; we report only the
  // count that this save newly orphaned (was attached, now detached).
  const anns = await prisma.annotation.findMany({
    where: { entryId: input.id, deletedAt: null },
  });
  let newlyDetached = 0;
  for (const a of anns) {
    const res = reanchor(a.quote, a.startOffset, nextText);
    if (res.detached && !a.detached) newlyDetached++;
    await prisma.annotation.update({
      where: { id: a.id },
      data: {
        startOffset: res.startOffset,
        endOffset: res.endOffset,
        detached: res.detached,
        updatedAt: now,
      },
    });
  }

  // Re-derive sections, carrying type/label by position.
  const prev = await prisma.section.findMany({
    where: { entryId: input.id },
    orderBy: { orderIndex: "asc" },
    select: { orderIndex: true, type: true, label: true },
  });
  await rederiveSections(
    input.id,
    entry.kind === "poem",
    nextText,
    prev.map((p) => ({ orderIndex: p.orderIndex, type: p.type as SectionType, label: p.label })),
    now,
  );

  await prisma.entry.update({
    where: { id: input.id },
    data: { lyrics: nextText, updatedAt: now },
  });

  return { ok: true as const, detached: newlyDetached };
});

export const del = authed.entries.delete.handler(async ({ input }) => {
  await prisma.entry.updateMany({ where: { id: input.id }, data: { deletedAt: new Date() } });
  return { ok: true as const };
});
