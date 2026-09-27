/**
 * Tests for `readLineAnnotationSchema`'s sentinel mapping, in
 * `@rhymelab/api-contract`. They live here because that package has no test
 * runner.
 */
import { describe, expect, it } from "vitest";
import { readLineAnnotationSchema, UNRHYMED_SENTINEL } from "@rhymelab/api-contract";

function row(rhymeGroup: number | null) {
  return { lineIndex: 0, quote: "a line", rhymeGroup, enjambed: false };
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
