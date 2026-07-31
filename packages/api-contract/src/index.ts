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
    get: entries.get,
    create: entries.create,
    update: entries.update,
    saveLyrics: entries.saveLyrics,
    delete: entries.del,
    updateSection: entries.updateSection,
    setAnnotation: entries.setAnnotation,
    setAnnotations: entries.setAnnotations,
    deleteAnnotation: entries.deleteAnnotation,
  },
};

export type Contract = typeof contract;

/* Canonical DTO schemas + inferred types. */
export {
  AnnotationDTOSchema,
  EntryDetailSchema,
  EntrySummarySchema,
  SectionDTOSchema,
  type AnnotationDTO,
  type EntryDetail,
  type EntrySummary,
  type SectionDTO,
} from "./dtos";

/* Input schemas + inferred input types (forms may reuse them). */
export {
  byId,
  createEntryInput,
  deleteAnnotationInput,
  saveLyricsInput,
  setAnnotationInput,
  setAnnotationsInput,
  updateEntryInput,
  updateSectionInput,
  type CreateEntryInput,
  type SaveLyricsInput,
  type SetAnnotationInput,
  type SetAnnotationsInput,
  type UpdateEntryInput,
} from "./schemas";
