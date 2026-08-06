/**
 * The API surface, implemented against the api-contract. Ported almost verbatim
 * from the original TanStack Start server functions (`server/entries.ts` +
 * `server/auth.ts`), swapping Drizzle/D1 for Prisma/Postgres.
 *
 * The handlers themselves live under `./handlers`, grouped by domain; this file
 * only assembles them into the router shape the contract expects. The invariant
 * that shapes them is unchanged: **lyrics text is authoritative**, and sections +
 * annotations are addressed against it — the pure `reconcile` (in `@rhymelab/core`)
 * derives every section/annotation change on a lyrics save (see `./handlers/entries`
 * and `./handlers/apply-plan`).
 */
import { os } from "./orpc";
import { login, logout, me } from "./handlers/auth";
import { create, del, get, list, saveLyrics, update } from "./handlers/entries";
import {
  clearLines,
  deleteAnnotation,
  relinkSection,
  setLineGroups,
  unlinkSection,
} from "./handlers/annotations";

export const router = os.router({
  auth: { login, logout, me },
  entries: {
    list,
    get,
    create,
    update,
    saveLyrics,
    delete: del,
    setLineGroups,
    clearLines,
    deleteAnnotation,
    unlinkSection,
    relinkSection,
  },
});
