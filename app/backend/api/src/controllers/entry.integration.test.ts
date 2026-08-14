import { fakeEntries } from "@rhymelab/fixtures";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Entry, Prisma } from "../_generated/prisma/client";
import { freshUser, prisma } from "../test-support/integration-db";
import { EntryController } from "./entry";

/**
 * DB-backed integration tests for `EntryController`. Unlike the sibling
 * `entry.test.ts` (which mocks the client and asserts the *query* built), these
 * run the real Prisma queries against the real local Postgres and assert on rows
 * actually written and read back — for `list`: userId scoping, `updatedAt`-desc
 * ordering, the AND-ed `where`, userId staying authoritative, and the `tx` path;
 * for `create`: what's persisted, the DB-assigned id/timestamps, column
 * defaults, and rollback when the transaction it's handed aborts.
 *
 * The env/DB ping/cleanup/disconnect hooks live in the shared `setupFiles`
 * handler (`../test-support/integration-setup`). Run with `pnpm test:integration`
 * (Postgres must be up on localhost:5433 — see `compose.yaml`); the `.config`
 * vitest projects keep the fast `pnpm test` run DB-free.
 *
 * There is intentionally no per-test reset. Every test gets its own `freshUser()`
 * scope, so it only ever sees rows it created — the tests stay correct whatever
 * else is already in the database.
 */
const controller = new EntryController(prisma);

// A realistic, contract-valid sample from the shared fixtures package (the same
// source the API stub and web mock use), so the seed data tracks the real entry
// shape instead of hand-written literals.
const [sampleEntry] = fakeEntries(1);

/**
 * A DB row for a user, with default column values sourced from the fixtures
 * package; override per test. Only the kind-agnostic base fields are taken — and
 * `id`/timestamps are deliberately dropped so the database assigns them: the
 * suite never resets, so reusing the fixture's seeded `id` would collide.
 */
function entryData(
  userId: string,
  overrides: Partial<Prisma.EntryCreateManyInput> = {},
): Prisma.EntryCreateManyInput {
  return {
    userId,
    kind: "poem",
    title: sampleEntry.title,
    author: sampleEntry.author,
    year: sampleEntry.year,
    body: sampleEntry.excerpt,
    ...overrides,
  };
}

const ids = (entries: Entry[]) => entries.map((e) => e.id);

describe("EntryController.list (DB-backed)", () => {
  it("returns only the given user's rows", async () => {
    const mine = freshUser();
    const other = freshUser();
    const [mine1, mine2] = await Promise.all([
      prisma.entry.create({ data: entryData(mine, { title: "mine-1" }) }),
      prisma.entry.create({ data: entryData(mine, { title: "mine-2" }) }),
    ]);
    await prisma.entry.create({ data: entryData(other, { title: "theirs" }) });

    const result = await controller.list(mine);

    expect(new Set(ids(result))).toEqual(new Set([mine1.id, mine2.id]));
    expect(result.every((e) => e.userId === mine)).toBe(true);
  });

  it("orders newest-edited first (updatedAt desc), regardless of insert order", async () => {
    const user = freshUser();
    // Insert in a deliberately scrambled `updatedAt` order; Prisma honours an
    // explicit `updatedAt` on create (verified against this schema).
    const oldest = await prisma.entry.create({
      data: entryData(user, { title: "oldest", updatedAt: new Date("2026-01-01T00:00:00.000Z") }),
    });
    const newest = await prisma.entry.create({
      data: entryData(user, { title: "newest", updatedAt: new Date("2026-03-01T00:00:00.000Z") }),
    });
    const middle = await prisma.entry.create({
      data: entryData(user, { title: "middle", updatedAt: new Date("2026-02-01T00:00:00.000Z") }),
    });

    const result = await controller.list(user);

    expect(ids(result)).toEqual([newest.id, middle.id, oldest.id]);
  });

  it("AND-s the optional `where` with the user scope", async () => {
    const user = freshUser();
    const poem = await prisma.entry.create({ data: entryData(user, { kind: "poem" }) });
    const lyrics = await prisma.entry.create({
      data: entryData(user, { kind: "lyrics", artist: "Someone", album: "An album" }),
    });

    const result = await controller.list(user, { kind: "lyrics" });

    expect(ids(result)).toEqual([lyrics.id]);
    expect(ids(result)).not.toContain(poem.id);
  });

  it("keeps userId authoritative — a userId inside `where` cannot widen the scope", async () => {
    const mine = freshUser();
    const other = freshUser();
    const own = await prisma.entry.create({ data: entryData(mine, { title: "mine" }) });
    await prisma.entry.create({ data: entryData(other, { title: "theirs" }) });

    // The `where.userId` (other) is overridden by the authoritative `userId`
    // (mine) — the controller spreads `userId` last — so only `mine`'s row
    // comes back. A leak would show as `other`'s row appearing.
    const result = await controller.list(mine, { userId: other });

    expect(ids(result)).toEqual([own.id]);
    expect(result.every((e) => e.userId === mine)).toBe(true);
  });

  it("runs the read on the passed transaction client and returns the right rows", async () => {
    const mine = freshUser();
    const other = freshUser();
    const own = await prisma.entry.create({ data: entryData(mine, { title: "in-tx" }) });
    await prisma.entry.create({ data: entryData(other, { title: "theirs" }) });

    const result = await prisma.$transaction((tx) => controller.list(mine, undefined, tx));

    expect(ids(result)).toEqual([own.id]);
    expect(result.every((e) => e.userId === mine)).toBe(true);
  });

  it("returns an empty list for a user with no rows", async () => {
    const mine = freshUser();
    const other = freshUser();
    // A row for someone else must not leak into `mine`'s (empty) result.
    await prisma.entry.create({ data: entryData(other) });

    const result = await controller.list(mine);

    expect(result).toEqual([]);
  });
});

/** The id the DB's `@default(uuid())` assigns must be what the contract demands. */
const uuidV4 = z.uuidv4();

describe("EntryController.create (DB-backed)", () => {
  it("persists a poem, letting the DB assign id and timestamps", async () => {
    const user = freshUser();

    const created = await controller.create({
      userId: user,
      kind: "poem",
      title: "A poem",
      author: "Poet",
      body: "Roses are red\nViolets are blue",
    });

    expect(uuidV4.safeParse(created.id).success).toBe(true);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
    // Omitted `year` and the poem's absent lyrics-only fields land as NULL.
    expect(created).toMatchObject({
      userId: user,
      kind: "poem",
      title: "A poem",
      author: "Poet",
      body: "Roses are red\nViolets are blue",
      year: null,
      artist: null,
      album: null,
    });

    // It's really in the table, not just echoed back from the call.
    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.body).toBe("Roses are red\nViolets are blue");
  });

  it("persists a supplied year and the lyrics-only fields", async () => {
    const user = freshUser();

    const created = await controller.create({
      userId: user,
      kind: "lyrics",
      title: "A song",
      author: "Songwriter",
      year: 2020,
      artist: "Band",
      album: "Album",
      body: "la la la",
    });

    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({
      kind: "lyrics",
      year: 2020,
      artist: "Band",
      album: "Album",
    });
  });

  it("stores every omitted optional field as NULL", async () => {
    const user = freshUser();

    const created = await controller.create({
      userId: user,
      kind: "lyrics",
      title: "Untitled",
      body: "hums only",
    });

    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({ author: null, year: null, artist: null, album: null });
  });

  it("scopes the saved row to its user — a later list finds exactly it", async () => {
    const mine = freshUser();
    const other = freshUser();
    await controller.create({
      userId: other,
      kind: "poem",
      title: "theirs",
      author: "A",
      body: "not mine",
    });

    const created = await controller.create({
      userId: mine,
      kind: "poem",
      title: "mine",
      author: "A",
      body: "one",
    });

    expect(ids(await controller.list(mine))).toEqual([created.id]);
  });

  it("runs the write on the passed transaction client — a rollback persists nothing", async () => {
    const user = freshUser();

    await expect(
      prisma.$transaction(async (tx) => {
        await controller.create(
          { userId: user, kind: "poem", title: "doomed", author: "A", body: "one" },
          tx,
        );
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    // Had the write ignored `tx` and used the base client, this row would survive.
    expect(await controller.list(user)).toEqual([]);
  });
});
