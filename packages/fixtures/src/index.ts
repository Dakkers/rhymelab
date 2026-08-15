/**
 * Generated sample data shared between the API stub (`entries.list`) and the web
 * MSW mock, so the two can't drift.
 *
 * `fakeEntries` builds rows from the api-contract's own `EntrySummarySchema` with
 * zod-schema-faker: `fake()` picks the `lyrics` / `poem` arm and guarantees a
 * schema-valid shape, then the presentation fields are dressed with faker's music
 * / person helpers — raw schema-faking yields lorem strings and out-of-range
 * numbers (a song titled "Perspiciatis apud", a year in the trillions) that no
 * real library could show. A fixed seed makes the output reproducible, so the
 * list doesn't reshuffle between requests and tests can assert against it.
 *
 * Each row also carries a real `body` — generated first, with `excerpt` /
 * `lineCount` / `wordCount` derived from it via `deriveEntrySummaryFields` (the
 * same function the real API applies on read), rather than faking those three
 * independently of any actual text. That gives `entries.get` mocks/fixtures real
 * content to serve instead of standing in something else for it.
 */
import { faker } from "@faker-js/faker";
import { fake, seed as seedFaker, setFaker } from "zod-schema-faker/v4";
import {
  deriveEntrySummaryFields,
  EntrySummarySchema,
  type EntrySummary,
} from "@rhymelab/api-contract";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EPOCH = Date.UTC(2026, 7, 12, 12, 0, 0); // 2026-08-12T12:00:00Z

/** Arbitrary — fixed only so the generated set is reproducible. */
const DEFAULT_SEED = 20260812;

/** A generated fixture row: the list-view `EntrySummary` plus the `body` it derives from. */
export type FakeEntry = EntrySummary & { body: string };

function makeEntry(rank: number): FakeEntry {
  // zod-schema-faker chooses the arm and produces a schema-valid skeleton.
  const skeleton = fake(EntrySummarySchema);
  // One line per faker.lorem.lines() call, so `deriveEntrySummaryFields` sees a
  // realistic line/word shape rather than one giant unbroken line.
  const body = faker.lorem.lines({ min: 8, max: 80 });
  const shared = {
    id: faker.string.uuid(),
    title: faker.music.songName(),
    // Mostly one writer, sometimes a co-writing credit — so consumers of the
    // fixtures see the multi-value case too.
    author: Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, () =>
      faker.person.fullName(),
    ),
    year: faker.number.int({ min: 1990, max: 2025 }),
    body,
    ...deriveEntrySummaryFields(body),
    createdAt: new Date(EPOCH - faker.number.int({ min: 40, max: 240 }) * DAY).toISOString(),
    // Spread edits out by rank so the seeded list has a clear newest-first order.
    updatedAt: new Date(
      EPOCH - rank * DAY - faker.number.int({ min: 0, max: 20 }) * HOUR,
    ).toISOString(),
  };

  // Honour the arm zod-schema-faker picked so both kinds show up.
  return skeleton.kind === "lyrics"
    ? {
        ...shared,
        kind: "lyrics",
        artist: Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, () =>
          faker.music.artist(),
        ),
        album: faker.music.album(),
      }
    : { ...shared, kind: "poem" };
}

/**
 * A stable, seeded set of saved entries, newest-edited first. Pass a distinct
 * `seed` to get a different-but-reproducible set (e.g. so the mock and the API
 * stub don't serve identical rows).
 */
export function fakeEntries(
  count = 6,
  { seed = DEFAULT_SEED }: { seed?: number } = {},
): FakeEntry[] {
  setFaker(faker);
  seedFaker(seed);
  return Array.from({ length: count }, (_, i) => makeEntry(i)).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}
