import { fakeEntries } from "@rhymelab/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Entry, Prisma } from "../_generated/prisma/client";
import { freshUser, prisma } from "../test-support/integration-db";
import { EntryController, type EntryForLibrary } from "./entry";

/**
 * DB-backed integration tests for `EntryController`. These are deliberately NOT a
 * mirror of the sibling `entry.test.ts`. That file mocks the client and pins the
 * *query the controller builds* — user scoping, the AND-ed `where`, userId staying
 * authoritative over a `where.userId`, the exact `create` payload, and base-vs-`tx`
 * routing — all of which are pure query-construction and need no database. This
 * suite covers only what a mock cannot prove: the truths that require a real
 * Postgres.
 *
 *   - `list`: that `updatedAt`-desc ordering actually happens, and that the user
 *     scope isolates rows with *another user's rows physically present* in the table.
 *   - `create`: the DB-assigned id/timestamps, columns round-tripping through the
 *     schema, omitted optionals landing as real NULLs, and a handed-in transaction
 *     rolling the write back.
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
    body: sampleEntry.body,
    ...overrides,
  };
}

const ids = (entries: EntryForLibrary[]) => entries.map((e) => e.id);

describe("EntryController.listForLibrary (DB-backed)", () => {
  it("isolates the user scope — another user's rows in the table don't leak in", async () => {
    const mine = freshUser();
    const other = freshUser();
    const [mine1, mine2] = await Promise.all([
      prisma.entry.create({ data: entryData(mine, { title: "mine-1" }) }),
      prisma.entry.create({ data: entryData(mine, { title: "mine-2" }) }),
    ]);
    await prisma.entry.create({ data: entryData(other, { title: "theirs" }) });

    const result = await controller.listForLibrary(mine);

    expect(new Set(ids(result))).toEqual(new Set([mine1.id, mine2.id]));
  });

  it("orders newest-edited first (updatedAt desc), regardless of insert order", async () => {
    const user = freshUser();
    // `updated_at` is DB-owned (trigger), so it can't be dictated on insert any
    // more — the ordering has to be established by *editing* the rows, which is
    // what the column means anyway. Insert order and edit order are deliberately
    // different, so passing can't be an artefact of insertion sequence.
    const newest = await prisma.entry.create({ data: entryData(user, { title: "newest" }) });
    const oldest = await prisma.entry.create({ data: entryData(user, { title: "oldest" }) });
    const middle = await prisma.entry.create({ data: entryData(user, { title: "middle" }) });
    for (const entry of [oldest, middle, newest]) {
      await prisma.entry.update({ where: { id: entry.id }, data: { title: entry.title } });
    }

    const result = await controller.listForLibrary(user);

    expect(ids(result)).toEqual([newest.id, middle.id, oldest.id]);
  });
});

describe("EntryController.getDetails (DB-backed)", () => {
  it("returns the entry by id, with userId included for the caller to check ownership", async () => {
    const user = freshUser();
    const entry = await prisma.entry.create({ data: entryData(user, { title: "mine" }) });

    const found = await controller.getDetails(entry.id);

    expect(found).toMatchObject({ id: entry.id, title: "mine", userId: user });
  });

  it("returns another user's entry too — getDetails doesn't scope by owner", async () => {
    const owner = freshUser();
    const entry = await prisma.entry.create({ data: entryData(owner, { title: "theirs" }) });

    const found = await controller.getDetails(entry.id);

    expect(found).toMatchObject({ id: entry.id, userId: owner });
  });

  it("returns null for an id that doesn't exist", async () => {
    expect(await controller.getDetails("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

/** The id the DB's `@default(uuid())` assigns must be what the contract demands. */
const uuidV4 = z.uuidv4();

/**
 * `created_at` and `updated_at` are both maintained by Postgres — a
 * `BEFORE INSERT OR UPDATE` trigger, *not* the column defaults, which this
 * generator resolves client-side so they never fire — precisely so neither can
 * carry the API server's clock. Only a real database can prove that: with a
 * mocked client there is no trigger, just whatever value the test handed in.
 *
 * The lever is a faked `Date` (Date only — timers stay real, or Prisma's own
 * async machinery would stall). A client-side stamp would follow the fake and
 * land in 2001; a DB-side one ignores it entirely.
 */
describe("entries timestamps are stamped by the database clock", () => {
  const FAKE_NOW = new Date("2001-01-01T00:00:00.000Z");

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the DB clock on insert for both columns, not the (faked) Node clock", async () => {
    const user = freshUser();
    vi.useFakeTimers({ toFake: ["Date"], now: FAKE_NOW });

    const created = await controller.create({
      userId: user,
      kind: "poem",
      title: "stamped",
      author: [],
      body: "one",
    });

    vi.useRealTimers();
    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.updatedAt.getUTCFullYear()).not.toBe(2001);
    expect(stored.createdAt.getUTCFullYear()).not.toBe(2001);
    // The two columns are stamped from the same `now()` in one trigger call, so
    // a new row's stamps are identical — never `createdAt` ahead of `updatedAt`,
    // which is what a Node-stamped `createdAt` and a DB-stamped `updatedAt`
    // would produce whenever the app host ran ahead of the database.
    expect(stored.createdAt.getTime()).toBe(stored.updatedAt.getTime());
  });

  it("advances on update from the DB clock, and overrides a client-supplied value", async () => {
    const user = freshUser();
    const created = await controller.create({
      userId: user,
      kind: "poem",
      title: "before",
      author: [],
      body: "one",
    });

    vi.useFakeTimers({ toFake: ["Date"], now: FAKE_NOW });
    // Both levers at once: the Node clock says 2001, *and* the write explicitly
    // asks for 2001. The trigger is unconditional, so neither is honoured.
    await prisma.entry.update({
      where: { id: created.id },
      data: { title: "after", updatedAt: FAKE_NOW },
    });
    vi.useRealTimers();

    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.title).toBe("after");
    expect(stored.updatedAt.getUTCFullYear()).not.toBe(2001);
    expect(stored.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    // `createdAt` is held to its original value across the update — the trigger
    // carries `OLD.created_at` forward rather than letting the write set it.
    expect(stored.createdAt.getTime()).toBe(created.createdAt.getTime());
  });

  it("keeps createdAt immutable even when the update explicitly sets it", async () => {
    const user = freshUser();
    const created = await controller.create({
      userId: user,
      kind: "poem",
      title: "immutable",
      author: [],
      body: "one",
    });

    await prisma.entry.update({
      where: { id: created.id },
      data: { title: "edited", createdAt: FAKE_NOW },
    });

    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.createdAt.getTime()).toBe(created.createdAt.getTime());
  });

  it("agrees with the database's own now(), not the process's", async () => {
    const user = freshUser();
    const created = await controller.create({
      userId: user,
      kind: "poem",
      title: "clock check",
      author: [],
      body: "one",
    });

    const [{ now: dbNow }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    // Same transaction-less back-to-back statements: a DB-stamped row is within
    // seconds of the DB's own clock however far the app host has drifted.
    expect(Math.abs(dbNow.getTime() - created.updatedAt.getTime())).toBeLessThan(10_000);
  });
});

/**
 * `created_at` / `updated_at` are `timestamp(3) without time zone`, so assigning
 * a `timestamptz` (which is what bare `now()` is) makes the stored wall clock
 * depend on the writing session's `TimeZone` — while Prisma reads the column
 * back as UTC. The trigger converts explicitly (`now() AT TIME ZONE 'UTC'`) so
 * that dependence is gone; see the `entry_timestamps_utc` migration.
 *
 * Only a non-UTC session can prove it, and the container runs UTC, so the tests
 * below set the zone themselves — `SET LOCAL` inside a transaction, so it is
 * scoped to the write and rolls off with it rather than leaking to the pooled
 * connection.
 *
 * The drift is measured in SQL rather than in Node: the assertion is about what
 * Postgres *stored*, so routing it through the driver's decoding of a zoneless
 * column would put a second, unrelated timezone convention in the way.
 */
describe("entries timestamps are stamped in UTC whatever the session timezone", () => {
  const ZONE = "America/New_York"; // Any fixed non-UTC zone; this one is -4/-5.

  /** Seconds between the row's stamp and the DB's own UTC clock, read in SQL. */
  async function driftSeconds(id: string, column: "created_at" | "updated_at"): Promise<number> {
    const [{ drift }] = await prisma.$queryRawUnsafe<{ drift: number }[]>(
      `SELECT EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - "${column}"))::float8 AS drift
         FROM "entries" WHERE id = $1::uuid`,
      id,
    );
    return drift;
  }

  it("stamps insert-time columns in UTC from a session on a non-UTC zone", async () => {
    const user = freshUser();

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${ZONE}'`);
      return controller.create(
        { userId: user, kind: "poem", title: "zoned insert", author: [], body: "one" },
        tx,
      );
    });

    // Under the bug both stamps sit a whole UTC offset (hours) away from now().
    expect(Math.abs(await driftSeconds(created.id, "created_at"))).toBeLessThan(10);
    expect(Math.abs(await driftSeconds(created.id, "updated_at"))).toBeLessThan(10);
  });

  it("stamps update-time `updated_at` in UTC from a session on a non-UTC zone", async () => {
    const user = freshUser();
    const created = await controller.create({
      userId: user,
      kind: "poem",
      title: "before",
      author: [],
      body: "one",
    });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${ZONE}'`);
      await tx.entry.update({ where: { id: created.id }, data: { title: "after" } });
    });

    expect(Math.abs(await driftSeconds(created.id, "updated_at"))).toBeLessThan(10);
  });

  it("stamps the `updated_at` column default in UTC too — for writers that skip the trigger", async () => {
    // The trigger overrides every write, so the default is only reachable with
    // the trigger disabled — which is exactly the state a non-Prisma writer
    // relying on the default would be exercising. `DISABLE TRIGGER` is DDL on a
    // shared table, so the whole thing is deliberately forced to roll back: the
    // transaction ends in a throw and the drift is smuggled out through a
    // closure. Letting it commit would leave the table's trigger off for every
    // subsequent test.
    const user = freshUser();
    let drift = Number.NaN;
    const ROLLBACK = new Error("rollback");

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${ZONE}'`);
        await tx.$executeRawUnsafe(
          `ALTER TABLE "entries" DISABLE TRIGGER entries_stamp_timestamps`,
        );
        const [row] = await tx.$queryRawUnsafe<{ updated_at_drift: number }[]>(
          `INSERT INTO "entries" (id, user_id, kind, title, body, created_at)
           VALUES (gen_random_uuid(), $1, 'poem', 'defaulted', 'one', now() AT TIME ZONE 'UTC')
           RETURNING EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - updated_at))::float8
                       AS updated_at_drift`,
          user,
        );
        drift = row.updated_at_drift;
        throw ROLLBACK;
      }),
    ).rejects.toThrow(ROLLBACK);

    expect(Math.abs(drift)).toBeLessThan(10);
    // The rollback really did put the trigger back — otherwise every later test
    // in the file would be silently exercising an untriggered table.
    const [{ enabled }] = await prisma.$queryRaw<{ enabled: string }[]>`
      SELECT tgenabled::text AS enabled FROM pg_trigger WHERE tgname = 'entries_stamp_timestamps'`;
    expect(enabled).toBe("O");
  });
});

/**
 * The app's own connection pins `TimeZone=UTC` (see `../db`), so nothing that
 * reads the session's zone — column defaults, ad-hoc SQL, `CURRENT_DATE` — can
 * inherit whatever a managed host happens to default to. Only a real connection
 * can show this: it is a property of the pool's startup options, invisible to a
 * mocked client.
 *
 * The assertion is on the exact string rather than on an offset, because an
 * offset check would pass on any UTC-equivalent default and prove nothing. The
 * dev container's server default is `Etc/UTC` — equivalent, but *not* what an
 * explicitly pinned session reports — so this fails if the pin is dropped.
 */
describe("the app's connection pins its session timezone", () => {
  it("reports UTC, not the server's default", async () => {
    const [{ TimeZone: zone }] = await prisma.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
    expect(zone).toBe("UTC");
  });

  it("holds across pooled connections, not just the first one opened", async () => {
    // Concurrency forces the pool to hand out more than one backend; a startup
    // option applied to only some of them would be a lurking, load-dependent bug.
    const zones = await Promise.all(
      Array.from({ length: 5 }, () => prisma.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`),
    );

    expect(zones.map(([row]) => row.TimeZone)).toEqual(Array(5).fill("UTC"));
  });
});

describe("EntryController.create (DB-backed)", () => {
  it("persists a poem, letting the DB assign id and timestamps", async () => {
    const user = freshUser();

    const created = await controller.create({
      userId: user,
      kind: "poem",
      title: "A poem",
      author: ["Poet"],
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
      author: ["Poet"],
      body: "Roses are red\nViolets are blue",
      year: null,
      artist: [],
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
      author: ["Songwriter"],
      year: 2020,
      artist: ["Band"],
      album: "Album",
      body: "la la la",
    });

    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({
      kind: "lyrics",
      year: 2020,
      artist: ["Band"],
      album: "Album",
    });
  });

  it("stores omitted optional scalars as NULL and empty lists as empty arrays", async () => {
    const user = freshUser();

    const created = await controller.create({
      userId: user,
      kind: "lyrics",
      title: "Untitled",
      author: [],
      artist: [],
      body: "hums only",
    });

    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({ author: [], year: null, artist: [], album: null });
  });

  it("runs the write on the passed transaction client — a rollback persists nothing", async () => {
    const user = freshUser();

    await expect(
      prisma.$transaction(async (tx) => {
        await controller.create(
          { userId: user, kind: "poem", title: "doomed", author: ["A"], body: "one" },
          tx,
        );
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    // Had the write ignored `tx` and used the base client, this row would survive.
    expect(await controller.listForLibrary(user)).toEqual([]);
  });
});
