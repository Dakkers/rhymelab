/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list or
 * save a user's saved pieces.
 *
 * `list` still serves a generated stub (`@rhymelab/fixtures`, shared with the web
 * MSW mock) over the real oRPC transport, pending a real session/user id to scope
 * it by. `create` is the first procedure backed by the real `Entry` model.
 */
import { fakeEntries } from "@rhymelab/fixtures";
import type { Entry } from "../_generated/prisma/client";
import { entryController } from "../controllers/entry";
import { authed } from "../orpc";
import { ALPHA_USER_ID } from "../session";

// Generated once at load so the list is stable across requests.
const STUB_ENTRIES = fakeEntries(6);

export const list = authed.entries.list.handler(async () => STUB_ENTRIES);

/** Map a DB row onto the wire shape `EntrySummarySchema` expects. */
function toSummary(entry: Entry) {
  const shared = {
    id: entry.id,
    title: entry.title,
    author: entry.author,
    year: entry.year ?? undefined,
    excerpt: entry.excerpt,
    lineCount: entry.lineCount,
    wordCount: entry.wordCount,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
  return entry.kind === "lyrics"
    ? { ...shared, kind: "lyrics" as const, artist: entry.artist ?? "", album: entry.album ?? "" }
    : { ...shared, kind: "poem" as const };
}

export const create = authed.entries.create.handler(async ({ input }) => {
  const entry = await entryController.create(ALPHA_USER_ID, input);
  return toSummary(entry);
});
