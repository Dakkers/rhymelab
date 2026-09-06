import type { PrismaClient } from "@rhymelab/database";
import { BaseOrm } from './Base'

export class LyricEntryOrm extends BaseOrm<"LyricEntry"> {
    constructor(db: PrismaClient) {
        super({ model: "LyricEntry", db });
    }
}