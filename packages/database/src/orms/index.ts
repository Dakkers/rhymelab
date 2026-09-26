import type { PrismaClient } from "../_generated/prisma/client";
import { LyricEntryOrm } from "./LyricEntry";

export function initializeOrms(factory: { prisma: PrismaClient; readonlyPrisma: PrismaClient }) {
  return {
    LyricEntryOrm: new LyricEntryOrm(factory.prisma),
  };
}
