import { describe, expect, it } from "vitest";
import {
  readLineAnnotationSchema,
  readLyricEntryDetailSchema,
  UNRHYMED_SENTINEL,
} from "./lyricEntry.schemas";

function row(rhymeGroup: number | null) {
  return { lineIndex: 0, quote: "a line", rhymeGroup, enjambed: false };
}

function detailRow(annotations: ReturnType<typeof row>[]) {
  return {
    kind: "poem" as const,
    id: "00000000-0000-0000-0000-000000000000",
    title: "A Title",
    body: "a line",
    authors: [],
    year: null,
    album: null,
    artists: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    structure: [],
    lineCount: 1,
    wordCount: 2,
    annotations,
  };
}

describe("readLineAnnotationSchema", () => {
  it("maps the -1 sentinel to unrhymed with a null rhymeGroup", () => {
    expect(readLineAnnotationSchema.parse(row(UNRHYMED_SENTINEL))).toEqual({
      lineIndex: 0,
      quote: "a line",
      rhymeGroup: null,
      unrhymed: true,
      enjambed: false,
    });
  });

  it("passes a real group id through unchanged", () => {
    expect(readLineAnnotationSchema.parse(row(3))).toEqual({
      lineIndex: 0,
      quote: "a line",
      rhymeGroup: 3,
      unrhymed: false,
      enjambed: false,
    });
  });

  it("treats a null rhymeGroup as not annotated for rhyme, not unrhymed", () => {
    expect(readLineAnnotationSchema.parse(row(null))).toEqual({
      lineIndex: 0,
      quote: "a line",
      rhymeGroup: null,
      unrhymed: false,
      enjambed: false,
    });
  });

  it("rejects a rhymeGroup of 0, which is neither the sentinel nor a valid group id", () => {
    expect(readLineAnnotationSchema.safeParse(row(0)).success).toBe(false);
  });

  it("rejects a negative rhymeGroup other than the sentinel", () => {
    expect(readLineAnnotationSchema.safeParse(row(-2)).success).toBe(false);
  });
});

describe("readLyricEntryDetailSchema (regression: transform must run exactly once)", () => {
  it("resolves a DB-shaped -1 row to unrhymed:true in a single pass", () => {
    const result = readLyricEntryDetailSchema.parse(detailRow([row(UNRHYMED_SENTINEL)]));
    expect(result.annotations[0]).toEqual({
      lineIndex: 0,
      quote: "a line",
      rhymeGroup: null,
      unrhymed: true,
      enjambed: false,
    });
  });
});
