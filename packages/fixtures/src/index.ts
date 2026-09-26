/**
 * Seeded sample entries shared by the API stub and the web MSW mock.
 * Summary fields and `structure` are derived from each row's real `body`
 * with the same functions the API uses.
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

const DEFAULT_SEED = 20260812;

/**
 * A deterministic set of entries, newest-edited first. Same `count` and
 * `seed`, same entries.
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

function fakeLine(): string {
  const words = faker.lorem.words({ min: 3, max: 7 });
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A body with several blank-line-separated sections of a few lines each. */
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

/** A fixture row that satisfies both the list and detail read shapes. */
export type FakeEntry = ReadLyricEntryDetail & { excerpt: string };
