/**
 * Seeded sample entries shared by the API stub and the web MSW mock.
 * Summary fields and `structure` are derived from each row's real `body`
 * with the same functions the API uses.
 */
import { faker } from "@faker-js/faker";
import {
  deriveEntrySummaryFields,
  initStructure,
  splitSections,
  UNRHYMED_SENTINEL,
  type ReadLineAnnotationRow,
  type ReadLyricEntryDetailRow,
} from "@rhymelab/api-contract";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EPOCH = Date.UTC(2026, 7, 12, 12, 0, 0);

const DEFAULT_SEED = 20260812;

/** Rhyme-scheme letter patterns cycled per stanza; `X` never labels a group. */
const RHYME_SCHEMES: readonly (readonly string[])[] = [
  ["A", "A", "B", "B"],
  ["A", "B", "A", "B"],
  ["A", "B", "B", "A"],
  ["A", "A", "A", "A"],
];

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

/**
 * A deterministic set of line annotations over `body`'s non-blank lines. Same
 * `body` and `seed`, same annotations. Output is the DB/input shape
 * (`ReadLineAnnotationRow[]`, pre-sentinel-transform: `rhymeGroup` carries the
 * raw `-1` sentinel for an unrhymed line, no `unrhymed` field) — what every
 * consumer (mock API, dev seed script) wants, since each hands its rows to
 * oRPC's own output validation, which MUST be the only place the transform runs.
 *
 * Each stanza gets a rhyme scheme (AABB/ABAB/ABBA/AAAA) cycled across its
 * lines; a scheme letter's first appearance in a stanza either starts a new
 * song-wide rhyme group or, occasionally, reuses one from an earlier stanza.
 * A line is occasionally left deliberately unrhymed instead. Enjambment is
 * occasional and never marked on the body's last non-blank line.
 */
export function fakeAnnotations(
  body: string,
  { seed = DEFAULT_SEED }: { seed?: number } = {},
): ReadLineAnnotationRow[] {
  faker.seed(seed);

  const bodyLines = body.split("\n");
  const nonBlankLines = bodyLines
    .map((text, lineIndex) => ({ lineIndex, text }))
    .filter(({ text }) => text.trim() !== "");
  const lastLineIndex = nonBlankLines.at(-1)?.lineIndex;
  const stanzaLineCounts = splitSections(body).map((section) => section.split("\n").length);

  const annotations: ReadLineAnnotationRow[] = [];
  const usedGroups: number[] = [];
  let nextGroup = 1;
  let offset = 0;

  for (const stanzaLength of stanzaLineCounts) {
    const scheme = faker.helpers.arrayElement(RHYME_SCHEMES);
    const letterGroups = new Map<string, number>();
    const stanzaLines = nonBlankLines.slice(offset, offset + stanzaLength);
    offset += stanzaLength;

    for (const [i, { lineIndex, text }] of stanzaLines.entries()) {
      const unrhymed = faker.number.int({ min: 1, max: 10 }) === 1;
      let rhymeGroup: number | null = null;
      if (!unrhymed) {
        const letter = scheme[i % scheme.length];
        if (!letterGroups.has(letter)) {
          const reuseExisting = usedGroups.length > 0 && faker.number.int({ min: 1, max: 10 }) <= 2;
          letterGroups.set(
            letter,
            reuseExisting ? faker.helpers.arrayElement(usedGroups) : nextGroup++,
          );
        }
        rhymeGroup = letterGroups.get(letter) ?? null;
        if (rhymeGroup !== null && !usedGroups.includes(rhymeGroup)) {
          usedGroups.push(rhymeGroup);
        }
      }

      const enjambed = lineIndex !== lastLineIndex && faker.number.int({ min: 1, max: 10 }) <= 2;
      annotations.push({
        lineIndex,
        quote: text,
        rhymeGroup: unrhymed ? UNRHYMED_SENTINEL : rhymeGroup,
        enjambed,
      });
    }
  }

  return annotations;
}

/**
 * A stable numeric seed derived from an entry's id, so each fixture entry's
 * annotations are reproducible and never collide across entries.
 * A plain rolling hash; reproducibility, not cryptographic strength.
 */
function annotationSeedFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
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
  const id = faker.string.uuid();
  const authors = Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, () =>
    faker.person.fullName(),
  );

  return {
    id,
    kind,
    title: faker.music.songName(),
    body,
    structure: initStructure(body),
    annotations: fakeAnnotations(body, { seed: annotationSeedFromId(id) }),
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
export type FakeEntry = ReadLyricEntryDetailRow & { excerpt: string };

export {
  AnnotatedBodyError,
  parseAnnotatedBody,
  type ParsedAnnotatedBody,
} from "./parseAnnotatedBody";
