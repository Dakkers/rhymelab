/**
 * Every read and write, implemented against the api-contract. Ported almost
 * verbatim from the original TanStack Start server functions (`server/entries.ts`
 * + `server/auth.ts`), swapping Drizzle/D1 for Prisma/Postgres.
 *
 * The invariant that shapes this file is unchanged: **lyrics text is
 * authoritative**, and sections + annotations anchor to character offsets in it.
 * On every lyrics change we re-derive sections and re-anchor annotations; on
 * every annotation write we recompute `quote` from the stored lyrics rather than
 * trusting the client. Writes are sequential (not wrapped in a transaction) —
 * matching the original D1 behaviour.
 */
import { ORPCError } from "@orpc/server";
import {
  defaultSectionLabel,
  detectSections,
  guessSectionType,
  normalizeText,
  reanchor,
  themeColor,
  type AnnotationMode,
  type EntryKind,
  type SectionType,
} from "@rhymelab/core";
import { prisma } from "./db";
import { appPassword, COOKIE_NAME, COOKIE_VALUE, cookieOptions, passwordsMatch } from "./session";
import { authed, os } from "./orpc";

/* ------------------------------------------------------------------ */
/* Section derivation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Replace an entry's sections to match `text`, carrying an existing section's
 * `type`/`label` over to the same position when one is there. Callers pass the
 * already-loaded previous rows so this stays a pure re-derivation.
 */
async function rederiveSections(
  entryId: number,
  isPoem: boolean,
  text: string,
  previous: Array<{ orderIndex: number; type: SectionType; label: string }>,
  now: Date,
): Promise<void> {
  await prisma.section.deleteMany({ where: { entryId } });
  const detected = detectSections(text);
  if (detected.length === 0) return;

  const prevByIndex = new Map(previous.map((p) => [p.orderIndex, p]));
  const values = detected.map((s, i) => {
    const carried = prevByIndex.get(i);
    const type = carried?.type ?? guessSectionType(isPoem);
    const label = carried?.label ?? defaultSectionLabel(type, i + 1);
    return {
      entryId,
      orderIndex: s.orderIndex,
      type,
      label,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      createdAt: now,
      updatedAt: now,
    };
  });
  await prisma.section.createMany({ data: values });
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

const login = os.auth.login.handler(async ({ input, context }) => {
  if (!(await passwordsMatch(input.password, appPassword()))) {
    return { ok: false };
  }
  context.reply.setCookie(COOKIE_NAME, COOKIE_VALUE, cookieOptions());
  return { ok: true };
});

const logout = os.auth.logout.handler(async ({ context }) => {
  context.reply.clearCookie(COOKIE_NAME, { path: "/" });
  return { ok: true as const };
});

const me = os.auth.me.handler(async ({ context }) => ({ authed: context.session !== null }));

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const list = authed.entries.list.handler(async () => {
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

const get = authed.entries.get.handler(async ({ input }) => {
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
/* Entry mutations                                                     */
/* ------------------------------------------------------------------ */

const create = authed.entries.create.handler(async ({ input }) => {
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
    await prisma.entryTag.createMany({ data: input.tags.map((name) => ({ entryId: row.id, name })) });
  }
  if (lyrics.length) {
    await rederiveSections(row.id, input.kind === "poem", lyrics, [], now);
  }

  return { id: row.id };
});

const update = authed.entries.update.handler(async ({ input }) => {
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

const saveLyrics = authed.entries.saveLyrics.handler(async ({ input }) => {
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

  await prisma.entry.update({ where: { id: input.id }, data: { lyrics: nextText, updatedAt: now } });

  return { ok: true as const, detached: newlyDetached };
});

const del = authed.entries.delete.handler(async ({ input }) => {
  await prisma.entry.updateMany({ where: { id: input.id }, data: { deletedAt: new Date() } });
  return { ok: true as const };
});

/* ------------------------------------------------------------------ */
/* Section mutations                                                   */
/* ------------------------------------------------------------------ */

const updateSection = authed.entries.updateSection.handler(async ({ input }) => {
  await prisma.section.update({
    where: { id: input.id },
    data: { type: input.type, label: input.label, updatedAt: new Date() },
  });
  return { ok: true as const };
});

/* ------------------------------------------------------------------ */
/* Annotation mutations                                                */
/* ------------------------------------------------------------------ */

/**
 * Upsert (or clear) one annotation for a `(mode, span)`. Clearing — both `value`
 * and `body` null — soft-deletes any existing annotation there. Otherwise the
 * annotation at that exact span+mode is updated in place, or created.
 */
const setAnnotation = authed.entries.setAnnotation.handler(async ({ input }) => {
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
      await prisma.annotation.updateMany({ where: { id: { in: extras } }, data: { deletedAt: now } });
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

const deleteAnnotation = authed.entries.deleteAnnotation.handler(async ({ input }) => {
  await prisma.annotation.updateMany({ where: { id: input.id }, data: { deletedAt: new Date() } });
  return { ok: true as const };
});

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export const router = os.router({
  auth: { login, logout, me },
  entries: {
    list,
    get,
    create,
    update,
    saveLyrics,
    delete: del,
    updateSection,
    setAnnotation,
    deleteAnnotation,
  },
});
