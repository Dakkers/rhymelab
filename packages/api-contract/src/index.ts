/**
 * `@rhymelab/api-contract` — the single source of truth both the backend and the
 * frontend type against. The backend `implement(contract)`s it; the frontend
 * derives a typed client via `ContractRouterClient<typeof contract>` without
 * importing any backend code.
 */
import * as auth from "./auth.contract";
import * as entries from "./entries.contract";

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
  entrySummarySchema,
  entryCreateInputSchema,
  entryDetailSchema,
  sectionTypeSchema,
  SECTION_TYPES,
  DEFAULT_SECTION_TYPE,
  annotationSchema,
  annotationGranularitySchema,
  annotationTypeSchema,
  ANNOTATION_GRANULARITIES,
  ANNOTATION_TYPES,
  deriveEntrySummaryFields,
  normalizeEntryBody,
  splitSections,
  initStructure,
  resyncStructure,
} from "./entries.contract";

export type Contract = typeof contract;
export type {
  EntrySummary,
  EntryKind,
  EntryCreateInput,
  EntryDetail,
  SectionType,
  Annotation,
  AnnotationGranularity,
  AnnotationType,
} from "./entries.contract";
