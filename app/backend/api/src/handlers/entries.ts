/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list,
 * save, or fetch a user's saved pieces.
 *
 * Both read from / write to `EntryController` and map Prisma rows onto the
 * contract's `EntrySummary` / `EntryDetail` shapes — discriminated unions on
 * `kind`, so the lyrics-only fields (`artist` / `album`) only get attached on
 * that arm.
 */
import { ORPCError } from "@orpc/server";
import {
  deriveEntrySummaryFields,
  type EntryDetail,
  type EntrySummary,
} from "@rhymelab/api-contract";
import { entryController, type EntryDetails, type EntryForLibrary } from "../controllers/entry";
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

/**
 * Map a Prisma `Entry` row onto the detail wire shape — like `toEntrySummary`,
 * but carries the raw `body` instead of the derived preview fields.
 */
function toEntryDetail(entry: EntryDetails): EntryDetail {
  const base = {
    id: entry.id,
    title: entry.title,
    author: entry.author ?? "",
    year: entry.year ?? undefined,
    body: entry.body,
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

// `getDetails` doesn't scope by owner, so ownership is checked here: a
// mismatched owner 404s exactly like a missing id, rather than confirming the
// id exists for a piece the caller can't see.
export const get = authed.entries.get.handler(async ({ input }) => {
  const entry = await entryController.getDetails(input.id);
  if (!entry || entry.userId !== SINGLE_USER_ID) {
    throw new ORPCError("NOT_FOUND");
  }
  return toEntryDetail(entry);
});
