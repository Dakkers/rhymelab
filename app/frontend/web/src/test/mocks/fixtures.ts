/**
 * Fixture factories for the API DTOs. Each returns a fully-valid object with
 * sensible defaults; pass `overrides` to set only the fields a test cares about.
 * These are the shapes the mocked oRPC procedures (see `./handlers`) hand back.
 */
import type { AnnotationDTO, EntryDetail, SectionDTO } from "@rhymelab/api-contract";
// The demo lyrics live in the repo's `.dummy/` folder as a plain-text file.
// `?raw` inlines the file's contents at build time (typed via `vite/client`), so
// tests seed an entry from the *real* demo lyrics rather than a hand-written stub.
import longIslandLyricsRaw from "../../../../../../.dummy/DEMO_LongIsland.txt?raw";

/** Raw text of the "Long Island" demo lyrics (`.dummy/DEMO_LongIsland.txt`). */
export const longIslandLyrics = longIslandLyricsRaw;

/** A fixed epoch-ms timestamp so fixtures are deterministic across runs. */
const EPOCH = 1_700_000_000_000;

export function makeEntryDetail(overrides: Partial<EntryDetail> = {}): EntryDetail {
  return {
    id: 1,
    title: "Test Entry",
    kind: "song",
    artist: "Test Artist",
    collection: null,
    year: 2024,
    notes: null,
    lyrics: "First line of the song\nSecond line of the song",
    version: 0,
    tags: [],
    sections: [],
    annotations: [],
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...overrides,
  };
}

/**
 * The canonical demo entry — "Long Island", seeded from the real lyrics file in
 * `.dummy/`. A realistic, multi-stanza entry for exercising the workbench;
 * artist/year fall back to the `makeEntryDetail` defaults.
 */
export function makeLongIslandEntry(overrides: Partial<EntryDetail> = {}): EntryDetail {
  return makeEntryDetail({ title: "Long Island", lyrics: longIslandLyrics, ...overrides });
}

export function makeSection(overrides: Partial<SectionDTO> = {}): SectionDTO {
  return {
    id: 1,
    orderIndex: 0,
    label: "Section 1",
    startOffset: 0,
    endOffset: 0,
    canonicalSectionId: null,
    manualUnlink: false,
    ...overrides,
  };
}

export function makeAnnotation(overrides: Partial<AnnotationDTO> = {}): AnnotationDTO {
  return {
    id: 1,
    sectionId: 1,
    lineInSection: 0,
    startChar: null,
    endChar: null,
    quote: "",
    value: "A",
    detached: false,
    ...overrides,
  };
}
