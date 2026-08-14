import { describe, expect, it, vi } from "vitest";
import type { Entry, Prisma, PrismaClient } from "../_generated/prisma/client";
import { EntryController } from "./entry";

/**
 * A Prisma stand-in with a spy `entry.findMany`. These are unit tests: the query
 * the controller *builds* is what's under test, so the client is mocked and no
 * database is touched. `findMany` resolves `rows` and records its arguments.
 */
function mockDb(rows: Entry[] = [], created: Entry = makeEntry()) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const create = vi.fn().mockResolvedValue(created);
  // Cast through `unknown`: the mock implements only the surface `list`/`create`
  // use, not the whole PrismaClient / TransactionClient.
  const client = { entry: { findMany, create } } as unknown as PrismaClient &
    Prisma.TransactionClient;
  return { client, findMany, create };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    userId: "user-1",
    kind: "poem",
    title: "A poem",
    author: "Poet",
    year: null,
    body: "Line one\nLine two",
    artist: null,
    album: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("EntryController.list", () => {
  it("scopes to the given userId, newest-edited first", async () => {
    const { client, findMany } = mockDb();
    await new EntryController(client).list("user-1");

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("returns whatever the client yields", async () => {
    const rows = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    const { client } = mockDb(rows);

    const result = await new EntryController(client).list("user-1");

    expect(result).toBe(rows);
  });

  it("AND-s the optional `where` with the user scope", async () => {
    const { client, findMany } = mockDb();
    await new EntryController(client).list("user-1", { kind: "lyrics" });

    expect(findMany).toHaveBeenCalledWith({
      where: { kind: "lyrics", userId: "user-1" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("keeps userId authoritative — a userId in `where` cannot widen the scope", async () => {
    const { client, findMany } = mockDb();
    await new EntryController(client).list("user-1", { userId: "someone-else" });

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("runs on the transaction client when one is passed", async () => {
    const base = mockDb();
    const tx = mockDb();

    await new EntryController(base.client).list("user-1", undefined, tx.client);

    expect(tx.findMany).toHaveBeenCalledTimes(1);
    expect(base.findMany).not.toHaveBeenCalled();
  });

  it("runs on the base client when no transaction is passed", async () => {
    const base = mockDb();

    await new EntryController(base.client).list("user-1");

    expect(base.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("EntryController.create", () => {
  it("writes the raw fields scoped to userId, deriving nothing", async () => {
    const { client, create } = mockDb();
    await new EntryController(client).create({
      userId: "user-1",
      kind: "poem",
      title: "A poem",
      author: "Poet",
      body: "First line\nSecond line\n\nThird line",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        kind: "poem",
        title: "A poem",
        author: "Poet",
        userId: "user-1",
        body: "First line\nSecond line\n\nThird line",
      },
    });
  });

  it("keeps a supplied year and includes lyrics-only fields for lyrics", async () => {
    const { client, create } = mockDb();
    await new EntryController(client).create({
      userId: "user-1",
      kind: "lyrics",
      title: "A song",
      author: "Songwriter",
      year: 2020,
      artist: "Band",
      album: "Album",
      body: "Verse one",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        kind: "lyrics",
        title: "A song",
        author: "Songwriter",
        artist: "Band",
        album: "Album",
        userId: "user-1",
        body: "Verse one",
        year: 2020,
      },
    });
  });

  it("leaves every omitted optional field unset, to land as NULL", async () => {
    const { client, create } = mockDb();
    await new EntryController(client).create({
      userId: "user-1",
      kind: "lyrics",
      title: "A song",
      body: "one",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        kind: "lyrics",
        title: "A song",
        body: "one",
      },
    });
  });

  it("runs on the transaction client when one is passed", async () => {
    const base = mockDb();
    const tx = mockDb();

    await new EntryController(base.client).create(
      { userId: "user-1", kind: "poem", title: "T", author: "A", body: "one" },
      tx.client,
    );

    expect(tx.create).toHaveBeenCalledTimes(1);
    expect(base.create).not.toHaveBeenCalled();
  });
});
