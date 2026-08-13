/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list or
 * save a user's saved pieces.
 *
 * Both read from / write to `EntryController` and map Prisma rows onto the
 * contract's `EntrySummary` shape — a discriminated union on `kind`, so the
 * lyrics-only fields (`artist` / `album`) only get attached on that arm.
 */
import type { EntrySummary } from "@rhymelab/api-contract";
import type { Entry } from "../_generated/prisma/client";
import { entryController } from "../controllers/entry";
import { authed } from "../orpc";
import { SINGLE_USER_ID } from "../session";

/**
 * Derive the list-view fields from the saved `body`. A line is anything between
 * newlines, blank ones included, so `lineCount` reflects the text as written;
 * `excerpt` previews the opening non-blank lines.
 */
function deriveFromBody(body: string) {
  const lines = body.split("\n");
  const preview = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ");
  return {
    excerpt: preview || body.trim(),
    lineCount: lines.length,
    wordCount: body.split(/\s+/).filter(Boolean).length,
  };
}

/** Map a Prisma `Entry` row onto the wire shape the contract promises. */
function toEntrySummary(entry: Entry): EntrySummary {
  const base = {
    id: entry.id,
    title: entry.title,
    author: entry.author,
    year: entry.year ?? undefined,
    ...deriveFromBody(entry.body),
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

export const create = authed.entries.create.handler(async ({ input }) => {
  const entry = await entryController.create({ ...input, userId: SINGLE_USER_ID });
  return toEntrySummary(entry);
});
