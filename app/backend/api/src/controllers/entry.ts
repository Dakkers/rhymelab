/**
 * Data access for the `entries` table. The oRPC handlers stay thin and delegate
 * their queries here, so the Prisma calls live in one place and can be reused
 * (and unit-tested) independently of the transport.
 */
import type { EntryCreateInput } from "@rhymelab/api-contract";
import type { Entry, Prisma } from "../_generated/prisma/client";
import { prisma } from "../db";

export class EntryController {
  /**
   * @param db The base Prisma client. Defaults to the shared singleton; inject a
   *   different client (or a mock) in tests.
   */
  constructor(private readonly db = prisma) {}

  /**
   * List a user's entries, newest-edited first.
   *
   * `userId` is always applied — entries are scoped per user — and takes
   * precedence over any `userId` in `where`. Pass `tx` to run the read inside an
   * open transaction; otherwise it uses the base client.
   *
   * @param userId  Owner whose entries to return.
   * @param where   Optional extra filter, `AND`ed with the user scope.
   * @param tx      Optional transaction client to run the query on.
   */
  list(
    userId: string,
    where?: Prisma.EntryWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Entry[]> {
    const db = tx ?? this.db;
    return db.entry.findMany({
      where: { ...where, userId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Save a new entry. `data` is the submitted piece plus its owning `userId`.
   * Only the raw fields are stored — the list view's excerpt / line count /
   * word count are derived from `body` on read (see the entries handler), so
   * there's nothing to compute here.
   *
   * The optional fields (`author` / `year`, and `artist` / `album` on the lyrics
   * arm) are all nullable columns, so an omitted one arrives as `undefined` and
   * writes as NULL with no coercion needed here.
   *
   * @param data The row to write — see `EntryCreateInputSchema`, plus `userId`.
   * @param tx   Optional transaction client to run the write on.
   */
  create(
    data: EntryCreateInput & { userId: string },
    tx?: Prisma.TransactionClient,
  ): Promise<Entry> {
    const db = tx ?? this.db;
    return db.entry.create({ data });
  }
}

/** Shared instance for handlers to delegate to. */
export const entryController = new EntryController();
