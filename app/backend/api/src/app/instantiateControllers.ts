import type { PrismaClient } from "@rhymelab/database";
import { LyricEntryController } from "../resources/lyricEntry/LyricEntry.Controller";

export function instantiateControllers(factory: { db: PrismaClient }) {
  return {
    LyricEntryController: new LyricEntryController(factory),
  };
}
