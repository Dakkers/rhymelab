import * as auth from "./auth.contract";
import * as entries from "./lyricEntry/lyricEntry.contract";

export const contract = {
  auth: {
    login: auth.login,
    logout: auth.logout,
    me: auth.me,
  },
  entries: {
    list: entries.list,
    create: entries.create,
    get: entries.get,
    updateBody: entries.updateBody,
    updateStructure: entries.updateStructure,
    delete: entries.remove,
  },
};

export {
  deriveEntrySummaryFields,
  normalizeEntryBody,
  splitSections,
  initStructure,
  resyncStructure,
} from "./lyricEntry/lyricEntry.util";

export {
  readLyricEntryDetailSchema, readLyricEntryListItemSchema, createLyricEntrySchema,
  sectionTypeSchema,
} from "./lyricEntry/lyricEntry.schemas";

// export type Contract = typeof contract;
// export type {
//   EntrySummary,
//   EntryKind,
//   EntryCreateInput,
//   EntryDetail,
//   SectionType,
//   Annotation,
//   AnnotationGranularity,
//   AnnotationType,
// } from "./entries.contract";
