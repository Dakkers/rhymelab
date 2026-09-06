export { PrismaClient, Prisma } from "./_generated/prisma/client";
export * from "./_generated/prisma-zod/schemas/models";
export type { LyricEntryModel } from "./_generated/prisma/models/LyricEntry";

export { initializeOrms } from "./orms";
export { LyricEntryOrm } from "./orms/LyricEntry";
