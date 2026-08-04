/**
 * Entry reads and mutations.
 *
 * The invariant that shapes these handlers: **lyrics text is authoritative**,
 * and sections + annotations anchor to character offsets in it. On every lyrics
 * change we re-derive sections (see `rederiveSections`) and re-anchor
 * annotations. Every such multi-row change runs in ONE transaction opened with
 * the per-entry row lock (`SELECT … FOR UPDATE`), so a concurrent save can't
 * interleave and leave sections/annotations disagreeing with the stored lyrics
 * (invariant 3). Offsets are always computed in JS, never SQL string functions
 * (invariant 5).
 */
import { ORPCError } from "@orpc/server";
import { normalizeText, reanchor, type EntryKind, type RhymeGroup } from "@rhymelab/core";
import { Prisma } from "../_generated/prisma/client";
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
    // badge counts only the ones the user can actually see. (Annotations no longer
    // soft-delete — a cleared one is hard-deleted — so there's no tombstone filter.)
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
    // Ordered by id so rendering/report priority is deterministic (D-7: on a span
    // tie the higher id wins, which a stable id order lets the client resolve).
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
      label: s.label,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
    })),
    annotations: annRows.map((a) => ({
      id: a.id,
      startOffset: a.startOffset,
      endOffset: a.endOffset,
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

  // One transaction — no row lock needed (the id is fresh, so no concurrent
  // save can target it), but the entry, its tags, and its derived sections must
  // still land atomically.
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
      await rederiveSections(tx, row.id, lyrics, now);
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
  const nextText = normalizeText(input.lyrics);

  const result = await prisma.$transaction(async (tx) => {
    // Take the per-entry row lock and validate existence + version inside it — a
    // plain read has a TOCTOU window against a concurrent save (invariant 3).
    // Everything below then commits or aborts as one unit.
    const locked = await tx.$queryRaw<Array<{ version: number }>>`
      SELECT version FROM entries WHERE id = ${input.id} AND deleted_at IS NULL FOR UPDATE`;
    if (locked.length === 0) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
    if (locked[0]!.version !== input.version) {
      throw new ORPCError("CONFLICT", { message: "Lyrics changed — reload and try again" });
    }
    const nextVersion = locked[0]!.version + 1;

    // Re-anchor every annotation against the new text. Previously-detached ones
    // are included so they can *re-attach* if their quote reappears; we report
    // only the count that this save newly orphaned (was attached, now detached).
    // Offsets are recomputed in JS (invariant 5) and applied as one batched UPDATE.
    const anns = await tx.annotation.findMany({ where: { entryId: input.id } });
    let detachedCount = 0;
    const updates = anns.map((a) => {
      const res = reanchor(a.quote, a.startOffset, nextText);
      if (res.detached && !a.detached) detachedCount++;
      return {
        id: a.id,
        startOffset: res.startOffset,
        endOffset: res.endOffset,
        detached: res.detached,
      };
    });
    if (updates.length) {
      // A single UPDATE … FROM (VALUES …) applies every row's new offsets in one
      // statement. Each tuple's values are cast so Postgres infers the VALUES
      // column types from the bound parameters.
      const tuples = Prisma.join(
        updates.map(
          (u) =>
            Prisma.sql`(${u.id}::int, ${u.startOffset}::int, ${u.endOffset}::int, ${u.detached}::boolean)`,
        ),
      );
      await tx.$executeRaw`
        UPDATE annotations AS a
        SET start_offset = v.start_offset,
            end_offset   = v.end_offset,
            detached     = v.detached,
            updated_at   = ${now}
        FROM (VALUES ${tuples}) AS v(id, start_offset, end_offset, detached)
        WHERE a.id = v.id`;
    }

    // Re-derive sections from the new lyrics text (positional labels).
    await rederiveSections(tx, input.id, nextText, now);

    // Bump the version so any annotation write racing on the old lyrics 409s (D-9).
    await tx.entry.update({
      where: { id: input.id },
      data: { lyrics: nextText, version: nextVersion, updatedAt: now },
    });

    return { detached: detachedCount, version: nextVersion };
  });

  return { ok: true as const, detached: result.detached, version: result.version };
});

export const del = authed.entries.delete.handler(async ({ input }) => {
  await prisma.entry.updateMany({ where: { id: input.id }, data: { deletedAt: new Date() } });
  return { ok: true as const };
});
