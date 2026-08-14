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
   * Every entry a user owns, newest-edited first — the read behind their library
   * page.
   *
   * The user scope is the entire query: there's no caller-supplied filter that
   * could widen it, so a row can only ever reach the user who owns it. Narrowing
   * the read (search, kind, paging, chosen columns) grows here or as a sibling
   * method when a screen actually needs it, so each call site stays a named
   * query rather than an assembled one.
   *
   * @param userId Owner whose entries to return.
   * @param tx     Optional transaction client to run the query on; defaults to
   *   the base client.
   */
  listForUser(userId: string, tx?: Prisma.TransactionClient): Promise<Entry[]> {
    const db = tx ?? this.db;
    return db.entry.findMany({
      where: { userId },
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
