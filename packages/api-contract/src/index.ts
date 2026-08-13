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
  },
};

export type Contract = typeof contract;

export { EntrySummarySchema } from "./entries.contract";
export type { EntrySummary, EntryKind } from "./entries.contract";
