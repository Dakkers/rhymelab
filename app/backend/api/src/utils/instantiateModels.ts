import { LyricEntryOrm, type PrismaClient } from "@rhymelab/database";

export function instantiateDatabaseModels(
    db: PrismaClient
) {
    return {
        LyricEntry: new LyricEntryOrm(db)
    }
}