import { describe, expect, it } from "vitest";
import {
  buildEntrySections,
  initStructure,
  resyncStructure,
  splitSections,
} from "./lyricEntry.util";

describe("splitSections", () => {
  it("has no sections for an empty body", () => {
    expect(splitSections("")).toEqual([]);
    expect(splitSections("   \n  \n")).toEqual([]);
  });

  it("treats a single block as one section", () => {
    expect(splitSections("one line")).toEqual(["one line"]);
    expect(splitSections("line one\nline two")).toEqual(["line one\nline two"]);
  });

  it("splits on the blank line between sections", () => {
    expect(splitSections("A1\nA2\n\nB1\nB2")).toEqual(["A1\nA2", "B1\nB2"]);
  });

  it("counts sections through ragged whitespace the same as clean input", () => {
    expect(splitSections("\n\n  A  \n\n\n  B\t\n\n")).toEqual(["A", "B"]);
  });
});

describe("initStructure", () => {
  it("assigns one default label per section", () => {
    expect(initStructure("A\n\nB\n\nC")).toEqual(["verse", "verse", "verse"]);
  });

  it("is empty for an empty body", () => {
    expect(initStructure("")).toEqual([]);
  });
});

describe("resyncStructure", () => {
  it("keeps every label when the sections are unchanged", () => {
    expect(resyncStructure("A\n\nB\n\nC", ["verse", "chorus", "bridge"], "A\n\nB\n\nC")).toEqual([
      "verse",
      "chorus",
      "bridge",
    ]);
  });

  it("appends the default when a section is added at the end", () => {
    expect(resyncStructure("A\n\nB", ["verse", "chorus"], "A\n\nB\n\nC")).toEqual([
      "verse",
      "chorus",
      "verse",
    ]);
  });

  it("keeps the labels below an inserted section in place — the anti-drift case", () => {
    expect(
      resyncStructure("A\n\nB\n\nC", ["verse", "chorus", "bridge"], "A\n\nX\n\nB\n\nC"),
    ).toEqual(["verse", "verse", "chorus", "bridge"]);
  });

  it("drops the removed section's label and keeps the survivors' — the best-guess case", () => {
    expect(resyncStructure("A\n\nB\n\nC", ["verse", "chorus", "bridge"], "A\n\nC")).toEqual([
      "verse",
      "bridge",
    ]);
  });

  it("aligns repeated identical sections, defaulting the one the edit adds", () => {
    expect(
      resyncStructure("C\n\nV\n\nC", ["chorus", "verse", "chorus"], "C\n\nV\n\nC\n\nC"),
    ).toEqual(["chorus", "verse", "verse", "chorus"]);
  });

  it("defaults every section when the whole body is replaced", () => {
    expect(resyncStructure("A\n\nB", ["intro", "chorus"], "X\n\nY\n\nZ")).toEqual([
      "verse",
      "verse",
      "verse",
    ]);
  });

  it("preserves the label of a section that moved, defaulting the rest, on reorder", () => {
    expect(resyncStructure("A\n\nB", ["intro", "chorus"], "B\n\nA")).toEqual(["verse", "intro"]);
  });

  it("self-heals a legacy row whose structure predates the column (empty)", () => {
    expect(resyncStructure("A\n\nB\n\nC", [], "A\n\nB\n\nC")).toEqual(["verse", "verse", "verse"]);
  });

  it("coerces a stored label that isn't a current section type to the default", () => {
    expect(resyncStructure("A\n\nB", ["intro", "banana"], "A\n\nB")).toEqual(["intro", "verse"]);
  });

  it("ignores stored labels beyond the section count", () => {
    expect(resyncStructure("A", ["chorus", "bridge", "outro"], "A")).toEqual(["chorus"]);
  });

  it("always returns exactly one label per new section", () => {
    const cases: Array<[string, string[], string]> = [
      ["A\n\nB\n\nC", ["verse", "chorus", "bridge"], "A\n\nX\n\nB\n\nC"],
      ["A\n\nB\n\nC", ["verse", "chorus", "bridge"], "A\n\nC"],
      ["A\n\nB", ["intro", "chorus"], "X\n\nY\n\nZ"],
      ["A\n\nB", [], "A"],
    ];
    for (const [prevBody, prevStructure, nextBody] of cases) {
      expect(resyncStructure(prevBody, prevStructure, nextBody)).toHaveLength(
        splitSections(nextBody).length,
      );
    }
  });
});

describe("buildEntrySections", () => {
  const ann = (
    lineIndex: number,
    rhymeGroup: number | null,
    extra: { unrhymed?: boolean; enjambed?: boolean } = {},
  ) => ({ lineIndex, rhymeGroup, unrhymed: false, enjambed: false, ...extra });

  const letters = (sections: ReturnType<typeof buildEntrySections>) =>
    sections.map((section) => section.lines.map((line) => line.rhyme?.letter ?? null));

  it("restarts letters in each section and keeps groups independent across sections", () => {
    const sections = buildEntrySections(
      "a\nb\n\nc\nd",
      ["verse", "chorus"],
      [ann(0, 3), ann(1, 4), ann(3, 4), ann(4, 3)],
    );
    expect(letters(sections)).toEqual([
      ["A", "B"],
      ["A", "B"],
    ]);
  });

  it("assigns letters by first appearance, not group id", () => {
    const sections = buildEntrySections("a\nb\nc", [], [ann(0, 5), ann(1, 2), ann(2, 5)]);
    expect(letters(sections)).toEqual([["A", "B", "A"]]);
  });

  it("marks unrhymed lines X with a null group", () => {
    const [section] = buildEntrySections("a\nb", [], [ann(0, null, { unrhymed: true }), ann(1, 1)]);
    expect(section.lines[0].rhyme).toEqual({ group: null, letter: "X", unrhymed: true });
    expect(section.lines[1].rhyme).toEqual({ group: 1, letter: "A", unrhymed: false });
  });

  it("leaves rhyme null for a null rhymeGroup and for no annotation", () => {
    const [section] = buildEntrySections("a\nb", [], [ann(0, null)]);
    expect(section.lines.map((line) => line.rhyme)).toEqual([null, null]);
  });

  it("passes enjambed through and defaults it to false", () => {
    const [section] = buildEntrySections("a\nb", [], [ann(0, 1, { enjambed: true })]);
    expect(section.lines.map((line) => line.enjambed)).toEqual([true, false]);
  });

  it("indexes lines song-wide, skipping blank separators", () => {
    const sections = buildEntrySections("a\nb\n\nc\n\nd", [], []);
    expect(sections.map((section) => section.lines.map((line) => line.index))).toEqual([
      [0, 1],
      [3],
      [5],
    ]);
    expect(sections[1].lines[0].text).toBe("c");
  });

  it("defaults missing structure labels to verse", () => {
    const sections = buildEntrySections("a\n\nb\n\nc", ["chorus"], []);
    expect(sections.map((section) => section.type)).toEqual(["chorus", "verse", "verse"]);
  });

  it("drops annotations on blank separators or past the end", () => {
    const sections = buildEntrySections("a\n\nb", [], [ann(1, 1), ann(9, 1), ann(2, 1)]);
    expect(letters(sections)).toEqual([[null], ["A"]]);
  });

  it("continues past Z with AA, AB", () => {
    const body = Array.from({ length: 28 }, (_, i) => `l${i}`).join("\n");
    const [section] = buildEntrySections(
      body,
      [],
      Array.from({ length: 28 }, (_, i) => ann(i, i + 1)),
    );
    expect(section.lines[25].rhyme?.letter).toBe("Z");
    expect(section.lines[26].rhyme?.letter).toBe("AA");
    expect(section.lines[27].rhyme?.letter).toBe("AB");
  });

  it("returns no sections for an empty body", () => {
    expect(buildEntrySections("", [], [])).toEqual([]);
  });
});
