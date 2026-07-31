/**
 * Fixture factories for the API DTOs. Each returns a fully-valid object with
 * sensible defaults; pass `overrides` to set only the fields a test cares about.
 * These are the shapes the mocked oRPC procedures (see `./handlers`) hand back.
 */
import type { AnnotationDTO, EntryDetail, SectionDTO } from "@rhymelab/api-contract";

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
    tags: [],
    sections: [],
    annotations: [],
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...overrides,
  };
}

export function makeSection(overrides: Partial<SectionDTO> = {}): SectionDTO {
  return {
    id: 1,
    orderIndex: 0,
    type: "verse",
    label: "Verse 1",
    startOffset: 0,
    endOffset: 0,
    ...overrides,
  };
}

export function makeAnnotation(overrides: Partial<AnnotationDTO> = {}): AnnotationDTO {
  return {
    id: 1,
    mode: "rhyme-structure",
    startOffset: 0,
    endOffset: 0,
    quote: "",
    value: null,
    body: null,
    color: null,
    detached: false,
    ...overrides,
  };
}
