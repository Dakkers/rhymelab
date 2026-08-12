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
 */
import { faker } from "@faker-js/faker";
import { fake, seed as seedFaker, setFaker } from "zod-schema-faker/v4";
import { EntrySummarySchema, type EntrySummary } from "@rhymelab/api-contract";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EPOCH = Date.UTC(2026, 7, 12, 12, 0, 0); // 2026-08-12T12:00:00Z

/** Arbitrary — fixed only so the generated set is reproducible. */
const DEFAULT_SEED = 20260812;

function makeEntry(rank: number): EntrySummary {
  // zod-schema-faker chooses the arm and produces a schema-valid skeleton.
  const skeleton = fake(EntrySummarySchema);
  const shared = {
    id: faker.string.uuid(),
    title: faker.music.songName(),
    author: faker.person.fullName(),
    year: faker.number.int({ min: 1990, max: 2025 }),
    excerpt: `${faker.lorem.words({ min: 5, max: 9 })} / ${faker.lorem.words({ min: 5, max: 9 })}`,
    lineCount: faker.number.int({ min: 8, max: 80 }),
    wordCount: faker.number.int({ min: 60, max: 600 }),
    createdAt: new Date(EPOCH - faker.number.int({ min: 40, max: 240 }) * DAY).toISOString(),
    // Spread edits out by rank so the seeded list has a clear newest-first order.
    updatedAt: new Date(
      EPOCH - rank * DAY - faker.number.int({ min: 0, max: 20 }) * HOUR,
    ).toISOString(),
  };

  // Honour the arm zod-schema-faker picked so both kinds show up.
  return skeleton.kind === "lyrics"
    ? { ...shared, kind: "lyrics", artist: faker.music.artist(), album: faker.music.album() }
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
): EntrySummary[] {
  setFaker(faker);
  seedFaker(seed);
  return Array.from({ length: count }, (_, i) => makeEntry(i)).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}
