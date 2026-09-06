import type { LyricEntryModel, Prisma, PrismaClient } from "@rhymelab/database";

export class LyricEntryController {
  #db: PrismaClient;

  constructor(factory: { db: PrismaClient }) {
    this.#db = factory.db;
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
}
