/**
 * The seeded world as an agent sees it: counts and key IDs scoped to the
 * sandbox login, plus the entry the last flow touched.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Identity } from "./identity.mts";
import { queryRows, type PgBackend } from "./postgres.mts";

/** The user every session maps to. MUST equal `TEMP_USER_ID` in the API's session.ts. */
export const SANDBOX_USER_ID = "c5dfd261-6b04-4dc2-b5eb-97821c01bed5";

export interface WorldState {
  counts: { users: number; entries: number; annotations: number };
  entries: { id: string; title: string; kind: string; sections: number; annotations: number }[];
  lastEntryId: string | null;
}

/** Read the world scoped to the sandbox login. */
export function readWorld(id: Identity, pg: PgBackend): WorldState {
  const [counts] = queryRows<WorldState["counts"]>(
    pg,
    id.db,
    `SELECT (SELECT count(*) FROM users)::int AS users,
            (SELECT count(*) FROM lyric_entries WHERE user_id = '${SANDBOX_USER_ID}' AND deleted_at IS NULL)::int AS entries,
            (SELECT count(*) FROM line_annotations a JOIN lyric_entries e ON e.id = a.entry_id
              WHERE e.user_id = '${SANDBOX_USER_ID}' AND e.deleted_at IS NULL)::int AS annotations`,
  );
  const entries = queryRows<WorldState["entries"][number]>(
    pg,
    id.db,
    `SELECT e.id, e.title, e.kind, cardinality(e.structure) AS sections,
            (SELECT count(*) FROM line_annotations a WHERE a.entry_id = e.id)::int AS annotations
       FROM lyric_entries e
      WHERE e.user_id = '${SANDBOX_USER_ID}' AND e.deleted_at IS NULL
      ORDER BY e.created_at, e.title`,
  );
  return {
    counts: counts ?? { users: 0, entries: 0, annotations: 0 },
    entries,
    lastEntryId: readLastEntryId(id),
  };
}

/** The entry the most recent flow created or touched, or null. */
export function readLastEntryId(id: Identity): string | null {
  try {
    return (JSON.parse(readFileSync(lastFile(id), "utf8")) as { entryId?: string }).entryId ?? null;
  } catch {
    return null;
  }
}

/** Record `entryId` for `--last`. A null clears it. */
export function writeLastEntryId(id: Identity, entryId: string | null): void {
  mkdirSync(id.stateDir, { recursive: true });
  writeFileSync(lastFile(id), JSON.stringify({ entryId }));
}

function lastFile(id: Identity): string {
  return join(id.stateDir, "last.json");
}
