/**
 * Generated sample data shared between the API stub (`entries.list`) and the web
 * MSW mock, so the two can't drift.
 *
 * `fakeEntries` builds rows shaped like the api-contract's read model: a schema-
 * valid piece whose presentation fields (`title` / `authors` / `artists` /
 * `album`) are dressed with faker's music / person helpers so a seeded Library is
 * eyeball-friendly rather than lorem-filled. A fixed seed makes the output
 * reproducible, so the list doesn't reshuffle between requests and tests can
 * assert against it.
 *
 * Each row carries a real `body` — `excerpt` / `lineCount` / `wordCount` are
 * derived from it via `deriveEntrySummaryFields` (the same function the real API
 * applies on read) and `structure` via `initStructure`, rather than faking those
 * independently of any actual text. That gives `entries.getItem` mocks/fixtures
 * real content to serve.
 */
import { faker } from "@faker-js/faker";
import {
  deriveEntrySummaryFields,
  initStructure,
  type ReadLyricEntryDetail,
} from "@rhymelab/api-contract";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EPOCH = Date.UTC(2026, 7, 12, 12, 0, 0);

/** Arbitrary — fixed only so the generated set is reproducible. */
const DEFAULT_SEED = 20260812;

/**
 * A stable, seeded set of saved entries, newest-edited first. Pass a distinct
 * `seed` to get a different-but-reproducible set (e.g. so the mock and the API
 * stub don't serve identical rows).
 */
export function fakeEntries(
  count = 6,
  { seed = DEFAULT_SEED }: { seed?: number } = {},
): FakeEntry[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, i) => makeEntry(i)).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

/** One short, capitalized lyric-style line (no trailing punctuation). */
function fakeLine(): string {
  const words = faker.lorem.words({ min: 3, max: 7 });
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A multi-section body: several stanzas (blank-line-separated, the delimiter
 * `splitSections` keys off), each a handful of short lines. This gives
 * `structure` a real length to label and lets line-level marks fall *within* a
 * stanza instead of one unbroken block.
 */
function fakeBody(): string {
  const stanzaCount = faker.number.int({ min: 2, max: 5 });
  return Array.from({ length: stanzaCount }, () =>
    Array.from({ length: faker.number.int({ min: 2, max: 6 }) }, fakeLine).join("\n"),
  ).join("\n\n");
}

function makeEntry(rank: number): FakeEntry {
  const kind = faker.datatype.boolean() ? "song" : "poem";
  const body = fakeBody();
  const authors = Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, () =>
    faker.person.fullName(),
  );

  return {
    id: faker.string.uuid(),
    kind,
    title: faker.music.songName(),
    body,
    structure: initStructure(body),
    authors,
    year: faker.number.int({ min: 1990, max: 2025 }),
    artists:
      kind === "song"
        ? Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, () => faker.music.artist())
        : [],
    album: kind === "song" ? faker.music.album() : null,
    ...deriveEntrySummaryFields(body),
    createdAt: new Date(EPOCH - faker.number.int({ min: 40, max: 240 }) * DAY),
    updatedAt: new Date(EPOCH - rank * DAY - faker.number.int({ min: 0, max: 20 }) * HOUR),
  };
}

/**
 * A generated fixture row: the full read-detail shape plus the list-view
 * `excerpt`. `deriveEntrySummaryFields` also supplies `lineCount` / `wordCount`,
 * which the detail model carries too — so one row satisfies both the list and
 * detail projections a mock handler makes from it.
 */
export type FakeEntry = ReadLyricEntryDetail & { excerpt: string };
