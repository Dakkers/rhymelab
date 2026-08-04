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
    setLineGroups: entries.setLineGroups,
    clearLines: entries.clearLines,
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
  clearLinesInput,
  createEntryInput,
  deleteAnnotationInput,
  saveLyricsInput,
  setLineGroupsInput,
  updateEntryInput,
  type ClearLinesInput,
  type CreateEntryInput,
  type SaveLyricsInput,
  type SetLineGroupsInput,
  type UpdateEntryInput,
} from "./schemas";
