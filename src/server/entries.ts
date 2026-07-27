/**
 * Every read and write for entries, their lyrics, sections and annotations.
 * These are the app's data server functions — each is wrapped in the `authed`
 * middleware (see `./authed`) so it can't ship without an auth check.
 *
 * The invariant that shapes this file: **lyrics text is authoritative**, and
 * sections + annotations anchor to character offsets in it. So whenever lyrics
 * change (`saveLyrics`) we re-derive sections and re-anchor annotations in the
 * same transaction of writes; and whenever we write an annotation we recompute
 * its `quote` from the stored lyrics rather than trusting the client.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "#/db";
import { annotations, entries, entryTags, sections } from "#/db/schema";
import { themeColor } from "#/lib/constants";
import { reanchor } from "#/lib/anchor";
import { defaultSectionLabel, detectSections, guessSectionType, normalizeText } from "#/lib/lyrics";
import * as S from "#/lib/schemas";
import { authedFn, authedPostFn } from "./authed";

/* ------------------------------------------------------------------ */
/* Return shapes (serialisable — timestamps as ms numbers)             */
/* ------------------------------------------------------------------ */

export interface EntrySummary {
  id: number;
  title: string;
  kind: "song" | "poem";
  artist: string | null;
  collection: string | null;
  year: number | null;
  tags: string[];
  annotationCount: number;
  hasLyrics: boolean;
  updatedAt: number;
}

export interface SectionDTO {
  id: number;
  orderIndex: number;
  type: (typeof sections.$inferSelect)["type"];
  label: string;
  startOffset: number;
  endOffset: number;
}

export interface AnnotationDTO {
  id: number;
  mode: (typeof annotations.$inferSelect)["mode"];
  startOffset: number;
  endOffset: number;
  quote: string;
  value: string | null;
  body: string | null;
  color: string | null;
  detached: boolean;
}

export interface EntryDetail {
  id: number;
  title: string;
  kind: "song" | "poem";
  artist: string | null;
  collection: string | null;
  year: number | null;
  notes: string | null;
  lyrics: string;
  tags: string[];
  sections: SectionDTO[];
  annotations: AnnotationDTO[];
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const listEntries = authedFn.handler(async (): Promise<EntrySummary[]> => {
  const client = db();

  const [rows, tagRows, countRows] = await Promise.all([
    client.select().from(entries).where(isNull(entries.deletedAt)).orderBy(desc(entries.updatedAt)),
    client.select().from(entryTags),
    client
      .select({ entryId: annotations.entryId, count: sql<number>`count(*)` })
      .from(annotations)
      // Detached annotations are hidden everywhere in the workbench, so the
      // library badge counts only the ones the user can actually see.
      .where(and(isNull(annotations.deletedAt), eq(annotations.detached, false)))
      .groupBy(annotations.entryId),
  ]);

  const tagsByEntry = new Map<number, string[]>();
  for (const t of tagRows) {
    const list = tagsByEntry.get(t.entryId) ?? [];
    list.push(t.name);
    tagsByEntry.set(t.entryId, list);
  }
  const countByEntry = new Map<number, number>();
  for (const c of countRows) countByEntry.set(c.entryId, Number(c.count));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    artist: r.artist,
    collection: r.collection,
    year: r.year,
    tags: (tagsByEntry.get(r.id) ?? []).sort((a, b) => a.localeCompare(b)),
    annotationCount: countByEntry.get(r.id) ?? 0,
    hasLyrics: r.lyrics.trim().length > 0,
    updatedAt: r.updatedAt.getTime(),
  }));
});

export const getEntry = authedFn
  .validator(S.byId)
  .handler(async ({ data }): Promise<EntryDetail | null> => {
    const client = db();
    const row = await client.query.entries.findFirst({
      where: and(eq(entries.id, data.id), isNull(entries.deletedAt)),
    });
    if (!row) return null;

    const [tagRows, sectionRows, annRows] = await Promise.all([
      client.select().from(entryTags).where(eq(entryTags.entryId, data.id)),
      client
        .select()
        .from(sections)
        .where(eq(sections.entryId, data.id))
        .orderBy(sections.orderIndex),
      client
        .select()
        .from(annotations)
        .where(and(eq(annotations.entryId, data.id), isNull(annotations.deletedAt))),
    ]);

    return {
      id: row.id,
      title: row.title,
      kind: row.kind,
      artist: row.artist,
      collection: row.collection,
      year: row.year,
      notes: row.notes,
      lyrics: row.lyrics,
      tags: tagRows.map((t) => t.name).sort((a, b) => a.localeCompare(b)),
      sections: sectionRows.map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        type: s.type,
        label: s.label,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
      })),
      annotations: annRows.map((a) => ({
        id: a.id,
        mode: a.mode,
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
/* Section derivation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Replace an entry's sections to match `text`, carrying an existing section's
 * `type`/`label` over to the same position when one is there. Callers pass the
 * already-loaded previous rows so this stays a pure re-derivation.
 */
async function rederiveSections(
  client: ReturnType<typeof db>,
  entryId: number,
  isPoem: boolean,
  text: string,
  previous: Array<{ orderIndex: number; type: SectionDTO["type"]; label: string }>,
  now: Date,
): Promise<void> {
  await client.delete(sections).where(eq(sections.entryId, entryId));
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
  await client.insert(sections).values(values);
}

/* ------------------------------------------------------------------ */
/* Entry mutations                                                     */
/* ------------------------------------------------------------------ */

export const createEntry = authedPostFn
  .validator(S.createEntryInput)
  .handler(async ({ data }): Promise<{ id: number }> => {
    const client = db();
    const now = new Date();
    const lyrics = normalizeText(data.lyrics ?? "");

    const [row] = await client
      .insert(entries)
      .values({
        title: data.title,
        kind: data.kind,
        artist: data.artist,
        collection: data.collection,
        year: data.year,
        notes: data.notes,
        lyrics,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: entries.id });
    const entryId = row!.id;

    if (data.tags.length) {
      await client.insert(entryTags).values(data.tags.map((name) => ({ entryId, name })));
    }
    if (lyrics.length) {
      await rederiveSections(client, entryId, data.kind === "poem", lyrics, [], now);
    }

    return { id: entryId };
  });

export const updateEntry = authedPostFn
  .validator(S.updateEntryInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = db();
    const now = new Date();

    await client
      .update(entries)
      .set({
        title: data.title,
        kind: data.kind,
        artist: data.artist,
        collection: data.collection,
        year: data.year,
        notes: data.notes,
        updatedAt: now,
      })
      .where(and(eq(entries.id, data.id), isNull(entries.deletedAt)));

    // Replace tags wholesale.
    await client.delete(entryTags).where(eq(entryTags.entryId, data.id));
    if (data.tags.length) {
      await client.insert(entryTags).values(data.tags.map((name) => ({ entryId: data.id, name })));
    }

    return { ok: true };
  });

export const saveLyrics = authedPostFn
  .validator(S.saveLyricsInput)
  .handler(async ({ data }): Promise<{ ok: true; detached: number }> => {
    const client = db();
    const now = new Date();

    const entry = await client.query.entries.findFirst({
      where: and(eq(entries.id, data.id), isNull(entries.deletedAt)),
    });
    if (!entry) throw new Response("Entry not found", { status: 404 });

    const nextText = normalizeText(data.lyrics);

    // Re-anchor every annotation against the new text. Previously-detached ones
    // are included so they can *re-attach* if their quote reappears; we report
    // only the count that this save newly orphaned (was attached, now detached).
    const anns = await client
      .select()
      .from(annotations)
      .where(and(eq(annotations.entryId, data.id), isNull(annotations.deletedAt)));
    let newlyDetached = 0;
    for (const a of anns) {
      const res = reanchor(a.quote, a.startOffset, nextText);
      if (res.detached && !a.detached) newlyDetached++;
      await client
        .update(annotations)
        .set({
          startOffset: res.startOffset,
          endOffset: res.endOffset,
          detached: res.detached,
          updatedAt: now,
        })
        .where(eq(annotations.id, a.id));
    }

    // Re-derive sections, carrying type/label by position.
    const prev = await client
      .select({ orderIndex: sections.orderIndex, type: sections.type, label: sections.label })
      .from(sections)
      .where(eq(sections.entryId, data.id))
      .orderBy(sections.orderIndex);
    await rederiveSections(client, data.id, entry.kind === "poem", nextText, prev, now);

    await client
      .update(entries)
      .set({ lyrics: nextText, updatedAt: now })
      .where(eq(entries.id, data.id));

    return { ok: true, detached: newlyDetached };
  });

export const deleteEntry = authedPostFn
  .validator(S.byId)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = db();
    await client.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, data.id));
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Section mutations                                                   */
/* ------------------------------------------------------------------ */

export const updateSection = authedPostFn
  .validator(S.updateSectionInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = db();
    await client
      .update(sections)
      .set({ type: data.type, label: data.label, updatedAt: new Date() })
      .where(eq(sections.id, data.id));
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Annotation mutations                                                */
/* ------------------------------------------------------------------ */

/**
 * Upsert (or clear) one annotation for a `(mode, span)`. Clearing — both `value`
 * and `body` null — soft-deletes any existing annotation there. Otherwise the
 * annotation at that exact span+mode is updated in place, or created.
 */
export const setAnnotation = authedPostFn
  .validator(S.setAnnotationInput)
  .handler(async ({ data }): Promise<{ ok: true; cleared: boolean; id: number | null }> => {
    const client = db();
    const now = new Date();

    const entry = await client.query.entries.findFirst({
      where: and(eq(entries.id, data.entryId), isNull(entries.deletedAt)),
    });
    if (!entry) throw new Response("Entry not found", { status: 404 });
    if (data.endOffset > entry.lyrics.length) {
      throw new Response("Selection out of range", { status: 400 });
    }
    const quote = entry.lyrics.slice(data.startOffset, data.endOffset);

    const existing = await client
      .select()
      .from(annotations)
      .where(
        and(
          eq(annotations.entryId, data.entryId),
          eq(annotations.mode, data.mode),
          eq(annotations.startOffset, data.startOffset),
          eq(annotations.endOffset, data.endOffset),
          isNull(annotations.deletedAt),
        ),
      );

    const cleared = data.value === null && data.body === null;
    if (cleared) {
      if (existing.length) {
        await client
          .update(annotations)
          .set({ deletedAt: now })
          .where(
            inArray(
              annotations.id,
              existing.map((e) => e.id),
            ),
          );
      }
      return { ok: true, cleared: true, id: null };
    }

    const color = data.mode === "theme" && data.value ? themeColor(data.value) : null;

    if (existing.length) {
      const keep = existing[0]!;
      await client
        .update(annotations)
        .set({
          value: data.value,
          body: data.body,
          quote,
          color,
          detached: false,
          updatedAt: now,
        })
        .where(eq(annotations.id, keep.id));
      // Defensive: collapse any accidental duplicates at this exact span.
      const extras = existing.slice(1).map((e) => e.id);
      if (extras.length) {
        await client
          .update(annotations)
          .set({ deletedAt: now })
          .where(inArray(annotations.id, extras));
      }
      return { ok: true, cleared: false, id: keep.id };
    }

    const [inserted] = await client
      .insert(annotations)
      .values({
        entryId: data.entryId,
        mode: data.mode,
        startOffset: data.startOffset,
        endOffset: data.endOffset,
        quote,
        value: data.value,
        body: data.body,
        color,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: annotations.id });

    return { ok: true, cleared: false, id: inserted!.id };
  });

export const deleteAnnotation = authedPostFn
  .validator(S.deleteAnnotationInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = db();
    await client
      .update(annotations)
      .set({ deletedAt: new Date() })
      .where(eq(annotations.id, data.id));
    return { ok: true };
  });
