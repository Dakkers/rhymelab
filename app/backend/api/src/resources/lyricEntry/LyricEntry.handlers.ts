import type { ContractImplementer } from "../../app/createOrpcRouter";
import { SINGLE_USER_ID } from "../../app/session";

export function createLyricEntryHandlers(os: ContractImplementer) {
  return {
    list: os.lyricEntries.list.handler(async ({ context }) => {
      return context.LyricEntryController.listForLibrary(SINGLE_USER_ID);
    }),
  };
}
