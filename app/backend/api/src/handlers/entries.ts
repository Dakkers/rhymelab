/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list a
 * user's saved pieces.
 *
 * The product tables (entries / sections / annotations) were stripped while the
 * data model is redesigned, so there's no `Entry` model to query yet. `list`
 * serves a generated stub over the real oRPC transport — the wire shape and the
 * contract are final, so swapping in `prisma.entry.findMany(...)` here is the
 * only change left once the model lands.
 */
import { faker } from "@faker-js/faker";
import { fake, seed, setFaker } from "zod-schema-faker/v4";
import { EntrySummarySchema, type EntrySummary } from "@rhymelab/api-contract";
import { authed } from "../orpc";

// zod-schema-faker generates the stub from the contract schema. It needs a faker
// instance to draw from; the fixed seed keeps the stub stable across requests and
// restarts, so the Library list doesn't reshuffle on every navigation.
setFaker(faker);
seed(20260812);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EPOCH = Date.UTC(2026, 7, 12, 12, 0, 0); // 2026-08-12T12:00:00Z

/**
 * One generated entry. `fake(EntrySummarySchema)` produces a schema-valid row —
 * it picks the `lyrics` / `poem` arm and guarantees the shape the contract
 * promises — then we dress the presentation fields with domain-plausible values,
 * because raw schema-faking yields lorem strings and out-of-range numbers (a song
 * titled "Perspiciatis apud", a year in the trillions) that a lyrics/poetry
 * library and its "edited N ago" line can't show.
 */
function makeEntry(rank: number): EntrySummary {
  const skeleton = fake(EntrySummarySchema);
  const title = faker.music.songName();
  const shared = {
    // Suffix keeps ids unique even if two generated titles collide.
    id: `${faker.helpers.slugify(title).toLowerCase()}-${faker.string.alphanumeric({ length: 4, casing: "lower" })}`,
    title,
    author: faker.person.fullName(),
    year: faker.number.int({ min: 1990, max: 2025 }),
    excerpt: `${faker.lorem.words({ min: 5, max: 9 })} / ${faker.lorem.words({ min: 5, max: 9 })}`,
    lineCount: faker.number.int({ min: 8, max: 80 }),
    wordCount: faker.number.int({ min: 60, max: 600 }),
    createdAt: EPOCH - faker.number.int({ min: 40, max: 240 }) * DAY,
    // Spread edits out by rank so the seeded list has a clear newest-first order.
    updatedAt: EPOCH - rank * DAY - faker.number.int({ min: 0, max: 20 }) * HOUR,
  };

  // zod-schema-faker chose the arm; honour it so both kinds show up.
  return skeleton.kind === "lyrics"
    ? { ...shared, kind: "lyrics", artist: faker.music.artist(), album: faker.music.album() }
    : { ...shared, kind: "poem" };
}

const STUB_ENTRIES: EntrySummary[] = Array.from({ length: 6 }, (_, i) => makeEntry(i)).sort(
  (a, b) => b.updatedAt - a.updatedAt,
);

export const list = authed.entries.list.handler(async () => STUB_ENTRIES);
