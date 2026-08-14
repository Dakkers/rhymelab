/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list or
 * save a user's saved pieces.
 *
 * Both read from / write to `EntryController` and map Prisma rows onto the
 * contract's `EntrySummary` shape — a discriminated union on `kind`, so the
 * lyrics-only fields (`artist` / `album`) only get attached on that arm.
 */
import { deriveEntrySummaryFields, type EntrySummary } from "@rhymelab/api-contract";
import type { Prisma } from "../_generated/prisma/client";
import { entryController, type SelectedEntry } from "../controllers/entry";
import { authed } from "../orpc";
import { SINGLE_USER_ID } from "../session";

/**
 * The columns `toEntrySummary` reads — everything the contract's `EntrySummary`
 * exposes, plus `body`, which the excerpt / line count / word count are derived
 * from. `userId` is deliberately absent: the summary never carries it.
 */
const ENTRY_SUMMARY_SELECT = {
  id: true,
  kind: true,
  title: true,
  author: true,
  year: true,
  body: true,
  artist: true,
  album: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EntrySelect;

/** Map a selected `Entry` row onto the wire shape the contract promises. */
function toEntrySummary(entry: SelectedEntry<typeof ENTRY_SUMMARY_SELECT>): EntrySummary {
  const base = {
    id: entry.id,
    title: entry.title,
    // Every optional column is nullable; the contract exposes `author` as a
    // plain string and `year` as absent-when-unset, so map NULL accordingly.
    author: entry.author ?? "",
    year: entry.year ?? undefined,
    ...deriveEntrySummaryFields(entry.body),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };

  return entry.kind === "lyrics"
    ? { ...base, kind: "lyrics", artist: entry.artist ?? "", album: entry.album ?? "" }
    : { ...base, kind: "poem" };
}

// No accounts yet — every entry is scoped to the single alpha user.
export const list = authed.entries.list.handler(async () => {
  const entries = await entryController.list(SINGLE_USER_ID, {
    select: ENTRY_SUMMARY_SELECT,
  });
  return entries.map(toEntrySummary);
});

export const create = authed.entries.create.handler(async ({ input }) => {
  const entry = await entryController.create({ ...input, userId: SINGLE_USER_ID });
  return toEntrySummary(entry);
});
