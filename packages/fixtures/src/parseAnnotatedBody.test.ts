import { describe, expect, it } from "vitest";
import { UNRHYMED_SENTINEL } from "@rhymelab/api-contract";
import { AnnotatedBodyError, parseAnnotatedBody } from "./parseAnnotatedBody";

describe("parseAnnotatedBody", () => {
  it("strips headers and markers from the body", () => {
    const { body } = parseAnnotatedBody(
      ["[Verse 1]", "one line   | A", "two line | A >", "", "[Chorus]", "three line"].join("\n"),
    );
    expect(body).toBe("one line\ntwo line\n\nthree line");
  });

  it("labels each section from the nearest preceding header", () => {
    const { structure } = parseAnnotatedBody(
      ["[Verse 1]", "a", "", "b", "", "[Pre-Chorus]", "c", "", "[Chorus]", "d"].join("\n"),
    );
    expect(structure).toEqual(["verse", "verse", "prechorus", "chorus"]);
  });

  it("defaults sections before the first header to verse", () => {
    expect(parseAnnotatedBody("a\n\n[Bridge]\nb").structure).toEqual(["verse", "bridge"]);
    expect(parseAnnotatedBody("a\n\nb").structure).toEqual(["verse", "verse"]);
  });

  it("splits a section where a header interrupts it without a blank line", () => {
    expect(parseAnnotatedBody("a\n[Chorus]\nb").structure).toEqual(["verse", "chorus"]);
  });

  it("assigns song-wide group ids in order of first appearance", () => {
    const { annotations } = parseAnnotatedBody(
      ["a | B", "b | C", "c | B", "", "d | C", "e | AA"].join("\n"),
    );
    expect(annotations.map((a) => a.rhymeGroup)).toEqual([1, 2, 1, 2, 3]);
  });

  it("indexes annotations against the returned body, blank lines included", () => {
    const { body, annotations } = parseAnnotatedBody(
      ["[Verse]", "  first  | A", "second", "", "", "[Chorus]", "third | X"].join("\n"),
    );
    const lines = body.split("\n");
    expect(annotations).toEqual([
      { lineIndex: 0, quote: "first", rhymeGroup: 1, enjambed: false },
      { lineIndex: 3, quote: "third", rhymeGroup: UNRHYMED_SENTINEL, enjambed: false },
    ]);
    for (const { lineIndex, quote } of annotations) expect(lines[lineIndex]).toBe(quote);
  });

  it("records enjambment with or without a rhyme group", () => {
    const { annotations } = parseAnnotatedBody("a | >\nb | X >\nc | A");
    expect(annotations.map((a) => [a.rhymeGroup, a.enjambed])).toEqual([
      [null, true],
      [UNRHYMED_SENTINEL, true],
      [1, false],
    ]);
  });

  it("leaves unmarked lines unannotated", () => {
    expect(parseAnnotatedBody("a\nb | A\nc").annotations.map((a) => a.lineIndex)).toEqual([1]);
  });

  it.each([
    ["an unknown header", "[Hook]\na"],
    ["an unknown token", "a | ?"],
    ["two rhyme groups on one line", "a | A B"],
    ["both X and a rhyme group", "a | A X"],
    ["a marker on a blank line", "a\n| A\nb"],
    ["an enjambed last line", "a | A\nb | A >"],
  ])("rejects %s", (_, raw) => {
    expect(() => parseAnnotatedBody(raw)).toThrow(AnnotatedBodyError);
  });
});
