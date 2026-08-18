/**
 * The `structure` domain logic — `splitSections`, `initStructure`, and the
 * drift-preventing `resyncStructure`. These are pure functions exported from
 * `@rhymelab/api-contract`; that package ships no test runner of its own, so
 * they're pinned here (the api package already imports the contract and has
 * Vitest wired up). No ORM is involved — this is entirely our logic.
 *
 * The invariant every case guards, directly or by the explicit length assertion:
 * a resynced `structure` is always exactly one label per section of the new body.
 */
import { describe, expect, it } from "vitest";
import { initStructure, resyncStructure, splitSections } from "@rhymelab/api-contract";

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
    // Leading/trailing blank lines, trailing spaces, and a multi-line gap — the
    // shape `normalizeEntryBody` flattens — still counts as two sections.
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
    // X is inserted after A; B and C must keep chorus/bridge rather than shifting
    // up, the way a naive tail pad/truncate would mislabel them.
    expect(
      resyncStructure("A\n\nB\n\nC", ["verse", "chorus", "bridge"], "A\n\nX\n\nB\n\nC"),
    ).toEqual(["verse", "verse", "chorus", "bridge"]);
  });

  it("drops the removed section's label and keeps the survivors' — the best-guess case", () => {
    // B (chorus) is deleted; A keeps verse and C keeps bridge.
    expect(resyncStructure("A\n\nB\n\nC", ["verse", "chorus", "bridge"], "A\n\nC")).toEqual([
      "verse",
      "bridge",
    ]);
  });

  it("aligns repeated identical sections, defaulting the one the edit adds", () => {
    // A fourth, identical chorus is appended. Exactly one of the two adjacent
    // choruses keeps `chorus` and the added one falls to the default — with
    // identical text the alignment can't tell which block is "new", so which
    // index defaults is incidental; the guarantee is the count and that the
    // non-chorus labels stay put.
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
    // Reorder reads as remove + insert: only one section can align, the other
    // falls back to the default. The count is what's guaranteed.
    expect(resyncStructure("A\n\nB", ["intro", "chorus"], "B\n\nA")).toEqual(["verse", "intro"]);
  });

  it("self-heals a legacy row whose structure predates the column (empty)", () => {
    // A pre-column row reads back `[]`; it's padded to the section count and,
    // since the text is unchanged, every section matches and takes the default.
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
