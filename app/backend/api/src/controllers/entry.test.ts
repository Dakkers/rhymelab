import { describe, expect, it, vi } from "vitest";
import type { Entry, Prisma, PrismaClient } from "../_generated/prisma/client";
import { EntryController } from "./entry";

/**
 * A Prisma stand-in with a spy `entry.findMany`. These are unit tests: the query
 * the controller *builds* is what's under test, so the client is mocked and no
 * database is touched. `findMany` resolves `rows` and records its arguments.
 */
function mockDb(rows: Entry[] = []) {
  const findMany = vi.fn().mockResolvedValue(rows);
  // Cast through `unknown`: the mock implements only the surface `list` uses,
  // not the whole PrismaClient / TransactionClient.
  const client = { entry: { findMany } } as unknown as PrismaClient & Prisma.TransactionClient;
  return { client, findMany };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    userId: "user-1",
    kind: "poem",
    title: "A poem",
    author: "Poet",
    year: null,
    excerpt: "…",
    lineCount: 4,
    wordCount: 20,
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
