/**
 * Generated sample data shared between the API stub (`entries.list`) and the web
 * MSW mock, so the two can't drift.
 *
 * `fakeEntries` builds rows from the api-contract's own `entrySummarySchema` with
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
  entrySummarySchema,
  type Annotation,
  type EntrySummary,
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
  setFaker(faker);
  seedFaker(seed);
  return Array.from({ length: count }, (_, i) => makeEntry(i)).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
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
 * `structure` a real length to label and lets line-level annotations (rhyme
 * couplets, enjambment) fall *within* a stanza instead of one unbroken block.
 */
function fakeBody(): string {
  const stanzaCount = faker.number.int({ min: 2, max: 5 });
  return Array.from({ length: stanzaCount }, () =>
    Array.from({ length: faker.number.int({ min: 2, max: 6 }) }, fakeLine).join("\n"),
  ).join("\n\n");
}

function makeEntry(rank: number): FakeEntry {
  const skeleton = fake(entrySummarySchema);
  const body = fakeBody();
  const shared = {
    id: faker.string.uuid(),
    title: faker.music.songName(),
    author: Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, () =>
      faker.person.fullName(),
    ),
    year: faker.number.int({ min: 1990, max: 2025 }),
    body,
    ...deriveEntrySummaryFields(body),
    createdAt: new Date(EPOCH - faker.number.int({ min: 40, max: 240 }) * DAY).toISOString(),
    updatedAt: new Date(
      EPOCH - rank * DAY - faker.number.int({ min: 0, max: 20 }) * HOUR,
    ).toISOString(),
  };

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

/** Spreadsheet-style rhyme-group labels: A, B, … Z, AA, AB, … */
function rhymeLabel(index: number): string {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}

export type FakeAnnotationsOptions = {
  /** Derive one per entry so each piece gets its own stable set. */
  seed?: number;
  /** Cap on the rhyme couplets generated. */
  maxRhymes?: number;
};

/**
 * A deterministic set of sample annotations for `body` — same `body` and
 * `seed`, same marks.
 */
export function fakeAnnotations(
  body: string,
  { seed = DEFAULT_SEED, maxRhymes = 4 }: FakeAnnotationsOptions = {},
): Annotation[] {
  setFaker(faker);
  seedFaker(seed);

  const lines = body.split("\n");
  const isContent = (i: number) => lines[i]?.trim() !== "";
  const annotations: Annotation[] = [];

  for (let i = 0; i + 1 < lines.length; i++) {
    if (isContent(i) && isContent(i + 1)) {
      annotations.push({
        id: faker.string.uuid(),
        granularity: "line",
        type: "enjambment",
        startIndex: i,
        endIndex: i + 2,
        quote: lines.slice(i, i + 2).join("\n"),
        detached: false,
      });
      break;
    }
  }

  let group = 0;
  for (let i = 0; i + 1 < lines.length && group < maxRhymes; ) {
    if (isContent(i) && isContent(i + 1)) {
      annotations.push({
        id: faker.string.uuid(),
        granularity: "line",
        type: "rhyme",
        startIndex: i,
        endIndex: i + 2,
        quote: lines.slice(i, i + 2).join("\n"),
        value: rhymeLabel(group++),
        detached: false,
      });
      i += 2;
    } else {
      i += 1;
    }
  }

  return annotations;
}
/** A generated fixture row: the list-view `EntrySummary` plus the `body` it derives from. */
export type FakeEntry = EntrySummary & { body: string };
