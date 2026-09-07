import type { Prisma, PrismaClient } from "@rhymelab/database";
import { BaseOrm } from "./Base";

export class LyricEntryOrm extends BaseOrm<"LyricEntry"> {
  constructor(db: PrismaClient) {
    super({ model: "LyricEntry", db });
  }

  async softDelete(id: string, tx?: Prisma.TransactionClient) {
    return this.softDeleteTemplate("lyric_entries", id, tx);
  }
}
