import * as auth from "./auth/auth.contract";
import * as lyricEntries from "./lyricEntry/lyricEntry.contract";

export const contract = {
  auth: {
    login: auth.login,
    logout: auth.logout,
    me: auth.me,
  },
  lyricEntries: {
    list: lyricEntries.list,
    create: lyricEntries.create,
    getItem: lyricEntries.getItem,
    updateBody: lyricEntries.updateBody,
    updateStructure: lyricEntries.updateStructure,
    delete: lyricEntries.remove,
  },
};

export * from "./lyricEntry/lyricEntry.schemas";
export * from "./lyricEntry/lyricEntry.util";
export { type LyricEntryKind, type LyricEntrySectionType } from "@rhymelab/database";
