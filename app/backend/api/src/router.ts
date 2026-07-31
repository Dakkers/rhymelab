/**
 * The API surface, implemented against the api-contract. Ported almost verbatim
 * from the original TanStack Start server functions (`server/entries.ts` +
 * `server/auth.ts`), swapping Drizzle/D1 for Prisma/Postgres.
 *
 * The handlers themselves live under `./handlers`, grouped by domain; this file
 * only assembles them into the router shape the contract expects. The invariant
 * that shapes them is unchanged: **lyrics text is authoritative**, and sections +
 * annotations anchor to character offsets in it (see `./handlers/entries` and
 * `./handlers/sections`).
 */
import { os } from "./orpc";
import { login, logout, me } from "./handlers/auth";
import { create, del, get, list, saveLyrics, update } from "./handlers/entries";
import { updateSection } from "./handlers/sections";
import { deleteAnnotation, setAnnotation, setAnnotations } from "./handlers/annotations";

export const router = os.router({
  auth: { login, logout, me },
  entries: {
    list,
    get,
    create,
    update,
    saveLyrics,
    delete: del,
    updateSection,
    setAnnotation,
    setAnnotations,
    deleteAnnotation,
  },
});
