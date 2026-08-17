/**
 * `entries.list` / `entries.create` are thin delegators — the query logic lives
 * in `EntryController` and is unit-tested there (`controllers/entry.test.ts`).
 * These tests prove the handlers call the controller correctly and map its rows
 * onto the wire shape — including deriving `excerpt` / `lineCount` / `wordCount`
 * from `body`, which the database no longer stores. `entryController` is mocked
 * outright rather than spied on: spying would still construct the real
 * controller, which pulls in the Prisma client and its adapter for no benefit.
 */
import { ORPCError } from "@orpc/server";
import { createProcedureClient } from "@orpc/server";
import type { EntryCreateInput } from "@rhymelab/api-contract";
import type { FastifyReply } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../_generated/prisma/client";
import type { ORPCContext } from "../orpc";
import { SINGLE_USER_ID } from "../session";

vi.mock("../controllers/entry", () => ({
  entryController: {
    listForLibrary: vi.fn(),
    create: vi.fn(),
    getDetails: vi.fn(),
    delete: vi.fn(),
  },
}));

const { entryController } = await import("../controllers/entry");
const { list, create, get, remove } = await import("./entries");

const mockCtrlList = vi.mocked(entryController.listForLibrary);
const mockCtrlCreate = vi.mocked(entryController.create);
const mockCtrlGetDetails = vi.mocked(entryController.getDetails);
const mockCtrlDelete = vi.mocked(entryController.delete);

/** A Prisma `Entry` row — `body` is the source the summary fields derive from. */
function makeRow(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    userId: SINGLE_USER_ID,
    kind: "poem",
    title: "A poem",
    author: ["Poet"],
    year: null,
    body: "First line\nSecond line",
    artist: [],
    album: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    deletedAt: null,
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

function callGet(id: string) {
  const context: ORPCContext = { session: { authed: true }, reply: {} as FastifyReply };
  return createProcedureClient(get, { context })({ id });
}

function callRemove(id: string) {
  const context: ORPCContext = { session: { authed: true }, reply: {} as FastifyReply };
  return createProcedureClient(remove, { context })({ id });
}

describe("entries.list", () => {
  beforeEach(() => {
    mockCtrlList.mockReset();
  });

  it("delegates to EntryController.listForLibrary, scoped to the single alpha user", async () => {
    mockCtrlList.mockResolvedValue([]);

    await callList();

    expect(mockCtrlList).toHaveBeenCalledExactlyOnceWith(SINGLE_USER_ID);
  });

  it("derives the summary fields from each row's body", async () => {
    mockCtrlList.mockResolvedValue([makeRow({ body: "one two three\nfour\n\nsix" })]);

    const [entry] = await callList();

    expect(entry).toMatchObject({
      kind: "poem",
      excerpt: "one two three / four",
      lineCount: 4,
      wordCount: 5,
    });
  });

  it("attaches the lyrics-only fields on the lyrics arm", async () => {
    mockCtrlList.mockResolvedValue([makeRow({ kind: "lyrics", artist: ["Band"], album: "Album" })]);

    const [entry] = await callList();

    expect(entry).toMatchObject({ kind: "lyrics", artist: ["Band"], album: "Album" });
  });
});

describe("entries.create", () => {
  beforeEach(() => {
    mockCtrlCreate.mockReset();
  });

  it("delegates to EntryController.create, scoped to the single alpha user", async () => {
    const input: EntryCreateInput = {
      kind: "poem",
      title: "A poem",
      author: ["Poet"],
      body: "Line one\nLine two",
    };
    mockCtrlCreate.mockResolvedValue(makeRow());

    await callCreate(input);

    expect(mockCtrlCreate).toHaveBeenCalledExactlyOnceWith({ ...input, userId: SINGLE_USER_ID });
  });

  it("maps the saved row onto EntrySummary, deriving from body", async () => {
    mockCtrlCreate.mockResolvedValue(
      makeRow({ kind: "lyrics", artist: ["Band"], album: "Album", body: "a b\nc" }),
    );

    const result = await callCreate({
      kind: "lyrics",
      title: "A poem",
      author: ["Poet"],
      artist: ["Band"],
      album: "Album",
      body: "a b\nc",
    });

    expect(result).toMatchObject({
      kind: "lyrics",
      artist: ["Band"],
      album: "Album",
      excerpt: "a b / c",
      lineCount: 2,
      wordCount: 3,
    });
  });
});

describe("entries.get", () => {
  beforeEach(() => {
    mockCtrlGetDetails.mockReset();
  });

  it("delegates to EntryController.getDetails with the given id", async () => {
    mockCtrlGetDetails.mockResolvedValue(makeRow());

    await callGet("00000000-0000-4000-8000-000000000000");

    expect(mockCtrlGetDetails).toHaveBeenCalledExactlyOnceWith(
      "00000000-0000-4000-8000-000000000000",
    );
  });

  it("maps the found row onto EntryDetail, carrying the raw body rather than deriving from it", async () => {
    mockCtrlGetDetails.mockResolvedValue(makeRow({ body: "one two three\nfour\n\nsix" }));

    const result = await callGet("00000000-0000-4000-8000-000000000000");

    expect(result).toMatchObject({ kind: "poem", body: "one two three\nfour\n\nsix" });
    expect(result).not.toHaveProperty("excerpt");
  });

  it("attaches the lyrics-only fields on the lyrics arm", async () => {
    mockCtrlGetDetails.mockResolvedValue(
      makeRow({ kind: "lyrics", artist: ["Band"], album: "Album" }),
    );

    const result = await callGet("00000000-0000-4000-8000-000000000000");

    expect(result).toMatchObject({ kind: "lyrics", artist: ["Band"], album: "Album" });
  });

  it("404s when the id doesn't exist", async () => {
    mockCtrlGetDetails.mockResolvedValue(null);

    await expect(callGet("00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
  });

  it("404s — not just refuses — when the entry belongs to another user", async () => {
    mockCtrlGetDetails.mockResolvedValue(makeRow({ userId: "someone-else" }));

    await expect(callGet("00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
  });
});

describe("entries.delete", () => {
  const ID = "00000000-0000-4000-8000-000000000000";

  beforeEach(() => {
    mockCtrlGetDetails.mockReset();
    mockCtrlDelete.mockReset();
  });

  it("deletes the piece once its owner checks out", async () => {
    mockCtrlGetDetails.mockResolvedValue(makeRow());
    mockCtrlDelete.mockResolvedValue(true);

    await expect(callRemove(ID)).resolves.toEqual({ ok: true });
    expect(mockCtrlDelete).toHaveBeenCalledExactlyOnceWith(ID);
  });

  it("404s on an unknown id, without attempting the delete", async () => {
    mockCtrlGetDetails.mockResolvedValue(null);

    await expect(callRemove(ID)).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
    expect(mockCtrlDelete).not.toHaveBeenCalled();
  });

  it("404s — and deletes nothing — when the piece belongs to another user", async () => {
    mockCtrlGetDetails.mockResolvedValue(makeRow({ userId: "someone-else" }));

    await expect(callRemove(ID)).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
    // The important half: another user's piece is never handed to the delete.
    expect(mockCtrlDelete).not.toHaveBeenCalled();
  });

  it("404s when the row vanishes between the ownership check and the delete", async () => {
    mockCtrlGetDetails.mockResolvedValue(makeRow());
    mockCtrlDelete.mockResolvedValue(false);

    await expect(callRemove(ID)).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
  });
});
