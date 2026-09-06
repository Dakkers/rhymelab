/**
 * `@rhymelab/api-contract` — the single source of truth both the backend and the
 * frontend type against. The backend `implement(contract)`s it; the frontend
 * derives a typed client via `ContractRouterClient<typeof contract>` without
 * importing any backend code.
 */
import * as auth from "./auth/auth.contract";
import * as lyricEntries from "./lyricEntry/lyricEntry.contract";
import { deriveEntrySummaryFields } from "./lyricEntry/lyricEntry.util";

export {
  readLyricEntryDetailSchema,
  lyricEntryListItemSchema,
  createLyricEntrySchema,
  sectionTypeSchema,
  type LyricEntryListItem,
  // type LyricEntryListItem,
} from "./lyricEntry/lyricEntry.schemas";

export const contract = {
  auth: {
    login: auth.login,
    logout: auth.logout,
    me: auth.me,
  },
  lyricEntries: {
    list: lyricEntries.list,
    // create: lyricEntries.create,
    // get: lyricEntries.get,
    // updateBody: lyricEntries.updateBody,
    // updateStructure: lyricEntries.updateStructure,
    // delete: lyricEntries.remove,
  },
};

export { deriveEntrySummaryFields }