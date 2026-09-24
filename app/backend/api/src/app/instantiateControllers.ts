import type { PrismaClient, initializeOrms } from "@rhymelab/database";
import { LyricEntryController } from "../resources/lyricEntry/LyricEntry.Controller";

export function instantiateControllers(
  factory: { db: PrismaClient } & ReturnType<typeof initializeOrms>,
) {
  return {
    LyricEntryController: new LyricEntryController(factory),
  };
}
