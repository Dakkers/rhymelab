/**
 * The mock API's in-memory "dummy database".
 *
 * A single mutable store that stands in for the real backend (`@rhymelab/api`)
 * when the app runs in mock mode (`?__mock` — see `#/lib/orpc`). It lives for the
 * lifetime of the JavaScript realm that created it: a browser tab's session, or
 * one SSR render. Mutations (signing in/out, and whatever write procedures the
 * mock grows) persist across requests *within* that session and are gone on a
 * full page reload. Nothing is written to localStorage / sessionStorage /
 * IndexedDB — by design, so every fresh load starts from the same seed.
 *
 * The same store backs the Vitest integration suite, where `resetDb` in the
 * global `afterEach` returns it to the seed between tests.
 */
import { fakeEntries, type FakeEntry } from "@rhymelab/fixtures";

/**
 * A stored piece: the list-view `EntrySummary` plus the full `body` text. `body`
 * is the source of truth — `entries.list` returns the summary fields and
 * `entries.get` returns the detail (base fields + `body`), so the store carries
 * a superset of both. `FakeEntry` is exactly that shape.
 */
export type MockEntry = FakeEntry;

/** Shape of the mock store. Grows a field per "table" as the mock API grows. */
export interface MockDb {
  /** Whether the mock session is signed in — what `auth.me` reports. */
  authed: boolean;
  /** The current user's saved pieces — backs `entries.list`/`get`/`create`. */
  entries: MockEntry[];
}

/**
 * Seed distinct from the API stub's (`fakeEntries()`'s default) so the mock's
 * rows are recognisably the mock's, and small so the seeded Library is easy to
 * eyeball. Fixed, so the generated set is reproducible across reloads and tests.
 */
const SEED = 424242;
const ENTRY_COUNT = 5;

/** Build a fresh store at its seeded starting state. */
export function seedDb(): MockDb {
  return {
    authed: true,
    entries: fakeEntries(ENTRY_COUNT, { seed: SEED }),
  };
}

/**
 * The session-lived singleton every mock procedure reads and writes. Exported as
 * a stable object reference — handlers close over it — so `resetDb` mutates it in
 * place rather than reassigning, keeping those references valid.
 */
export const db: MockDb = seedDb();

/** Return the store to its seeded state — the Vitest `afterEach` calls this. */
export function resetDb(): void {
  const seed = seedDb();
  db.authed = seed.authed;
  db.entries = seed.entries;
}
