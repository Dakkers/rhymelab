import {
    initStructure,
    resyncStructure,
    type EntryCreateInput,
    type SectionType,
} from "@rhymelab/api-contract";
import type { LyricEntryModel, Prisma, PrismaClient } from "@rhymelab/database";

export class LyricEntryController {
    #db: PrismaClient;

    constructor(factory: {
        db: PrismaClient
    }) {
        this.#db = factory.db
    }

    /**
     * List a user's lyric entries for the library view, newest-edited first. Soft-deleted rows are excluded.
     *
     * @param userId  Owner whose entries to return.
     * @param tx      Optional transaction client to run the query on.
     */
    async listForLibrary(userId: string, tx?: Prisma.TransactionClient): Promise<EntryForLibrary[]> {
        const db = tx ?? this.#db;
        return db.lyricEntry.findMany({
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
     * Fetch a single lyric entry by id. Returns null for soft-deleted records.
     *
     * @param id  The entry's id.
     * @param tx  Optional transaction client to run the query on.
     */
    async getDetails(id: string, tx?: Prisma.TransactionClient): Promise<EntryDetails | null> {
        const db = tx ?? this.#db;
        return db.lyricEntry.findFirst({
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
     * Fetch just a lyric entry's owner. Returns null for soft-deleted records.
     *
     * @param id  The entry's id.
     * @param tx  Optional transaction client to run the query on.
     */
    async getOwner(id: string, tx?: Prisma.TransactionClient): Promise<Pick<Entry, "userId"> | null> {
        const db = tx ?? this.#db;
        return db.lyricEntry.findFirst({
            where: { id, deletedAt: null },
            select: { userId: true },
        });
    }

    /**
     * Create a new lyric entry. 
     *
     * @param data The row to write — see `entryCreateInputSchema`, plus `userId`.
     * @param tx   Optional transaction client to run the write on.
     */
    async create(
        data: EntryCreateInput & { userId: string },
        tx?: Prisma.TransactionClient,
    ): Promise<LyricEntryModel> {
        const db = tx ?? this.#db;
        return db.lyricEntry.create({ data: { ...data, structure: initStructure(data.body) } });
    }

    /**
     * Replace an entry's text — and re-sync its `structure` to the new sections —
     * returning the updated row in the detail shape (`structure` included).
     *
     * @param id    The entry to rewrite.
     * @param body  The replacement text (already contract-normalized).
     * @param tx    Optional transaction client to run the read + write on.
     */
    async updateBody(
        id: string,
        body: string,
        tx?: Prisma.TransactionClient,
    ): Promise<EntryForDetail> {
        const run = async (client: Prisma.TransactionClient): Promise<EntryForDetail> => {
            const current = await client.lyricEntry.findUniqueOrThrow({
                where: { id },
                select: { body: true, structure: true },
            });
            const structure = resyncStructure(current.body, current.structure, body);
            return client.lyricEntry.update({
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
        return tx ? run(tx) : this.#db.$transaction(run);
    }

    /**
     * Lock a LyricEntry's row.
     *
     * @param id  The LyricEntry to lock.
     * @param tx  The open transaction the lock is held on.
     */
    async lockForRelabel(
        id: string,
        tx: Prisma.TransactionClient,
    ): Promise<Pick<LyricEntryModel, "userId" | "body"> | null> {
        const rows = await tx.$queryRaw<Array<Pick<LyricEntryModel, "userId" | "body">>>`
      SELECT "user_id" AS "userId", "body"
      FROM "entries"
      WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
        return rows[0] ?? null;
    }

    /**
     * Replace an entry's `structure` — its section labels — leaving the body
     * untouched. The mirror of `updateBody`.
     *
     * The caller must pass a full, correctly-sized array: `structure.length` has
     * to equal the entry's current section count, or the invariant this whole
     * feature maintains would break. That check needs the stored body and has to
     * be atomic with this write, so it lives in the handler inside the same
     * transaction, reading the body under `lockForRelabel`'s row lock (see
     * `handlers/entries.ts`) — this method just writes what it's given. Unscoped by
     * owner and tombstone, like `updateBody`.
     *
     * @param id         The entry to relabel.
     * @param structure  The replacement labels — one per body section, in order.
     * @param tx         Optional transaction client to run the write on.
     */
    async updateStructure(
        id: string,
        structure: SectionType[],
        tx?: Prisma.TransactionClient,
    ): Promise<EntryForDetail> {
        const db = tx ?? this.#db;
        return db.lyricEntry.update({
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
     * Unscoped by owner, like `getDetails` — the caller establishes the accessor
     * has permission to the entry (typically by reading `getDetails().userId`
     * first) before calling this.
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
        const db = tx ?? this.#db;
        const affected = await db.$executeRaw`
      UPDATE "entries"
      SET "deleted_at" = (NOW() AT TIME ZONE 'UTC')
      WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL
    `;
        return affected > 0;
    }
}

/**
 * A row as `listForLibrary` returns it — must mirror the `select` below field
 * for field. `Pick`, not `Omit`: a new column added to the schema later stays
 * out of this type (and the query) until someone opts it in here, rather than
 * silently starting to flow through the library view.
 *
 * No `structure`: the library cards don't render it, and it's a whole extra
 * array per row, so the list neither selects nor carries it. The detail reads
 * and writes use {@link EntryForDetail}, which adds it back.
 */
export type EntryForLibrary = Pick<
    LyricEntryModel,
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
 * `EntryForLibrary` plus `structure` — the shape the detail view and the writes
 * that feed it (`getDetails` / `updateBody` / `updateStructure`) return, since
 * unlike a library card the detail renders the section labels.
 */
export type EntryForDetail = EntryForLibrary & Pick<Entry, "structure">;

/**
 * A row as `getDetails` returns it — `EntryForDetail` plus `userId`, since
 * `getDetails` doesn't scope its query by owner: the caller reads `userId`
 * back to establish ownership itself.
 */
export type EntryDetails = EntryForDetail & Pick<Entry, "userId">;
