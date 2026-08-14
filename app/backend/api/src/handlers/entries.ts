/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list or
 * save a user's saved pieces.
 *
 * Both read from / write to `EntryController` and map Prisma rows onto the
 * contract's `EntrySummary` shape with `toEntrySummary` — which lives in the
 * contract package beside the schema it satisfies, so the web MSW mock and the
 * shared fixtures derive their rows through the very same mapping.
 */
import { toEntrySummary } from "@rhymelab/api-contract";
import { entryController } from "../controllers/entry";
import { authed } from "../orpc";
import { SINGLE_USER_ID } from "../session";

// No accounts yet — every entry is scoped to the single alpha user.
export const list = authed.entries.list.handler(async () => {
  const entries = await entryController.listForLibrary(SINGLE_USER_ID);
  return entries.map(toEntrySummary);
});

export const create = authed.entries.create.handler(async ({ input }) => {
  const entry = await entryController.create({ ...input, userId: SINGLE_USER_ID });
  return toEntrySummary(entry);
});
