/**
 * Entries procedures. Protected (`authed.*`): only a signed-in session may list a
 * user's saved pieces.
 *
 * The product tables (entries / sections / annotations) were stripped while the
 * data model is redesigned, so there's no `Entry` model to query yet. `list`
 * serves a hand-written stub over the real oRPC transport — the wire shape and
 * the contract are final, so swapping in `prisma.entry.findMany(...)` here is the
 * only change left once the model lands.
 */
import type { EntrySummary } from "@rhymelab/api-contract";
import { authed } from "../orpc";

/**
 * Stub rows. Timestamps are offsets from a fixed epoch so ordering is stable and
 * recent-looking without reading the wall clock (which would drift the list
 * between requests).
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EPOCH = Date.UTC(2026, 7, 12, 12, 0, 0); // 2026-08-12T12:00:00Z

const STUB_ENTRIES: EntrySummary[] = [
  {
    kind: "lyrics",
    id: "midnight-static",
    title: "Midnight Static",
    author: "Nora Vance",
    artist: "Nora Vance",
    album: "Neon Liturgy",
    year: 2023,
    excerpt: "City lights bleed through the blinds / I trace the cracks in tired minds",
    lineCount: 42,
    wordCount: 287,
    createdAt: EPOCH - 41 * DAY,
    updatedAt: EPOCH - 2 * HOUR,
  },
  {
    kind: "poem",
    id: "paper-boats",
    title: "Paper Boats",
    author: "Elena Marsh",
    year: 2019,
    excerpt: "We folded the years into paper boats / and set them loose on the gutter's flood",
    lineCount: 18,
    wordCount: 121,
    createdAt: EPOCH - 63 * DAY,
    updatedAt: EPOCH - DAY - 5 * HOUR,
  },
  {
    kind: "lyrics",
    id: "concrete-orchard",
    title: "Concrete Orchard",
    author: "Dominic Reyes",
    artist: "The Gutter Choir",
    album: "Corner Boys",
    year: 2021,
    excerpt: "Nothing grows here but the noise / a chorus of the corner boys",
    lineCount: 56,
    wordCount: 372,
    createdAt: EPOCH - 88 * DAY,
    updatedAt: EPOCH - 3 * DAY,
  },
  {
    kind: "poem",
    id: "low-tide-letters",
    title: "Low Tide Letters",
    author: "Halima Okonkwo",
    year: 2020,
    excerpt: "The sea returns what it can't keep — / salt-blurred ink and someone's sleep",
    lineCount: 24,
    wordCount: 156,
    createdAt: EPOCH - 121 * DAY,
    updatedAt: EPOCH - 9 * DAY,
  },
  {
    kind: "lyrics",
    id: "borrowed-weather",
    title: "Borrowed Weather",
    author: "Saffron Bell",
    artist: "Saffron & the Tide",
    album: "Second Coat",
    year: 2018,
    excerpt: "I wore your storm like a second coat / kept your thunder lodged in my throat",
    lineCount: 38,
    wordCount: 249,
    createdAt: EPOCH - 205 * DAY,
    updatedAt: EPOCH - 27 * DAY,
  },
];

export const list = authed.entries.list.handler(async () =>
  [...STUB_ENTRIES].sort((a, b) => b.updatedAt - a.updatedAt),
);
