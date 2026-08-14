/**
 * `entries.list` / `entries.create` are thin delegators — the query logic lives
 * in `EntryController` and is unit-tested there (`controllers/entry.test.ts`).
 * These tests prove the handlers call the controller correctly and map its rows
 * onto the wire shape — including deriving `excerpt` / `lineCount` / `wordCount`
 * from `body`, which the database no longer stores. `entryController` is mocked
 * outright rather than spied on: spying would still construct the real
 * controller, which pulls in the Prisma client and its adapter for no benefit.
 */
import { createProcedureClient } from "@orpc/server";
import type { EntryCreateInput } from "@rhymelab/api-contract";
import type { FastifyReply } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../_generated/prisma/client";
import type { ORPCContext } from "../orpc";
import { SINGLE_USER_ID } from "../session";

vi.mock("../controllers/entry", () => ({
  entryController: { listForLibrary: vi.fn(), create: vi.fn() },
}));

const { entryController } = await import("../controllers/entry");
const { list, create } = await import("./entries");

const mockedList = vi.mocked(entryController.listForLibrary);
const mockedCreate = vi.mocked(entryController.create);

/** A Prisma `Entry` row — `body` is the source the summary fields derive from. */
function makeRow(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    userId: SINGLE_USER_ID,
    kind: "poem",
    title: "A poem",
    author: "Poet",
    year: null,
    body: "First line\nSecond line",
    artist: null,
    album: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function callList() {
  const context: ORPCContext = { session: { authed: true }, reply: {} as FastifyReply };
  return createProcedureClient(list, { context })();
}

function callCreate(input: EntryCreateInput) {
  const context: ORPCContext = { session: { authed: true }, reply: {} as FastifyReply };
  return createProcedureClient(create, { context })(input);
}

describe("entries.list", () => {
  beforeEach(() => {
    mockedList.mockReset();
  });

  it("delegates to EntryController.listForLibrary, scoped to the single alpha user", async () => {
    mockedList.mockResolvedValue([]);

    await callList();

    expect(mockedList).toHaveBeenCalledExactlyOnceWith(SINGLE_USER_ID);
  });

  it("derives the summary fields from each row's body", async () => {
    mockedList.mockResolvedValue([makeRow({ body: "one two three\nfour\n\nsix" })]);

    const [entry] = await callList();

    expect(entry).toMatchObject({
      kind: "poem",
      excerpt: "one two three / four",
      lineCount: 4,
      wordCount: 5,
    });
  });

  it("attaches the lyrics-only fields on the lyrics arm", async () => {
    mockedList.mockResolvedValue([makeRow({ kind: "lyrics", artist: "Band", album: "Album" })]);

    const [entry] = await callList();

    expect(entry).toMatchObject({ kind: "lyrics", artist: "Band", album: "Album" });
  });
});

describe("entries.create", () => {
  beforeEach(() => {
    mockedCreate.mockReset();
  });

  it("delegates to EntryController.create, scoped to the single alpha user", async () => {
    const input: EntryCreateInput = {
      kind: "poem",
      title: "A poem",
      author: "Poet",
      body: "Line one\nLine two",
    };
    mockedCreate.mockResolvedValue(makeRow());

    await callCreate(input);

    expect(mockedCreate).toHaveBeenCalledExactlyOnceWith({ ...input, userId: SINGLE_USER_ID });
  });

  it("maps the saved row onto EntrySummary, deriving from body", async () => {
    mockedCreate.mockResolvedValue(
      makeRow({ kind: "lyrics", artist: "Band", album: "Album", body: "a b\nc" }),
    );

    const result = await callCreate({
      kind: "lyrics",
      title: "A poem",
      author: "Poet",
      artist: "Band",
      album: "Album",
      body: "a b\nc",
    });

    expect(result).toMatchObject({
      kind: "lyrics",
      artist: "Band",
      album: "Album",
      excerpt: "a b / c",
      lineCount: 2,
      wordCount: 3,
    });
  });
});
