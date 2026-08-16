/**
 * Data access for the `entries` table. The oRPC handlers stay thin and delegate
 * their queries here, so the Prisma calls live in one place and can be reused
 * (and unit-tested) independently of the transport.
 */
import type { EntryCreateInput } from "@rhymelab/api-contract";
import type { Entry, Prisma } from "../_generated/prisma/client";
import { prisma } from "../db";

/**
 * A row as `listForLibrary` returns it — must mirror the `select` below field
 * for field. `Pick`, not `Omit`: a new column added to the schema later stays
 * out of this type (and the query) until someone opts it in here, rather than
 * silently starting to flow through the library view.
 */
export type EntryForLibrary = Pick<
  Entry,
  | "id"
  | "kind"
  | "title"
  | "author"
  | "year"
  | "body"
  | "artist"
  | "album"
  | "createdAt"
  | "updatedAt"
>;

/**
 * A row as `getDetails` returns it — `EntryForLibrary` plus `userId`, since
 * `getDetails` doesn't scope its query by owner: the caller reads `userId`
 * back to establish ownership itself.
 */
export type EntryDetails = EntryForLibrary & Pick<Entry, "userId">;

export class EntryController {
  /**
   * @param db The base Prisma client. Defaults to the shared singleton; inject a
   *   different client (or a mock) in tests.
   */
  constructor(private readonly db = prisma) {}

  /**
   * List a user's live entries for the library view, newest-edited first.
   * Soft-deleted rows (`deletedAt` set) are excluded.
   *
   * Selects only the columns `EntryForLibrary` promises — `userId` scopes the
   * query but isn't something callers read back. Pass `tx` to run the read
   * inside an open transaction; otherwise it uses the base client.
   *
   * @param userId  Owner whose entries to return.
   * @param tx      Optional transaction client to run the query on.
   */
  async listForLibrary(userId: string, tx?: Prisma.TransactionClient): Promise<EntryForLibrary[]> {
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
   * Fetch a single live entry by id, unscoped by owner — the caller is
   * responsible for checking the returned row's `userId` (or otherwise
   * establishing the accessor has permission to it) before handing it back over
   * the wire. A soft-deleted entry reads as `null`, the same as a missing one.
   *
   * `findFirst`, not `findUnique`: the tombstone check is part of the filter and
   * `deletedAt` isn't a unique column, so the lookup can't go through the
   * unique-where form.
   *
   * @param id  The entry's id.
   * @param tx  Optional transaction client to run the query on.
   */
  async getDetails(id: string, tx?: Prisma.TransactionClient): Promise<EntryDetails | null> {
    const db = tx ?? this.db;
    return db.entry.findFirst({
      where: { id, deletedAt: null },
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
   * @param data The row to write — see `EntryCreateInputSchema`, plus `userId`.
   * @param tx   Optional transaction client to run the write on.
   */
  async create(
    data: EntryCreateInput & { userId: string },
    tx?: Prisma.TransactionClient,
  ): Promise<Entry> {
    const db = tx ?? this.db;
    return db.entry.create({ data });
  }

  /**
   * Soft-delete an entry: stamp `deletedAt` so every read path stops returning
   * it, while the row itself stays put and the delete stays reversible.
   *
   * Unscoped by owner, like `getDetails` — the caller establishes the accessor
   * has permission to the entry (typically by reading `getDetails().userId`
   * first) before calling this.
   *
   * Raw SQL rather than `updateMany`, so the tombstone reads the *database's*
   * clock: Prisma sends a JS `new Date()` as a bind parameter computed in Node,
   * which makes the stamp the API server's wall clock and skews it whenever the
   * two machines disagree. `NOW()` is evaluated by Postgres, so the value is
   * consistent with anything else that compares it against `now()` in SQL.
   * `updated_at` is set from the same `NOW()` — it's a real modification, and
   * the raw statement bypasses the `@updatedAt` Prisma would otherwise apply.
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
    // Tagged template — `id` is bound as a parameter, never interpolated.
    const affected = await db.$executeRaw`
      UPDATE "entries"
      SET "deleted_at" = NOW(), "updated_at" = NOW()
      WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL
    `;
    return affected > 0;
  }
}

/** Shared instance for handlers to delegate to. */
export const entryController = new EntryController();
