/**
 * Data access for the `entries` table. The oRPC handlers stay thin and delegate
 * their queries here, so the Prisma calls live in one place and can be reused
 * (and unit-tested) independently of the transport.
 */
import type { EntryCreateInput } from "@rhymelab/api-contract";
import type { Entry, Prisma } from "../_generated/prisma/client";
import { prisma } from "../db";

/**
 * The row shape a `select` yields: exactly the columns set to `true`, typed with
 * their real column types. Use it to type anything that consumes a `list` result
 * (`SelectedEntry<typeof MY_SELECT>`) instead of reaching for the full `Entry`.
 */
export type SelectedEntry<S extends Prisma.EntrySelect> = Prisma.EntryGetPayload<{ select: S }>;

/**
 * Options for {@link EntryController.list}.
 *
 * `select` is required on purpose: callers have to say which columns they need,
 * so nothing ships a whole row (`body` is the big one) by accident. `Subset`
 * rejects keys that aren't columns, so a typo is a compile error rather than a
 * silently ignored key.
 */
export type EntryListOptions<S extends Prisma.EntrySelect> = {
  /** Columns to return — `{ id: true, title: true }`. */
  select: Prisma.Subset<S, Prisma.EntrySelect>;
  /** Optional extra filter, `AND`ed with the user scope. */
  where?: Prisma.EntryWhereInput;
  /** Transaction client to run the query on; defaults to the base client. */
  tx?: Prisma.TransactionClient;
};

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
   * precedence over any `userId` in `options.where`.
   *
   * The return type follows `options.select`: `list(id, { select: { id: true } })`
   * resolves to `{ id: string }[]`, so touching an unselected column doesn't
   * compile.
   *
   * @param userId  Owner whose entries to return.
   * @param options Columns to select, plus the optional filter / transaction.
   */
  list<S extends Prisma.EntrySelect>(
    userId: string,
    options: EntryListOptions<S>,
  ): Promise<SelectedEntry<S>[]> {
    const db = options.tx ?? this.db;
    // Prisma resolves `findMany`'s row type from the literal it's handed; behind
    // a wrapper `S` is still unresolved, so it can't simplify its conditional
    // types down to `SelectedEntry<S>`. The cast restates what Prisma returns —
    // the same select goes in, so the shape is the one the signature promises.
    return db.entry.findMany({
      where: { ...options.where, userId },
      orderBy: { updatedAt: "desc" },
      select: options.select,
    }) as unknown as Promise<SelectedEntry<S>[]>;
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
