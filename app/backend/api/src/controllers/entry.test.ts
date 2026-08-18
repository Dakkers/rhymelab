import { describe, expect, it, vi } from "vitest";
import type { Entry, Prisma, PrismaClient } from "../_generated/prisma/client";
import { EntryController } from "./entry";

/**
 * A Prisma stand-in with a spy `entry.findMany`. These are unit tests: the query
 * the controller *builds* is what's under test, so the client is mocked and no
 * database is touched. `findMany` resolves `rows` and records its arguments.
 */
function mockDb(
  rows: Entry[] = [],
  created: Entry = makeEntry(),
  found: Entry | null = null,
  deletedCount = 1,
) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const create = vi.fn().mockResolvedValue(created);
  const findFirst = vi.fn().mockResolvedValue(found);
  // `delete` goes through raw SQL (it needs the DB's `NOW()`, not Node's clock),
  // so the spy stands in for the tagged-template `$executeRaw` and resolves the
  // affected-row count.
  const $executeRaw = vi.fn().mockResolvedValue(deletedCount);
  // Cast through `unknown`: the mock implements only the surface `listForLibrary`/
  // `create`/`getDetails`/`delete` use, not the whole PrismaClient /
  // TransactionClient.
  const client = {
    entry: { findMany, create, findFirst },
    $executeRaw,
  } as unknown as PrismaClient & Prisma.TransactionClient;
  return { client, findMany, create, findFirst, $executeRaw };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    userId: "user-1",
    kind: "poem",
    title: "A poem",
    author: ["Poet"],
    year: null,
    body: "Line one\nLine two",
    artist: [],
    album: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("EntryController.listForLibrary", () => {
  it("scopes to the given userId and live rows, newest-edited first, selecting only the library columns", async () => {
    const { client, findMany } = mockDb();
    await new EntryController(client).listForLibrary("user-1");

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        kind: true,
        title: true,
        author: true,
        year: true,
        body: true,
        artist: true,
        album: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("returns whatever the client yields", async () => {
    const rows = [makeEntry({ id: "a" }), makeEntry({ id: "b" })];
    const { client } = mockDb(rows);

    const result = await new EntryController(client).listForLibrary("user-1");

    expect(result).toBe(rows);
  });

  it("runs on the transaction client when one is passed", async () => {
    const base = mockDb();
    const tx = mockDb();

    await new EntryController(base.client).listForLibrary("user-1", tx.client);

    expect(tx.findMany).toHaveBeenCalledTimes(1);
    expect(base.findMany).not.toHaveBeenCalled();
  });

  it("runs on the base client when no transaction is passed", async () => {
    const base = mockDb();

    await new EntryController(base.client).listForLibrary("user-1");

    expect(base.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("EntryController.getDetails", () => {
  it("looks up a live row by id alone, unscoped by owner, selecting userId alongside listForLibrary's columns", async () => {
    const { client, findFirst } = mockDb();
    await new EntryController(client).getDetails("entry-1");

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "entry-1", deletedAt: null },
      select: {
        id: true,
        kind: true,
        title: true,
        author: true,
        year: true,
        body: true,
        artist: true,
        album: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
      },
    });
  });

  it("returns whatever the client yields, null included — ownership is left to the caller", async () => {
    const entry = makeEntry({ id: "entry-1", userId: "some-owner" });
    const { client } = mockDb([], makeEntry(), entry);

    const found = await new EntryController(client).getDetails("entry-1");
    expect(found).toBe(entry);

    const { client: emptyClient } = mockDb([], makeEntry(), null);
    const missing = await new EntryController(emptyClient).getDetails("missing");
    expect(missing).toBeNull();
  });

  it("runs on the transaction client when one is passed", async () => {
    const base = mockDb();
    const tx = mockDb();

    await new EntryController(base.client).getDetails("entry-1", tx.client);

    expect(tx.findFirst).toHaveBeenCalledTimes(1);
    expect(base.findFirst).not.toHaveBeenCalled();
  });

  it("runs on the base client when no transaction is passed", async () => {
    const base = mockDb();

    await new EntryController(base.client).getDetails("entry-1");

    expect(base.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("EntryController.create", () => {
  it("writes the raw fields scoped to userId, deriving nothing", async () => {
    const { client, create } = mockDb();
    await new EntryController(client).create({
      userId: "user-1",
      kind: "poem",
      title: "A poem",
      author: ["Poet"],
      body: "First line\nSecond line\n\nThird line",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        kind: "poem",
        title: "A poem",
        author: ["Poet"],
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
      author: ["Songwriter"],
      year: 2020,
      artist: ["Band"],
      album: "Album",
      body: "Verse one",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        kind: "lyrics",
        title: "A song",
        author: ["Songwriter"],
        artist: ["Band"],
        album: "Album",
        userId: "user-1",
        body: "Verse one",
        year: 2020,
      },
    });
  });

  it("leaves omitted optional scalars unset (to land as NULL) and passes empty lists through", async () => {
    const { client, create } = mockDb();
    await new EntryController(client).create({
      userId: "user-1",
      kind: "lyrics",
      title: "A song",
      author: [],
      artist: [],
      body: "one",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        kind: "lyrics",
        title: "A song",
        author: [],
        artist: [],
        body: "one",
      },
    });
  });

  it("runs on the transaction client when one is passed", async () => {
    const base = mockDb();
    const tx = mockDb();

    await new EntryController(base.client).create(
      { userId: "user-1", kind: "poem", title: "T", author: ["A"], body: "one" },
      tx.client,
    );

    expect(tx.create).toHaveBeenCalledTimes(1);
    expect(base.create).not.toHaveBeenCalled();
  });
});

describe("EntryController.delete", () => {
  /** The SQL text of the one `$executeRaw` call, with whitespace collapsed. */
  function sqlFrom(spy: ReturnType<typeof mockDb>["$executeRaw"]): string {
    const [strings] = spy.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    return strings.join("?").replace(/\s+/g, " ").trim();
  }

  it("asks Postgres for the timestamp instead of sending one from Node's clock", async () => {
    const { client, $executeRaw } = mockDb();
    await new EntryController(client).delete("entry-1");

    expect($executeRaw).toHaveBeenCalledTimes(1);
    // Converted explicitly: `NOW()` is a `timestamptz` and the column isn't, so
    // a bare `NOW()` would land in whatever zone the session is set to.
    expect(sqlFrom($executeRaw)).toContain(`SET "deleted_at" = (NOW() AT TIME ZONE 'UTC')`);
    // Nothing Date-shaped is bound: the stamp is the DB's, not this process's.
    const [, ...values] = $executeRaw.mock.calls[0];
    expect(values.some((v) => v instanceof Date)).toBe(false);
  });

  it("doesn't write updated_at — that column belongs to the database's trigger", async () => {
    const { client, $executeRaw } = mockDb();
    await new EntryController(client).delete("entry-1");

    // A `BEFORE UPDATE` trigger stamps it from the DB clock and overrides
    // anything a statement sets, so naming the column here would be a value
    // that's silently discarded — and a claim this code decides it.
    expect(sqlFrom($executeRaw)).not.toContain("updated_at");
  });

  it("binds the id as a parameter rather than interpolating it into the SQL", async () => {
    const { client, $executeRaw } = mockDb();
    await new EntryController(client).delete("entry-1");

    const [, ...values] = $executeRaw.mock.calls[0];
    expect(values).toEqual(["entry-1"]);
    expect(sqlFrom($executeRaw)).not.toContain("entry-1");
  });

  it("guards on the tombstone, so an already-deleted row can't be re-stamped", async () => {
    const { client, $executeRaw } = mockDb();
    await new EntryController(client).delete("entry-1");

    expect(sqlFrom($executeRaw)).toContain(`"deleted_at" IS NULL`);
  });

  it("reports whether a live row was actually tombstoned", async () => {
    const hit = mockDb([], makeEntry(), null, 1);
    await expect(new EntryController(hit.client).delete("entry-1")).resolves.toBe(true);

    // No match — unknown id or already deleted, both one answer.
    const miss = mockDb([], makeEntry(), null, 0);
    await expect(new EntryController(miss.client).delete("entry-1")).resolves.toBe(false);
  });

  it("runs on the transaction client when one is passed", async () => {
    const base = mockDb();
    const tx = mockDb();

    await new EntryController(base.client).delete("entry-1", tx.client);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(base.$executeRaw).not.toHaveBeenCalled();
  });

  it("runs on the base client when no transaction is passed", async () => {
    const base = mockDb();

    await new EntryController(base.client).delete("entry-1");

    expect(base.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
