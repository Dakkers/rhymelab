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
    getOwner: vi.fn(),
    updateBody: vi.fn(),
    lockForRelabel: vi.fn(),
    updateStructure: vi.fn(),
    delete: vi.fn(),
  },
}));

// `updateStructure` runs its ownership + length check + write inside one
// transaction; the stub just runs the callback so the mocked controller spies
// record its calls. The real lock and rollback are a database concern, exercised
// against Postgres, not here.
vi.mock("../db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})) },
}));

const { entryController } = await import("../controllers/entry");
const { prisma } = await import("../db");
const { list, create, get, remove, updateBody, updateStructure } = await import("./entries");

const mockCtrlList = vi.mocked(entryController.listForLibrary);
const mockCtrlCreate = vi.mocked(entryController.create);
const mockCtrlGetDetails = vi.mocked(entryController.getDetails);
const mockCtrlGetOwner = vi.mocked(entryController.getOwner);
const mockCtrlUpdateBody = vi.mocked(entryController.updateBody);
const mockCtrlLockForRelabel = vi.mocked(entryController.lockForRelabel);
const mockCtrlUpdateStructure = vi.mocked(entryController.updateStructure);
const mockCtrlDelete = vi.mocked(entryController.delete);
const mockTransaction = vi.mocked(prisma.$transaction);

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
    structure: ["verse"],
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

function callUpdateBody(id: string, body: string) {
  const context: ORPCContext = { session: { authed: true }, reply: {} as FastifyReply };
  return createProcedureClient(updateBody, { context })({ id, body });
}

function callUpdateStructure(id: string, structure: string[]) {
  const context: ORPCContext = { session: { authed: true }, reply: {} as FastifyReply };
  // Cast: the contract narrows `structure` to `SectionType[]`; the tests pass
  // plain strings (valid labels, and the invalid-label path is the schema's job,
  // covered in the contract, not here).
  return createProcedureClient(updateStructure, { context })({
    id,
    structure: structure as never,
  });
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

  it("standardizes the body before handing it to the controller — trims each line and leaves one blank line between sections", async () => {
    mockCtrlCreate.mockResolvedValue(makeRow());

    await callCreate({
      kind: "poem",
      title: "A poem",
      author: ["Poet"],
      // Ragged input: leading/trailing blank lines, trailing spaces, and a
      // multi-line gap between the two sections.
      body: "\n\n  First line  \nSecond line\n\n\n  Third line\t\n\n",
    });

    expect(mockCtrlCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ body: "First line\nSecond line\n\nThird line" }),
    );
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

  it("maps the found row onto EntryDetail, carrying the raw body and structure rather than deriving from them", async () => {
    mockCtrlGetDetails.mockResolvedValue(
      makeRow({ body: "one two three\nfour\n\nsix", structure: ["verse", "chorus"] }),
    );

    const result = await callGet("00000000-0000-4000-8000-000000000000");

    expect(result).toMatchObject({
      kind: "poem",
      body: "one two three\nfour\n\nsix",
      structure: ["verse", "chorus"],
    });
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

describe("entries.updateBody", () => {
  const ID = "00000000-0000-4000-8000-000000000000";

  // Ownership is gated on `getOwner` (just the userId), not the whole row — the
  // controller's own transaction re-reads the body it rewrites.
  beforeEach(() => {
    mockCtrlGetOwner.mockReset();
    mockCtrlUpdateBody.mockReset();
  });

  it("rewrites the body once its owner checks out, returning the updated detail with its structure", async () => {
    mockCtrlGetOwner.mockResolvedValue({ userId: SINGLE_USER_ID });
    mockCtrlUpdateBody.mockResolvedValue(makeRow({ body: "New text", structure: ["chorus"] }));

    await expect(callUpdateBody(ID, "New text")).resolves.toMatchObject({
      id: ID,
      kind: "poem",
      body: "New text",
      // The re-synced structure the controller returned rides back on the detail.
      structure: ["chorus"],
    });
    expect(mockCtrlUpdateBody).toHaveBeenCalledExactlyOnceWith(ID, "New text");
  });

  it("standardizes the replacement body before writing it", async () => {
    mockCtrlGetOwner.mockResolvedValue({ userId: SINGLE_USER_ID });
    mockCtrlUpdateBody.mockResolvedValue(makeRow({ body: "First line\n\nThird line" }));

    await callUpdateBody(ID, "  First line  \n\n\n  Third line\t\n");

    expect(mockCtrlUpdateBody).toHaveBeenCalledExactlyOnceWith(ID, "First line\n\nThird line");
  });

  it("404s on an unknown id, without attempting the write", async () => {
    mockCtrlGetOwner.mockResolvedValue(null);

    await expect(callUpdateBody(ID, "New text")).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
    expect(mockCtrlUpdateBody).not.toHaveBeenCalled();
  });

  it("404s — and writes nothing — when the piece belongs to another user", async () => {
    mockCtrlGetOwner.mockResolvedValue({ userId: "someone-else" });

    await expect(callUpdateBody(ID, "New text")).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
    expect(mockCtrlUpdateBody).not.toHaveBeenCalled();
  });
});

describe("entries.updateStructure", () => {
  const ID = "00000000-0000-4000-8000-000000000000";

  // The handler locks + checks + writes inside one transaction; the ownership
  // and section-count checks run against `lockForRelabel`'s locked read, so the
  // spies below stand in for that read rather than `getDetails`.
  beforeEach(() => {
    mockCtrlLockForRelabel.mockReset();
    mockCtrlUpdateStructure.mockReset();
    mockTransaction.mockClear();
  });

  it("relabels the sections once its owner checks out, returning the updated detail", async () => {
    // A single-section body, so a one-label array is the right size.
    mockCtrlLockForRelabel.mockResolvedValue({ userId: SINGLE_USER_ID, body: "just one section" });
    mockCtrlUpdateStructure.mockResolvedValue(makeRow({ structure: ["chorus"] }));

    await expect(callUpdateStructure(ID, ["chorus"])).resolves.toMatchObject({
      id: ID,
      kind: "poem",
      structure: ["chorus"],
    });
    // Both the locked read and the write ran on the transaction client.
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockCtrlLockForRelabel).toHaveBeenCalledExactlyOnceWith(ID, expect.anything());
    expect(mockCtrlUpdateStructure).toHaveBeenCalledExactlyOnceWith(
      ID,
      ["chorus"],
      expect.anything(),
    );
  });

  it("rejects a structure whose length doesn't match the body's section count, writing nothing", async () => {
    // One section in the body, but two labels offered.
    mockCtrlLockForRelabel.mockResolvedValue({ userId: SINGLE_USER_ID, body: "just one section" });

    await expect(callUpdateStructure(ID, ["verse", "chorus"])).rejects.toThrow(
      expect.objectContaining(new ORPCError("BAD_REQUEST")),
    );
    expect(mockCtrlUpdateStructure).not.toHaveBeenCalled();
  });

  it("404s on an unknown id, without attempting the write", async () => {
    mockCtrlLockForRelabel.mockResolvedValue(null);

    await expect(callUpdateStructure(ID, ["verse"])).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
    expect(mockCtrlUpdateStructure).not.toHaveBeenCalled();
  });

  it("404s — and writes nothing — when the piece belongs to another user", async () => {
    mockCtrlLockForRelabel.mockResolvedValue({ userId: "someone-else", body: "just one section" });

    await expect(callUpdateStructure(ID, ["verse"])).rejects.toThrow(
      expect.objectContaining(new ORPCError("NOT_FOUND")),
    );
    expect(mockCtrlUpdateStructure).not.toHaveBeenCalled();
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
