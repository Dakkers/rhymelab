/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list a
 * user's saved pieces.
 *
 * The product tables (entries / sections / annotations) were stripped while the
 * data model is redesigned, so there's no `Entry` model to query yet. `list`
 * serves a generated stub (`@rhymelab/fixtures`, shared with the web MSW mock)
 * over the real oRPC transport — the wire shape and the contract are final, so
 * swapping in `prisma.entry.findMany(...)` here is the only change left once the
 * model lands.
 */
import { fakeEntries } from "@rhymelab/fixtures";
import { authed } from "../orpc";

// Generated once at load so the list is stable across requests.
const STUB_ENTRIES = fakeEntries(6);

export const list = authed.entries.list.handler(async () => STUB_ENTRIES);
