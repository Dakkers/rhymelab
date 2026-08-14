/**
 * Generated sample data shared between the API's tests, the web MSW mock, and
 * anything else that needs a realistic entry, so the copies can't drift.
 *
 * The generator builds *stored rows* — full `body` text, nullable columns, `Date`
 * timestamps — and derives the wire shape from them with the contract's own
 * `toEntrySummary`. That direction matters: `excerpt` / `lineCount` / `wordCount`
 * are derived from `body` on read and never stored, so faking them directly (as
 * this package used to) produced rows no real endpoint could return — a line
 * count that matched no text, and an `excerpt` that consumers had to press into
 * service as a stand-in `body`. Generating the row and running it through the
 * real mapping keeps every fixture self-consistent by construction.
 *
 * Fields are dressed with faker's music / person helpers rather than left as
 * lorem: raw filler yields entries no real library could show (a song titled
 * "Perspiciatis apud", a year in the trillions). A fixed seed makes the output
 * reproducible, so lists don't reshuffle between requests and tests can assert
 * against them.
 */
import { faker } from "@faker-js/faker";
import { toEntrySummary, type EntryRow, type EntrySummary } from "@rhymelab/api-contract";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EPOCH = Date.UTC(2026, 7, 12, 12, 0, 0); // 2026-08-12T12:00:00Z

/** Arbitrary — fixed only so the generated set is reproducible. */
const DEFAULT_SEED = 20260812;

/** Arbitrary — rows need an owner, and most callers don't care which. */
const DEFAULT_USER_ID = "00000000-0000-4000-8000-00000000user";

/**
 * A few stanzas of real multi-line text. Blank lines between stanzas are
 * deliberate: `lineCount` counts them, so a fixture body exercises the derivation
 * the way a saved poem would.
 */
function fakeBody(): string {
  const stanzas = faker.number.int({ min: 2, max: 5 });
  return Array.from({ length: stanzas }, () =>
    Array.from({ length: faker.number.int({ min: 3, max: 6 }) }, () =>
      faker.lorem.words({ min: 4, max: 9 }),
    ).join("\n"),
  ).join("\n\n");
}

/** One stored row. `rank` spreads edits out so a generated set has a clear order. */
function makeRow(rank: number, userId: string): EntryRow {
  const kind = faker.helpers.arrayElement(["poem", "lyrics"]);
  // Edited most-recently-first by rank; created some time before that edit.
  const updatedAt = new Date(EPOCH - rank * DAY - faker.number.int({ min: 0, max: 20 }) * HOUR);
  const createdAt = new Date(updatedAt.getTime() - faker.number.int({ min: 40, max: 240 }) * DAY);

  return {
    id: faker.string.uuid(),
    userId,
    kind,
    title: faker.music.songName(),
    author: faker.person.fullName(),
    year: faker.number.int({ min: 1990, max: 2025 }),
    body: fakeBody(),
    // Lyrics-only columns; NULL for poems, exactly as the schema stores them.
    artist: kind === "lyrics" ? faker.music.artist() : null,
    album: kind === "lyrics" ? faker.music.album() : null,
    createdAt,
    updatedAt,
  };
}

/**
 * A stable, seeded set of stored entry rows, newest-edited first. Pass a distinct
 * `seed` to get a different-but-reproducible set (e.g. so the web mock and the
 * API's fixtures don't serve identical rows), or a `userId` to scope them.
 */
export function fakeEntryRows(
  count = 6,
  { seed = DEFAULT_SEED, userId = DEFAULT_USER_ID }: { seed?: number; userId?: string } = {},
): EntryRow[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, i) => makeRow(i, userId)).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

/**
 * A single stored row, with fields overridable per test. Deterministic: the same
 * overrides always yield the same row, so tests can assert against it — override
 * whatever the test is actually about and let the rest stay realistic.
 */
export function fakeEntryRow(overrides: Partial<EntryRow> = {}): EntryRow {
  return { ...fakeEntryRows(1)[0], ...overrides };
}

/**
 * The same seeded set as `fakeEntryRows`, mapped onto the wire shape the contract
 * promises — derived through the real `toEntrySummary`, so these are exactly the
 * rows a live endpoint would return.
 */
export function fakeEntries(
  count = 6,
  { seed = DEFAULT_SEED }: { seed?: number } = {},
): EntrySummary[] {
  return fakeEntryRows(count, { seed }).map(toEntrySummary);
}
