/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list,
 * save, fetch, edit, or delete a user's saved pieces.
 *
 * They read from / write to `EntryController` and map Prisma rows onto the
 * contract's `EntrySummary` / `EntryDetail` shapes — discriminated unions on
 * `kind`, so the lyrics-only fields (`artist` / `album`) only get attached on
 * that arm.
 */
import { ORPCError } from "@orpc/server";
import {
  deriveEntrySummaryFields,
  splitSections,
  type EntryDetail,
  type EntrySummary,
  type SectionType,
} from "@rhymelab/api-contract";
import { entryController, type EntryForLibrary } from "../controllers/entry";
import { authed } from "../orpc";
import { SINGLE_USER_ID } from "../session";

/** Map a Prisma `Entry` row onto the detail wire shape the contract promises. */
function toEntryDetail(entry: EntryForLibrary): EntryDetail {
  const base = {
    id: entry.id,
    title: entry.title,
    // `author` is a list column — already `[]` when unset, so it passes straight
    // through. `year` is nullable and the contract wants it absent-when-unset.
    author: entry.author,
    year: entry.year ?? undefined,
    body: entry.body,
    // Stored one-label-per-section. The column is a plain `string[]`; every
    // write path constrains it to `SectionType` values (create/resync produce
    // them, `updateStructure`'s input validates them, the backfill wrote
    // `verse`), so narrowing to the contract's enum array is sound — and the
    // output schema re-checks it on the wire regardless.
    structure: entry.structure as SectionType[],
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };

  return entry.kind === "lyrics"
    ? { ...base, kind: "lyrics", artist: entry.artist, album: entry.album ?? "" }
    : { ...base, kind: "poem" };
}

/**
 * Map a Prisma `Entry` row onto the summary wire shape. Built on `toEntryDetail`
 * so the id/title/author/year/kind/artist/album mapping stays in one place —
 * just swaps the raw `body` for the derived preview fields
 * (`excerpt`/`lineCount`/`wordCount`) the list view actually renders, and drops
 * `structure` (the card doesn't render it).
 */
function toEntrySummary(entry: EntryForLibrary): EntrySummary {
  const { body: _body, structure: _structure, ...detail } = toEntryDetail(entry);
  return { ...detail, ...deriveEntrySummaryFields(entry.body) };
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

// Ownership (and liveness) are established with the same `getDetails` read
// `get` and `remove` use — `updateBody` is unscoped on both counts. The read and
// the write aren't in one transaction: a delete landing in between makes this
// rewrite the text of an already-tombstoned row, which stays invisible either way.
export const updateBody = authed.entries.updateBody.handler(async ({ input }) => {
  const entry = await entryController.getDetails(input.id);
  if (!entry || entry.userId !== SINGLE_USER_ID) {
    throw new ORPCError("NOT_FOUND");
  }
  return toEntryDetail(await entryController.updateBody(input.id, input.body));
});

// Relabel a piece's sections. Ownership (and liveness) come from the same
// `getDetails` read the others use. The array must be exactly one label per
// current section — the invariant `structure` exists to keep — so a wrong-length
// array is a `BAD_REQUEST`, not a silent partial write. The length is checked
// against the body `getDetails` just read; as with `updateBody`, the read and
// the write aren't one transaction, so a body edit landing in between could
// leave them briefly out of step — vanishingly unlikely for the single alpha
// user, and the next `updateBody` re-syncs it regardless.
export const updateStructure = authed.entries.updateStructure.handler(async ({ input }) => {
  const entry = await entryController.getDetails(input.id);
  if (!entry || entry.userId !== SINGLE_USER_ID) {
    throw new ORPCError("NOT_FOUND");
  }
  if (input.structure.length !== splitSections(entry.body).length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "structure must have one label per section of the entry's body",
    });
  }
  return toEntryDetail(await entryController.updateStructure(input.id, input.structure));
});

// Ownership is established the same way `get` does it — `delete` on the
// controller is unscoped, so the check belongs here. The read and the write
// aren't in one transaction: a concurrent delete of the same piece just makes
// the second call's `delete` return false, which is already the 404 path.
export const remove = authed.entries.delete.handler(async ({ input }) => {
  const entry = await entryController.getDetails(input.id);
  if (!entry || entry.userId !== SINGLE_USER_ID) {
    throw new ORPCError("NOT_FOUND");
  }
  // Already-deleted reads as missing, so this can only be false in a race.
  if (!(await entryController.delete(input.id))) {
    throw new ORPCError("NOT_FOUND");
  }
  return { ok: true } as const;
});
