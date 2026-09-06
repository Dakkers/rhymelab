import type { PrismaClient } from "@rhymelab/database";
import { BaseModel } from './BaseModel'

export class LyricEntryOrm extends BaseModel<"Entry"> {
    constructor(db: PrismaClient) {
        super({ model: "Entry", db });
    }
}
