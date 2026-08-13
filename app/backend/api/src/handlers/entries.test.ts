/**
 * `entries.list` is a thin delegator — the query logic lives in
 * `EntryController` and is unit-tested there (`controllers/entry.test.ts`).
 * This test only needs to prove the handler calls the controller correctly and
 * maps its result onto the wire shape, so `entryController` is mocked outright
 * rather than spied on: spying would still construct the real controller,
 * which pulls in the Prisma client and its adapter for no benefit here.
 */
import { createProcedureClient } from "@orpc/server";
import { fakeEntries } from "@rhymelab/fixtures";
import type { EntrySummary } from "@rhymelab/api-contract";
import type { FastifyReply } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../_generated/prisma/client";
import type { ORPCContext } from "../orpc";
import { SINGLE_USER_ID } from "../session";

vi.mock("../controllers/entry", () => ({
  entryController: { list: vi.fn() },
}));

const { entryController } = await import("../controllers/entry");
const { list } = await import("./entries");

const mockedList = vi.mocked(entryController.list);

/** The inverse of the handler's mapping — a fixture summary back to a Prisma row. */
function toEntryRow(summary: EntrySummary): Entry {
  return {
    id: summary.id,
    userId: SINGLE_USER_ID,
    kind: summary.kind,
    title: summary.title,
    author: summary.author,
    year: summary.year ?? null,
    excerpt: summary.excerpt,
    lineCount: summary.lineCount,
    wordCount: summary.wordCount,
    artist: summary.kind === "lyrics" ? summary.artist : null,
    album: summary.kind === "lyrics" ? summary.album : null,
    createdAt: new Date(summary.createdAt),
    updatedAt: new Date(summary.updatedAt),
  };
}

function callList() {
  const context: ORPCContext = { session: { authed: true }, reply: {} as FastifyReply };
  return createProcedureClient(list, { context })();
}

describe("entries.list", () => {
  beforeEach(() => {
    mockedList.mockReset();
  });

  it("delegates to EntryController.list, scoped to the single alpha user", async () => {
    mockedList.mockResolvedValue([]);

    await callList();

    expect(mockedList).toHaveBeenCalledExactlyOnceWith(SINGLE_USER_ID);
  });

  it("maps the controller's rows onto EntrySummary", async () => {
    const summaries = fakeEntries(4);
    mockedList.mockResolvedValue(summaries.map(toEntryRow));

    const result = await callList();

    expect(result).toEqual(summaries);
  });
});
