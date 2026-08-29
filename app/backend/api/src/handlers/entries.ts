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
import { entryController, type EntryForDetail, type EntryForLibrary } from "../controllers/entry";
import { prisma } from "../db";
import { authed } from "../orpc";
import { SINGLE_USER_ID } from "../session";

/** Map a Prisma `Entry` row onto the detail wire shape the contract promises. */
function toEntryDetail(entry: EntryForDetail): EntryDetail {
  const base = {
    ...toEntryBase(entry),
    body: entry.body,
    // Stored one-label-per-section. The column is a plain `string[]`; every
    // write path constrains it to `SectionType` values (create/resync produce
    // them, `updateStructure`'s input validates them, the backfill wrote
    // `verse`), so narrowing to the contract's enum array is sound — and the
    // output schema re-checks it on the wire regardless.
    structure: entry.structure as SectionType[],
    annotations: [], // nothing to read from yet — see `AnnotationSchema`
  };

  return entry.kind === "lyrics"
    ? { ...base, kind: "lyrics", artist: entry.artist, album: entry.album ?? "" }
    : { ...base, kind: "poem" };
}

/**
 * Map a Prisma `Entry` row onto the summary wire shape — the raw `body` swapped
 * for the derived preview fields (`excerpt`/`lineCount`/`wordCount`) the list
 * view renders. Takes {@link EntryForLibrary}, which carries no `structure` (the
 * card doesn't render it, so the list never selects it).
 */
function toEntrySummary(entry: EntryForLibrary): EntrySummary {
  const base = { ...toEntryBase(entry), ...deriveEntrySummaryFields(entry.body) };

  return entry.kind === "lyrics"
    ? { ...base, kind: "lyrics", artist: entry.artist, album: entry.album ?? "" }
    : { ...base, kind: "poem" };
}

/**
 * The fields the summary and detail wire shapes carry identically — everything
 * kind-agnostic. Shared so that mapping lives in one place; each mapper adds what
 * is specific to it (the detail its `body`/`structure`, the summary its derived
 * preview fields) and the `kind` discriminator on top.
 *
 * `author` is a list column — already `[]` when unset, so it passes straight
 * through. `year` is nullable and the contract wants it absent-when-unset.
 */
function toEntryBase(entry: EntryForLibrary) {
  return {
    id: entry.id,
    title: entry.title,
    author: entry.author,
    year: entry.year ?? undefined,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
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

// Ownership (and liveness) are established up front — `updateBody` is unscoped on
// both counts. `getOwner`, not `getDetails`: this only gates on who owns the row,
// and `updateBody`'s own transaction re-reads the body + structure it re-syncs
// from, so loading the whole row here would read the body a second time for
// nothing. The ownership read and the write aren't in one transaction: a delete
// landing in between makes this rewrite the text of an already-tombstoned row,
// which stays invisible either way.
export const updateBody = authed.entries.updateBody.handler(async ({ input }) => {
  const owner = await entryController.getOwner(input.id);
  if (!owner || owner.userId !== SINGLE_USER_ID) {
    throw new ORPCError("NOT_FOUND");
  }
  return toEntryDetail(await entryController.updateBody(input.id, input.body));
});

// Relabel a piece's sections. The array must be exactly one label per current
// section — the invariant `structure` exists to keep — so a wrong-length array
// is a `BAD_REQUEST`, not a silent partial write. That check is against the
// stored body, and the check and the write have to be atomic: were they not, an
// `updateBody` landing in between could change the section count and leave the
// array it validated out of step with the body — the very drift this endpoint is
// supposed to preserve. So the whole thing runs in one transaction and reads the
// body under `lockForRelabel`'s `FOR UPDATE` lock, which holds the row until the
// write commits (a concurrent `updateBody` write blocks behind it). Ownership and
// liveness ride on that same locked read, so they can't go stale either.
export const updateStructure = authed.entries.updateStructure.handler(async ({ input }) => {
  const updated = await prisma.$transaction(async (tx) => {
    const entry = await entryController.lockForRelabel(input.id, tx);
    if (!entry || entry.userId !== SINGLE_USER_ID) {
      throw new ORPCError("NOT_FOUND");
    }
    if (input.structure.length !== splitSections(entry.body).length) {
      throw new ORPCError("BAD_REQUEST", {
        message: "structure must have one label per section of the entry's body",
      });
    }
    return entryController.updateStructure(input.id, input.structure, tx);
  });
  return toEntryDetail(updated);
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
