import { describe, expect, it } from "vitest";
import { readLineAnnotationSchema, UNRHYMED_SENTINEL } from "@rhymelab/api-contract";
import { fakeAnnotations } from "./index";

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

  it("emits the DB/input shape directly: rhymeGroup carries the sentinel, no unrhymed field", () => {
    for (const annotation of fakeAnnotations(BODY, { seed: 3 })) {
      expect(annotation).not.toHaveProperty("unrhymed");
      expect(
        annotation.rhymeGroup === UNRHYMED_SENTINEL ||
          annotation.rhymeGroup === null ||
          annotation.rhymeGroup >= 1,
      ).toBe(true);
    }
  });

  it("parses through readLineAnnotationSchema in a single pass, resolving the sentinel", () => {
    for (const annotation of fakeAnnotations(BODY, { seed: 3 })) {
      const wire = readLineAnnotationSchema.parse(annotation);
      expect(wire.unrhymed).toBe(annotation.rhymeGroup === UNRHYMED_SENTINEL);
      expect(wire.rhymeGroup).toBe(
        annotation.rhymeGroup === UNRHYMED_SENTINEL ? null : annotation.rhymeGroup,
      );
    }
  });
});
