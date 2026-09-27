/**
 * Tests for `fakeAnnotations`, in `@rhymelab/fixtures`. They live here because
 * that package has no test runner.
 */
import { describe, expect, it } from "vitest";
import { readLineAnnotationSchema, UNRHYMED_SENTINEL } from "@rhymelab/api-contract";
import { fakeAnnotations } from "@rhymelab/fixtures";

const BODY = [
  "the morning light comes soft and slow",
  "across the fields I used to know",
  "",
  "a distant train, a fading sound",
  "somewhere love is always found",
  "and still I wonder, still I stay",
].join("\n");

describe("fakeAnnotations", () => {
  it("is deterministic for a given body and seed", () => {
    expect(fakeAnnotations(BODY, { seed: 7 })).toEqual(fakeAnnotations(BODY, { seed: 7 }));
  });

  it("varies with the seed", () => {
    expect(fakeAnnotations(BODY, { seed: 1 })).not.toEqual(fakeAnnotations(BODY, { seed: 2 }));
  });

  it("addresses only real, non-blank lines of the body, with a matching quote", () => {
    const bodyLines = BODY.split("\n");
    for (const annotation of fakeAnnotations(BODY, { seed: 11 })) {
      expect(bodyLines[annotation.lineIndex]?.trim()).not.toBe("");
      expect(annotation.quote).toBe(bodyLines[annotation.lineIndex]);
    }
  });

  it("never marks the body's last non-blank line as enjambed", () => {
    for (let seed = 0; seed < 25; seed++) {
      const annotations = fakeAnnotations(BODY, { seed });
      expect(annotations.at(-1)?.enjambed).toBe(false);
    }
  });

  it("produces rows that round-trip through the wire schema's sentinel mapping", () => {
    for (const annotation of fakeAnnotations(BODY, { seed: 3 })) {
      const dbShape = {
        lineIndex: annotation.lineIndex,
        quote: annotation.quote,
        rhymeGroup: annotation.unrhymed ? UNRHYMED_SENTINEL : annotation.rhymeGroup,
        enjambed: annotation.enjambed,
      };
      expect(readLineAnnotationSchema.parse(dbShape)).toEqual(annotation);
    }
  });
});
