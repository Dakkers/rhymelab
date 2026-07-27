import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ANNOTATION_MODES, ENTRY_KINDS, SECTION_TYPES } from "#/lib/constants";

/**
 * RhymeLab's data model. Cloudflare D1 (SQLite) today, Postgres later — so the
 * columns stay portable: integer millisecond timestamps, no SQLite-only tricks.
 *
 * The one idea that ties it together: **lyrics are the source of truth as plain
 * text**, and everything layered on top (sections, annotations) anchors to
 * *character offsets* into that text. A section is a run of whole lines; an
 * annotation is any `[start, end)` range — usually a single word, sometimes a
 * phrase. `quote` snapshots the exact substring so an offset can be re-found
 * after the lyrics are edited (see `lib/anchor.ts`).
 *
 * Entries soft-delete (`deletedAt`); sections and annotations are children of an
 * entry and are deleted outright (cascade), since sections are re-derived on
 * every lyrics save anyway.
 */

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    /** 'song' | 'poem' */
    kind: text("kind", { enum: ENTRY_KINDS }).notNull(),
    /** Artist (song) or author (poem). */
    artist: text("artist"),
    /** Album (song) or collection/book (poem). */
    collection: text("collection"),
    /** Release / writing year. */
    year: integer("year"),
    /** Free-text description or working notes about the whole entry. */
    notes: text("notes"),
    /** The canonical lyrics text. Blank lines separate sections. */
    lyrics: text("lyrics").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("entries_kind_idx").on(t.kind)],
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

/**
 * Free-text tags on an entry. Kept denormalised (the tag *is* its name) — with
 * one user and a small library there's nothing a separate `tags` table would buy
 * that a `DISTINCT name` query doesn't.
 */
export const entryTags = sqliteTable(
  "entry_tags",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.name] })],
);

export type EntryTag = typeof entryTags.$inferSelect;

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/**
 * A structural block of the lyrics (a verse, chorus, stanza…). Auto-detected
 * from blank lines on every lyrics save, then reconciled so user edits to a
 * section's `type`/`label` survive. `startOffset`/`endOffset` are character
 * offsets into `entries.lyrics` covering whole lines.
 */
export const sections = sqliteTable(
  "sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** 0-based position in the lyrics. */
    orderIndex: integer("order_index").notNull(),
    /** One of SECTION_TYPES. */
    type: text("type", { enum: SECTION_TYPES }).notNull(),
    /** Display label, e.g. "Stanza I", "Verse 1". */
    label: text("label").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("sections_entry_idx").on(t.entryId)],
);

export type Section = typeof sections.$inferSelect;
export type NewSection = typeof sections.$inferInsert;

/* ------------------------------------------------------------------ */
/* Annotations                                                         */
/* ------------------------------------------------------------------ */

/**
 * One annotation, in any mode. A single word can hold several (a rhyme group,
 * a rhyme type, a theme…) — those are separate rows sharing the same range but
 * differing in `mode`. Reads filter on `isNull(deletedAt)`.
 *
 * `value` is the mode's primary datum: the rhyme-group letter ('A'…'F','X') for
 * rhyme-structure; the type/sound/device keyword for those modes; the theme name
 * for theme; null for a plain note. `body` is optional free-text (the note
 * itself, or a comment on any annotation). `color` is only set for themes (a
 * derived, stored swatch) — every other mode derives its colour from `value`.
 */
export const annotations = sqliteTable(
  "annotations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** One of ANNOTATION_MODES. */
    mode: text("mode", { enum: ANNOTATION_MODES }).notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    /** Exact `lyrics.slice(start, end)` at write time — used to re-anchor. */
    quote: text("quote").notNull(),
    value: text("value"),
    body: text("body"),
    color: text("color"),
    /** 1 when a lyrics edit orphaned this annotation (kept, but off the text). */
    detached: integer("detached", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("annotations_entry_idx").on(t.entryId),
    index("annotations_entry_mode_idx").on(t.entryId, t.mode),
  ],
);

export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;
