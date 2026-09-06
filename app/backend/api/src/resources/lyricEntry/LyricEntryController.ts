/**
 * Data access for the `entries` table. The oRPC handlers stay thin and delegate
 * their queries here, so the Prisma calls live in one place and can be reused
 * (and unit-tested) independently of the transport.
 */
import {
  initStructure,
  resyncStructure,
  type EntryCreateInput,
  type SectionType,
} from "@rhymelab/api-contract";
import { prisma } from "../../db";
import type { EntryModel } from "@rhymelab/database";

export class EntryController {
  /**
   * @param db The base Prisma client. Defaults to the shared singleton; inject a
   *   different client (or a mock) in tests.
   */
  constructor(private readonly db = prisma) { }

  /**
   * List a user's live entries for the library view, newest-edited first.
   * Soft-deleted rows (`deletedAt` set) are excluded.
   *
   * @param userId  Owner whose entries to return.
   * @param tx      Optional transaction client to run the query on.
   */
  async listForLibrary(userId: string, tx?: Prisma.TransactionClient): Promise<EntryModel[]> {
    const db = tx ?? this.db;
    return db.entry.findMany({
      where: { userId, deletedAt: null },
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
  }

  /**
   * Fetch a single live entry by id
   *
   * @param id  The entry's id.
   * @param tx  Optional transaction client to run the query on.
   */
  async getDetails(id: string, tx?: Prisma.TransactionClient): Promise<EntryDetails | null> {
    const db = tx ?? this.db;
    // `findFirst`, not `findUnique`: the tombstone check is part of the filter and `deletedAt` isn't 
    // a unique column, so the lookup can't go through the unique-where form.
    return db.entry.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        kind: true,
        title: true,
        author: true,
        year: true,
        body: true,
        structure: true,
        artist: true,
        album: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
      },
    });
  }

  /**
   * Fetch just a live entry's owner — the `userId` a handler checks before it
   * mutates the row. A soft-deleted or missing entry reads as `null`, the same as
   * `getDetails`.
   *
   * This is the ownership check on its own, without the rest of the row. A caller
   * that also renders or rewrites the body (`get`) loads the whole thing; one that
   * only gates on ownership before a self-contained write — `updateBody`, whose
   * own transaction re-reads the body and structure it re-syncs from — takes this
   * instead, so the body (which can be the entire lyric) isn't read a second time
   * just to find out who owns it.
   *
   * @param id  The entry's id.
   * @param tx  Optional transaction client to run the query on.
   */
  async getOwner(id: string, tx?: Prisma.TransactionClient): Promise<Pick<Entry, "userId"> | null> {
    const db = tx ?? this.db;
    return db.entry.findFirst({
      where: { id, deletedAt: null },
      select: { userId: true },
    });
  }

  /**
   * Save a new entry. `data` is the submitted piece plus its owning `userId`.
   * Only the raw fields are stored — the list view's excerpt / line count /
   * word count are derived from `body` on read (see the entries handler), so
   * there's nothing to compute here.
   *
   * The optional scalars (`year`, and `album` on the lyrics arm) are nullable
   * columns, so an omitted one arrives as `undefined` and writes as NULL. The
   * list columns (`author` / `artist`) are defaulted to `[]` by the contract, so
   * they always arrive as arrays — no coercion needed here either.
   *
   * `structure` is seeded here, not by the client: one `verse` per section of
   * the (contract-normalized) body, so the piece starts with the invariant
   * `structure.length === section count` already holding and the user relabels
   * afterward. `updateBody` keeps it in sync from then on.
   *
   * @param data The row to write — see `entryCreateInputSchema`, plus `userId`.
   * @param tx   Optional transaction client to run the write on.
   */
  async create(
    data: EntryCreateInput & { userId: string },
    tx?: Prisma.TransactionClient,
  ): Promise<Entry> {
    const db = tx ?? this.db;
    return db.entry.create({ data: { ...data, structure: initStructure(data.body) } });
  }

  async updateBody(
    id: string,
    body: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EntryForDetail> {
    const run = async (client: Prisma.TransactionClient): Promise<EntryForDetail> => {
      const current = await client.entry.findUniqueOrThrow({
        where: { id },
        select: { body: true, structure: true },
      });
      const structure = resyncStructure(current.body, current.structure, body);
      return client.entry.update({
        where: { id },
        data: { body, structure },
        select: {
          id: true,
          kind: true,
          title: true,
          author: true,
          year: true,
          body: true,
          structure: true,
          artist: true,
          album: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    };
    return tx ? run(tx) : this.db.$transaction(run);
  }

  /**
   * Lock a live entry's row and return just what a `structure` relabel has to
   * validate against: its `userId` (ownership) and `body` (section count). A
   * soft-deleted row reads as `null`, like `getDetails`.
   *
   * `SELECT ... FOR UPDATE` is the whole point. The relabel checks the incoming
   * array's length against the body and then writes `structure` — a read-derived
   * write, so without a lock a concurrent `updateBody` could change the section
   * count between the two and leave `structure.length` out of step with `body`,
   * the exact drift this feature exists to prevent. Holding the row until the
   * caller's transaction commits serializes the two: `updateBody`'s write can't
   * land until this relabel is done (or this read blocks until that write
   * commits and then sees the new count and rejects the stale array).
   *
   * `findFirst` can't express `FOR UPDATE`, so this is raw SQL; it selects only
   * the two columns the check needs. Takes a required `tx` — the lock lives only
   * as long as the surrounding transaction, so calling this outside one would
   * lock nothing.
   *
   * @param id  The entry to lock.
   * @param tx  The open transaction the lock is held on.
   */
  async lockForRelabel(
    id: string,
    tx: Prisma.TransactionClient,
  ): Promise<Pick<Entry, "userId" | "body"> | null> {
    const rows = await tx.$queryRaw<Array<Pick<Entry, "userId" | "body">>>`
      SELECT "user_id" AS "userId", "body"
      FROM "entries"
      WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async updateStructure(
    id: string,
    structure: SectionType[],
    tx?: Prisma.TransactionClient,
  ): Promise<EntryForDetail> {
    const db = tx ?? this.db;
    return db.entry.update({
      where: { id },
      data: { structure },
      select: {
        id: true,
        kind: true,
        title: true,
        author: true,
        year: true,
        body: true,
        structure: true,
        artist: true,
        album: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Soft-delete an entry: stamp `deletedAt` so every read path stops returning
   * it, while the row itself stays put and the delete stays reversible.
   *
   * Raw SQL rather than `updateMany`, so the tombstone reads the *database's*
   * clock: Prisma sends a JS `new Date()` as a bind parameter computed in Node,
   * which makes the stamp the API server's wall clock and skews it whenever the
   * two machines disagree.
   *
   * `AT TIME ZONE 'UTC'`, not a bare `NOW()`: `NOW()` is a `timestamptz`, while
   * Prisma maps `DateTime` to `timestamp(3)` *without* a zone. Assigning one to
   * the other converts through whatever `TimeZone` the session happens to have,
   * so on a non-UTC server the tombstone would land in local wall time while
   * every other timestamp in the table is UTC. Converting explicitly makes the
   * statement independent of the server's timezone setting. Connections now pin
   * `TimeZone=UTC` as well (see `database-url.ts`), which makes this belt and
   * braces — deliberately so: the conversion holds for any connection that
   * reaches this table without that option.
   *
   * The statement doesn't mention `updated_at`: since the timestamps moved onto
   * the database clock, an unconditional `BEFORE UPDATE` trigger owns that
   * column, and a `BEFORE` trigger overwrites whatever a statement sets anyway.
   * Note the consequence — a soft delete *does* bump `updated_at`, so restoring
   * an entry later surfaces it at the top of the library as though it had just
   * been edited. Changing that means teaching the trigger to skip a
   * tombstone-only update, which is its call to make, not this statement's.
   *
   * The `deleted_at IS NULL` guard is what keeps this idempotent: a missing id
   * and an already-deleted entry both match nothing and return `false`, so
   * deleting twice is a no-op rather than an error, and the original tombstone
   * is never overwritten with a later one.
   *
   * @param id  The entry to delete.
   * @param tx  Optional transaction client to run the write on.
   * @returns Whether a live entry was actually tombstoned by this call.
   */
  async delete(id: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const db = tx ?? this.db;
    const affected = await db.$executeRaw`
      UPDATE "entries"
      SET "deleted_at" = (NOW() AT TIME ZONE 'UTC')
      WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL
    `;
    return affected > 0;
  }
}

export const entryController = new EntryController();
