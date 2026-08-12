/**
 * Saved entries — the lyrics and poems a signed-in user has stored in their
 * Library.
 *
 * The real data will arrive over oRPC once the entries surface is added to the
 * shared contract (`@rhymelab/api-contract`). Until then `listEntries` returns a
 * hand-written stub so the Library page can be built and reviewed. It's shaped as
 * an async function returning the same row the contract will eventually expose,
 * so the swap is a one-line change in the route loader — not a component rewrite.
 */

/** What kind of piece an entry holds. */
export type EntryKind = "lyrics" | "poem";

/** Fields every saved piece carries, whatever its kind. */
interface EntryBase {
  id: string;
  title: string;
  /** The writer — a poem's poet, or a song's lyricist. */
  author: string;
  /** Publication / release year. */
  year: number;
  /** A short preview of the opening lines, for the card body. */
  excerpt: string;
  lineCount: number;
  wordCount: number;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

/**
 * A poem. The `never`-typed song fields make this arm exclusive: a poem *can't*
 * carry `artist` / `album`, so the union is a true XOR rather than an optional
 * bag — reading `entry.artist` is a type error until you've narrowed on `kind`.
 */
export interface PoemEntry extends EntryBase {
  kind: "poem";
  artist?: never;
  album?: never;
}

/** A song's lyrics — adds the performer and the record it appears on. */
export interface LyricsEntry extends EntryBase {
  kind: "lyrics";
  /** The performing artist or band. */
  artist: string;
  album: string;
}

/** A saved piece: a poem or a song's lyrics, discriminated by `kind`. */
export type EntrySummary = PoemEntry | LyricsEntry;

/**
 * Stub rows. Timestamps are expressed as offsets from a fixed epoch so the list
 * has a stable, recent-looking ordering without reading the wall clock at module
 * load (which would drift between SSR and hydration).
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

/**
 * List the current user's saved entries, newest first.
 *
 * Stubbed for now (see the module doc). The signature mirrors the shape the oRPC
 * procedure will take so the route loader can call `client.entries.list()` in its
 * place later.
 */
export async function listEntries(): Promise<EntrySummary[]> {
  return [...STUB_ENTRIES].sort((a, b) => b.updatedAt - a.updatedAt);
}
