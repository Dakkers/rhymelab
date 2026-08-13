/**
 * Data access for the `entries` table. The oRPC handlers stay thin and delegate
 * their queries here, so the Prisma calls live in one place and can be reused
 * (and unit-tested) independently of the transport.
 */
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
}

/** Shared instance for handlers to delegate to. */
export const entryController = new EntryController();
