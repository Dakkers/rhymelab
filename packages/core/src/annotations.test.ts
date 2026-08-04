import { describe, expect, it } from "vitest";
import {
  NotALineSpanError,
  isLineSpan,
  nonBlankLineSpans,
  planClearLines,
  planSetLineGroups,
  type ExistingAnnotation,
} from "./annotations";

// A tiny two-section lyric. Offsets (line : [start,end)):
//   "one"   0..3      "\n"  3
//   "two"   4..7      "\n"  7
//   ""      8         "\n"  8  (blank)
//   "three" 9..14
const LYRICS = "one\ntwo\n\nthree";

function ann(overrides: Partial<ExistingAnnotation> & { id: number }): ExistingAnnotation {
  return { startOffset: 0, endOffset: 3, value: "A", detached: false, ...overrides };
}

describe("line-span helpers", () => {
  it("nonBlankLineSpans skips blank lines", () => {
    expect(nonBlankLineSpans(LYRICS)).toEqual([
      { startOffset: 0, endOffset: 3 },
      { startOffset: 4, endOffset: 7 },
      { startOffset: 9, endOffset: 14 },
    ]);
  });

  it("isLineSpan is exact — sub-line and cross-line spans are not line spans", () => {
    expect(isLineSpan(LYRICS, 0, 3)).toBe(true); // "one"
    expect(isLineSpan(LYRICS, 9, 14)).toBe(true); // "three"
    expect(isLineSpan(LYRICS, 0, 2)).toBe(false); // "on" (sub-line)
    expect(isLineSpan(LYRICS, 0, 7)).toBe(false); // "one\ntwo" (crosses)
    expect(isLineSpan(LYRICS, 8, 8)).toBe(false); // the blank line
  });
});

describe("planSetLineGroups — replace-at-line (D-4)", () => {
  it("replaces the existing group on a line (no stacking)", () => {
    const existing = [ann({ id: 1, startOffset: 0, endOffset: 3, value: "A" })];
    const plan = planSetLineGroups(LYRICS, existing, [
      { startOffset: 0, endOffset: 3, value: "B" },
    ]);
    expect(plan.deleteIds).toEqual([1]);
    expect(plan.inserts).toEqual([{ startOffset: 0, endOffset: 3, value: "B", quote: "one" }]);
  });

  it("inserts on an empty line", () => {
    const plan = planSetLineGroups(LYRICS, [], [{ startOffset: 4, endOffset: 7, value: "A" }]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([{ startOffset: 4, endOffset: 7, value: "A", quote: "two" }]);
  });

  it("is idempotent — re-stamping the same group is a no-op (D-6)", () => {
    const existing = [ann({ id: 1, startOffset: 0, endOffset: 3, value: "A" })];
    const plan = planSetLineGroups(LYRICS, existing, [
      { startOffset: 0, endOffset: 3, value: "A" },
    ]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([]);
  });

  it("rejects a non-line span", () => {
    expect(() =>
      planSetLineGroups(LYRICS, [], [{ startOffset: 0, endOffset: 2, value: "A" }]),
    ).toThrow(NotALineSpanError);
  });

  it("last write wins when a batch stamps the same line twice", () => {
    const plan = planSetLineGroups(
      LYRICS,
      [],
      [
        { startOffset: 0, endOffset: 3, value: "A" },
        { startOffset: 0, endOffset: 3, value: "C" },
      ],
    );
    // The first insert had no id, so nothing to delete; only the last row remains.
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([{ startOffset: 0, endOffset: 3, value: "C", quote: "one" }]);
  });
});

describe("planSetLineGroups — X-exclusivity (D-5)", () => {
  it("writing X clears every row on the line (incl. a sub-line emphasis row)", () => {
    const existing = [
      ann({ id: 1, startOffset: 0, endOffset: 3, value: "A" }), // whole line
      ann({ id: 2, startOffset: 0, endOffset: 2, value: "A" }), // sub-line emphasis
    ];
    const plan = planSetLineGroups(LYRICS, existing, [
      { startOffset: 0, endOffset: 3, value: "X" },
    ]);
    expect(plan.deleteIds.sort()).toEqual([1, 2]);
    expect(plan.inserts).toEqual([{ startOffset: 0, endOffset: 3, value: "X", quote: "one" }]);
  });

  it("writing a letter removes the line's X row", () => {
    const existing = [ann({ id: 7, startOffset: 4, endOffset: 7, value: "X" })];
    const plan = planSetLineGroups(LYRICS, existing, [
      { startOffset: 4, endOffset: 7, value: "A" },
    ]);
    expect(plan.deleteIds).toEqual([7]);
    expect(plan.inserts).toEqual([{ startOffset: 4, endOffset: 7, value: "A", quote: "two" }]);
  });

  it("re-stamping X on an already-X line is idempotent", () => {
    const existing = [ann({ id: 7, startOffset: 4, endOffset: 7, value: "X" })];
    const plan = planSetLineGroups(LYRICS, existing, [
      { startOffset: 4, endOffset: 7, value: "X" },
    ]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([]);
  });
});

describe("planSetLineGroups — detached rows are inert", () => {
  it("never deletes a detached row, even at the same span", () => {
    const existing = [ann({ id: 1, startOffset: 0, endOffset: 3, value: "A", detached: true })];
    const plan = planSetLineGroups(LYRICS, existing, [
      { startOffset: 0, endOffset: 3, value: "B" },
    ]);
    expect(plan.deleteIds).toEqual([]); // the detached row is untouched
    expect(plan.inserts).toEqual([{ startOffset: 0, endOffset: 3, value: "B", quote: "one" }]);
  });
});

describe("planClearLines (D-3)", () => {
  it("deletes only whole-line rows at the given line spans", () => {
    const existing = [
      ann({ id: 1, startOffset: 0, endOffset: 3, value: "A" }), // on target line
      ann({ id: 2, startOffset: 0, endOffset: 2, value: "A" }), // sub-line — left alone
      ann({ id: 3, startOffset: 4, endOffset: 7, value: "B" }), // other line
    ];
    const plan = planClearLines(LYRICS, existing, [{ startOffset: 0, endOffset: 3 }]);
    expect(plan.deleteIds).toEqual([1]);
  });

  it("rejects a non-line span", () => {
    expect(() => planClearLines(LYRICS, [], [{ startOffset: 0, endOffset: 2 }])).toThrow(
      NotALineSpanError,
    );
  });
});
