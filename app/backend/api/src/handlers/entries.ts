/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list or
 * save a user's saved pieces.
 *
 * Both read from / write to `EntryController` and map Prisma rows onto the
 * contract's `EntrySummary` shape — a discriminated union on `kind`, so the
 * lyrics-only fields (`artist` / `album`) only get attached on that arm.
 */
import { deriveEntrySummaryFields, type EntrySummary } from "@rhymelab/api-contract";
import { entryController, type EntryForLibrary } from "../controllers/entry";
import { authed } from "../orpc";
import { SINGLE_USER_ID } from "../session";

/** Map a Prisma `Entry` row onto the wire shape the contract promises. */
function toEntrySummary(entry: EntryForLibrary): EntrySummary {
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
  const entries = await entryController.listForLibrary(SINGLE_USER_ID);
  return entries.map(toEntrySummary);
});

export const create = authed.entries.create.handler(async ({ input }) => {
  const entry = await entryController.create({ ...input, userId: SINGLE_USER_ID });
  return toEntrySummary(entry);
});
