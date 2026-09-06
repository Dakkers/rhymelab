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
import { entryController, type EntryForDetail, type EntryForLibrary } from "../resources/lyricEntry/LyricEntryController";
import { prisma } from "../db";
import { authed } from "../orpc";
import { SINGLE_USER_ID } from "../app/session";

export const list = authed.entries.list.handler(async () => {
  const entries = await entryController.listForLibrary(SINGLE_USER_ID);
  return entries.map(toEntrySummary);
});

export const create = authed.entries.create.handler(async ({ input }) => {
  const entry = await entryController.create({ ...input, userId: SINGLE_USER_ID });
  return toEntrySummary(entry);
});

export const get = authed.entries.get.handler(async ({ input }) => {
  const entry = await entryController.getDetails(input.id);
  if (!entry || entry.userId !== SINGLE_USER_ID) {
    throw new ORPCError("NOT_FOUND");
  }
  return toEntryDetail(entry);
});

export const updateBody = authed.entries.updateBody.handler(async ({ input }) => {
  const owner = await entryController.getOwner(input.id);
  if (!owner || owner.userId !== SINGLE_USER_ID) {
    throw new ORPCError("NOT_FOUND");
  }
  return toEntryDetail(await entryController.updateBody(input.id, input.body));
});

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

export const remove = authed.entries.delete.handler(async ({ input }) => {
  const entry = await entryController.getDetails(input.id);
  if (!entry || entry.userId !== SINGLE_USER_ID) {
    throw new ORPCError("NOT_FOUND");
  }
  if (!(await entryController.delete(input.id))) {
    throw new ORPCError("NOT_FOUND");
  }
  return { ok: true } as const;
});
