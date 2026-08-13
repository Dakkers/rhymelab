/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list a
 * user's saved pieces.
 *
 * `list` reads from `EntryController` and maps each Prisma row onto the
 * contract's `EntrySummary` shape — a discriminated union on `kind`, so the
 * lyrics-only fields (`artist` / `album`) only get attached on that arm.
 */
import type { EntrySummary } from "@rhymelab/api-contract";
import type { Entry } from "../_generated/prisma/client";
import { entryController } from "../controllers/entry";
import { authed } from "../orpc";
import { SINGLE_USER_ID } from "../session";

/** Map a Prisma `Entry` row onto the wire shape the contract promises. */
function toEntrySummary(entry: Entry): EntrySummary {
  const base = {
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
    ? { ...base, kind: "lyrics", artist: entry.artist ?? "", album: entry.album ?? "" }
    : { ...base, kind: "poem" };
}

// No accounts yet — every entry is scoped to the single alpha user.
export const list = authed.entries.list.handler(async () => {
  const entries = await entryController.list(SINGLE_USER_ID);
  return entries.map(toEntrySummary);
});
