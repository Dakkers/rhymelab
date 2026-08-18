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
    delete: entries.remove,
  },
};

export type Contract = typeof contract;

export {
  EntrySummarySchema,
  EntryCreateInputSchema,
  EntryDetailSchema,
  deriveEntrySummaryFields,
} from "./entries.contract";
export type { EntrySummary, EntryKind, EntryCreateInput, EntryDetail } from "./entries.contract";
