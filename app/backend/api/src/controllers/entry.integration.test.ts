import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Entry, Prisma } from "../_generated/prisma/client";
import { loadEnv } from "../load-env";

/**
 * DB-backed integration tests for `EntryController.list`. Unlike the sibling
 * `entry.test.ts` (which mocks the client and asserts the *query* built), these
 * run the real Prisma queries against the real local Postgres and assert on rows
 * actually written and read back. They exercise the behaviours end-to-end:
 * userId scoping, `updatedAt`-desc ordering, the AND-ed `where`, userId staying
 * authoritative, and the `tx` path inside a real `$transaction`.
 *
 * Run with `pnpm test:integration` (Postgres must be up on localhost:5433 — see
 * `compose.yaml`). They are excluded from the default `pnpm test` run by the
 * `unit` project in `.config/vitest.config.ts`, so the fast unit run needs no DB.
 *
 * Env is NOT auto-loaded by Vitest, and `../db` reads `DATABASE_URL` the moment
 * it is imported. So we `loadEnv()` first and only then dynamically import `db`
 * and the controller — a static `import` would be hoisted above `loadEnv()` and
 * construct the Prisma client against an empty connection string.
 */
loadEnv();
const { prisma } = await import("../db");
const { EntryController } = await import("./entry");

// Every row this file writes is scoped under a per-run prefix so a failed
// assertion can never leave stray rows behind in the shared dev DB, and two
// concurrent runs can't collide. `Math.random`/`Date.now` are fine here — this
// is an ordinary test process, not a workflow script.
const RUN = `itest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const userA = `${RUN}-userA`;
const userB = `${RUN}-userB`;

const controller = new EntryController(prisma);

/** Minimal valid `Entry` row under this run's scope; override per test. */
function entryData(
  userId: string,
  overrides: Partial<Prisma.EntryCreateManyInput> = {},
): Prisma.EntryCreateManyInput {
  return {
    userId,
    kind: "poem",
    title: "A poem",
    author: "Poet",
    excerpt: "…",
    lineCount: 4,
    wordCount: 20,
    ...overrides,
  };
}

/** Deletes every row this run created — safe to call repeatedly. */
async function cleanup(): Promise<void> {
  await prisma.entry.deleteMany({ where: { userId: { startsWith: RUN } } });
}

beforeAll(async () => {
  // Fail loudly (not silently skip) if Postgres is unreachable — these are
  // integration tests and a green run must mean the DB was actually exercised.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Postgres at DATABASE_URL=${process.env.DATABASE_URL ?? "(unset)"}. ` +
        `Start the local database (see compose.yaml: host port 5433) before running ` +
        `\`pnpm test:integration\`. Underlying error: ${cause}`,
    );
  }
  // Guard against leftovers from a previously-crashed run under a colliding
  // prefix (astronomically unlikely, but cheap to be sure the DB is clean).
  await cleanup();
});

// Robust cleanup: `afterEach` always runs, even when an assertion throws, so a
// failing test can't poison the next one or leave rows behind.
afterEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const ids = (entries: Entry[]) => entries.map((e) => e.id);

describe("EntryController.list (DB-backed)", () => {
  it("returns only the given user's rows", async () => {
    const [mine1, mine2] = await Promise.all([
      prisma.entry.create({ data: entryData(userA, { title: "mine-1" }) }),
      prisma.entry.create({ data: entryData(userA, { title: "mine-2" }) }),
    ]);
    await prisma.entry.create({ data: entryData(userB, { title: "theirs" }) });

    const result = await controller.list(userA);

    expect(new Set(ids(result))).toEqual(new Set([mine1.id, mine2.id]));
    expect(result.every((e) => e.userId === userA)).toBe(true);
  });

  it("orders newest-edited first (updatedAt desc), regardless of insert order", async () => {
    // Insert in a deliberately scrambled `updatedAt` order; Prisma honours an
    // explicit `updatedAt` on create (verified against this schema).
    const oldest = await prisma.entry.create({
      data: entryData(userA, { title: "oldest", updatedAt: new Date("2026-01-01T00:00:00.000Z") }),
    });
    const newest = await prisma.entry.create({
      data: entryData(userA, { title: "newest", updatedAt: new Date("2026-03-01T00:00:00.000Z") }),
    });
    const middle = await prisma.entry.create({
      data: entryData(userA, { title: "middle", updatedAt: new Date("2026-02-01T00:00:00.000Z") }),
    });

    const result = await controller.list(userA);

    expect(ids(result)).toEqual([newest.id, middle.id, oldest.id]);
  });

  it("AND-s the optional `where` with the user scope", async () => {
    const poem = await prisma.entry.create({ data: entryData(userA, { kind: "poem" }) });
    const lyrics = await prisma.entry.create({
      data: entryData(userA, { kind: "lyrics", artist: "Someone", album: "An album" }),
    });

    const result = await controller.list(userA, { kind: "lyrics" });

    expect(ids(result)).toEqual([lyrics.id]);
    expect(ids(result)).not.toContain(poem.id);
  });

  it("keeps userId authoritative — a userId inside `where` cannot widen the scope", async () => {
    const mine = await prisma.entry.create({ data: entryData(userA, { title: "mine" }) });
    await prisma.entry.create({ data: entryData(userB, { title: "theirs" }) });

    // The `where.userId` (userB) must lose to the authoritative `userId` (userA):
    // the controller spreads `userId` last. The AND of userId=userA AND
    // userId=userB would be empty, so a leak would show as userB's row appearing.
    const result = await controller.list(userA, { userId: userB });

    expect(ids(result)).toEqual([mine.id]);
    expect(result.every((e) => e.userId === userA)).toBe(true);
  });

  it("runs the read on the passed transaction client and returns the right rows", async () => {
    const mine = await prisma.entry.create({ data: entryData(userA, { title: "in-tx" }) });
    await prisma.entry.create({ data: entryData(userB, { title: "theirs" }) });

    const result = await prisma.$transaction((tx) => controller.list(userA, undefined, tx));

    expect(ids(result)).toEqual([mine.id]);
    expect(result.every((e) => e.userId === userA)).toBe(true);
  });

  it("returns an empty list for a user with no rows", async () => {
    await prisma.entry.create({ data: entryData(userB) });

    const result = await controller.list(userA);

    expect(result).toEqual([]);
  });
});
