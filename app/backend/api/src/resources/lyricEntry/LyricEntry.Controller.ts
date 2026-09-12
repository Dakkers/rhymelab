import {
  initStructure,
  deriveEntrySummaryFields,
  lyricEntryListItemSchema,
  type LyricEntryListItem,
  type ReadLyricEntryDetail,
  type CreateLyricEntryInput,
  readLyricEntryDetailSchema,
  resyncStructure,
  normalizeEntryBody,
  splitSections,
} from "@rhymelab/api-contract";
import type {
  LyricEntryOrm,
  LyricEntrySectionType,
  Prisma,
  PrismaClient,
} from "@rhymelab/database";
import { RlInvalidDataError } from "@rhymelab/utils";

export class LyricEntryController {
  lyricEntryOrm: LyricEntryOrm;

  constructor(factory: { db: PrismaClient; LyricEntryOrm: LyricEntryOrm }) {
    this.lyricEntryOrm = factory.LyricEntryOrm;
  }

  /**
   * Report whether a user owns a lyric entry. A soft-deleted entry is reported as not owned.
   *
   * @param userId   Owner to check the entry against.
   * @param entryId  Entry the request names.
   * @param tx       Optional transaction client to run the query on.
   */
  async userOwns(userId: string, entryId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const db = tx?.lyricEntry ?? this.lyricEntryOrm;
    const row = await db.findFirst({
      where: { id: entryId, userId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Soft-delete a lyric entry. Returns whether a row was still live to delete.
   *
   * @param entryId  Entry to delete.
   * @param tx       Optional transaction client to run the write on.
   */
  async delete(entryId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    return this.lyricEntryOrm.softDelete(entryId, tx);
  }

  /**
   * List a user's lyric entries for the library view, newest-edited first. Soft-deleted rows are excluded.
   *
   * @param userId  Owner whose entries to return.
   * @param tx      Optional transaction client to run the query on.
   */
  async listForLibrary(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LyricEntryListItem[]> {
    const db = tx?.lyricEntry ?? this.lyricEntryOrm;
    const rows = await db.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        kind: true,
        title: true,
        authors: true,
        year: true,
        body: true,
        artists: true,
        album: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => {
      const datum = lyricEntryListItemSchema.parse(row);
      return { ...datum, ...deriveEntrySummaryFields(row.body) };
    });
  }

  /**
   * Fetch a single LyricEntry by id, or null if it doesn't exist or is soft-deleted.
   *
   * @param id  The entry's id.
   * @param tx  Optional transaction client to run the query on.
   */
  async getDetails(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReadLyricEntryDetail | null> {
    const db = tx?.lyricEntry ?? this.lyricEntryOrm;
    const record = await db.findFirst({
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
    if (!record) {
      return null;
    }
    return readLyricEntryDetailSchema.parse({
      ...record,
      ...deriveEntrySummaryFields(record.body),
    });
  }

  /**
   * Save a new LyricEntry.
   *
   * @param data The row to write — see `entryCreateInputSchema`, plus `userId`.
   * @param tx   Optional transaction client to run the write on.
   */
  async create(
    data: CreateLyricEntryInput & { userId: string },
    tx?: Prisma.TransactionClient,
  ): Promise<ReadLyricEntryDetail> {
    const db = tx?.lyricEntry ?? this.lyricEntryOrm;
    const newRecord = await db.create({
      data: { ...data, structure: initStructure(data.body) },
      select: { id: true },
    });
    const result = await this.getDetails(newRecord.id, tx);
    if (!result) {
      throw new Error("Failed to read back newly created lyric entry");
    }
    return result;
  }

  /**
   * Replace an entry's text — and re-sync its `structure` to the new sections —
   * returning the updated row in the detail shape (`structure` included).
   *
   * @param id    The entry to rewrite.
   * @param body  The replacement text
   * @param tx    Transaction client to run the read + write on.
   */
  async updateBody(
    id: string,
    body: string,
    tx: Prisma.TransactionClient,
  ): Promise<ReadLyricEntryDetail> {
    const normalizedBody = normalizeEntryBody(body);

    if (normalizedBody.length === 0) {
      throw new RlInvalidDataError("Lyric entry body cannot be empty");
    }

    const current = await tx.lyricEntry.findUniqueOrThrow({
      where: { id },
      select: { body: true, structure: true },
    });

    const structure = resyncStructure(current.body, current.structure, normalizedBody);

    await tx.lyricEntry.update({
      where: { id },
      data: { body: normalizedBody, structure },
      select: { id: true },
    });

    return this.getDetails(id, tx);
  }

  /**
   * Replace an entry's `structure` — its section labels — leaving the body untouched.
   *
   * @param id         The entry to relabel.
   * @param structure  The replacement labels — one per body section, in order.
   * @param tx         Transaction client to run the write on.
   */
  async updateStructure(
    id: string,
    structure: LyricEntrySectionType[],
    tx: Prisma.TransactionClient,
  ): Promise<ReadLyricEntryDetail> {
    const current = await tx.lyricEntry.findUniqueOrThrow({
      where: { id },
      select: { body: true, structure: true },
    });

    const expectedNumSections = splitSections(current.body).length;

    if (expectedNumSections !== structure.length) {
      throw new RlInvalidDataError(
        "Supplied structure does not match the number of sections in corresponding body",
      );
    }

    await tx.lyricEntry.update({
      where: { id },
      data: { structure },
      select: { id: true },
    });

    return this.getDetails(id, tx);
  }
}
