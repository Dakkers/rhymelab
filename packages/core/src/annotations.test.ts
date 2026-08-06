import { describe, expect, it } from "vitest";
import {
  InvalidLineAddressError,
  makeWriteContext,
  planClearLines,
  planSetLineGroups,
  type ExistingAnnotation,
  type WriteSection,
} from "./annotations";

// A tiny two-section lyric. Sections (by blank-line split):
//   section 1: "one" (line 0), "two" (line 1)   — offsets [0, 7)
//   section 2: "three" (line 0)                 — offsets [9, 14)
const LYRICS = "one\ntwo\n\nthree";
const SECTIONS: WriteSection[] = [
  { id: 1, startOffset: 0, endOffset: 7, canonicalSectionId: null },
  { id: 2, startOffset: 9, endOffset: 14, canonicalSectionId: null },
];
const ctx = makeWriteContext(LYRICS, SECTIONS);

function ann(overrides: Partial<ExistingAnnotation> & { id: number }): ExistingAnnotation {
  return {
    sectionId: 1,
    lineInSection: 0,
    startChar: null,
    endChar: null,
    value: "A",
    detached: false,
    ...overrides,
  };
}

describe("makeWriteContext", () => {
  it("lineText resolves a section's non-blank lines, null past the end", () => {
    expect(ctx.lineText(1, 0)).toBe("one");
    expect(ctx.lineText(1, 1)).toBe("two");
    expect(ctx.lineText(2, 0)).toBe("three");
    expect(ctx.lineText(1, 2)).toBeNull(); // past the section
    expect(ctx.lineText(99, 0)).toBeNull(); // no such section
  });

  it("redirect follows a linked section's canonical one hop", () => {
    const linked = makeWriteContext(LYRICS, [
      { id: 1, startOffset: 0, endOffset: 7, canonicalSectionId: null },
      { id: 2, startOffset: 9, endOffset: 14, canonicalSectionId: 1 },
    ]);
    expect(linked.redirect(2)).toBe(1);
    expect(linked.redirect(1)).toBe(1);
  });
});

describe("planSetLineGroups — replace-at-line (D-4)", () => {
  it("replaces the existing group on a line (no stacking)", () => {
    const plan = planSetLineGroups(
      ctx,
      [ann({ id: 1, value: "A" })],
      [{ sectionId: 1, lineInSection: 0, value: "B" }],
    );
    expect(plan.deleteIds).toEqual([1]);
    expect(plan.inserts).toEqual([
      { sectionId: 1, lineInSection: 0, startChar: null, endChar: null, value: "B", quote: "one" },
    ]);
  });

  it("inserts on an empty line", () => {
    const plan = planSetLineGroups(ctx, [], [{ sectionId: 1, lineInSection: 1, value: "A" }]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([
      { sectionId: 1, lineInSection: 1, startChar: null, endChar: null, value: "A", quote: "two" },
    ]);
  });

  it("is idempotent — re-stamping the same group is a no-op (D-6)", () => {
    const plan = planSetLineGroups(
      ctx,
      [ann({ id: 1, value: "A" })],
      [{ sectionId: 1, lineInSection: 0, value: "A" }],
    );
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([]);
  });

  it("rejects an address past the section's lines", () => {
    expect(() =>
      planSetLineGroups(ctx, [], [{ sectionId: 1, lineInSection: 5, value: "A" }]),
    ).toThrow(InvalidLineAddressError);
  });

  it("last write wins when a batch stamps the same line twice", () => {
    const plan = planSetLineGroups(
      ctx,
      [],
      [
        { sectionId: 1, lineInSection: 0, value: "A" },
        { sectionId: 1, lineInSection: 0, value: "C" },
      ],
    );
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([
      { sectionId: 1, lineInSection: 0, startChar: null, endChar: null, value: "C", quote: "one" },
    ]);
  });

  it("redirects a write on a linked duplicate to its canonical (§5.3)", () => {
    // Two identical sections; section 2 is a duplicate of section 1.
    const dupLyrics = "aa\nbb\n\naa\nbb";
    const dupSections: WriteSection[] = [
      { id: 1, startOffset: 0, endOffset: 5, canonicalSectionId: null },
      { id: 2, startOffset: 7, endOffset: 12, canonicalSectionId: 1 },
    ];
    const dupCtx = makeWriteContext(dupLyrics, dupSections);
    const plan = planSetLineGroups(dupCtx, [], [{ sectionId: 2, lineInSection: 0, value: "A" }]);
    // The write lands on the canonical (section 1), not the linked duplicate.
    expect(plan.inserts).toEqual([
      { sectionId: 1, lineInSection: 0, startChar: null, endChar: null, value: "A", quote: "aa" },
    ]);
  });
});

describe("planSetLineGroups — X-exclusivity (D-5)", () => {
  it("writing X clears every row on the line (incl. a sub-line emphasis row)", () => {
    const existing = [
      ann({ id: 1, value: "A" }), // whole line
      ann({ id: 2, value: "A", startChar: 0, endChar: 2 }), // sub-line emphasis
    ];
    const plan = planSetLineGroups(ctx, existing, [{ sectionId: 1, lineInSection: 0, value: "X" }]);
    expect(plan.deleteIds.sort()).toEqual([1, 2]);
    expect(plan.inserts).toEqual([
      { sectionId: 1, lineInSection: 0, startChar: null, endChar: null, value: "X", quote: "one" },
    ]);
  });

  it("writing a letter removes the line's X row", () => {
    const existing = [ann({ id: 7, sectionId: 1, lineInSection: 1, value: "X" })];
    const plan = planSetLineGroups(ctx, existing, [{ sectionId: 1, lineInSection: 1, value: "A" }]);
    expect(plan.deleteIds).toEqual([7]);
    expect(plan.inserts).toEqual([
      { sectionId: 1, lineInSection: 1, startChar: null, endChar: null, value: "A", quote: "two" },
    ]);
  });

  it("re-stamping X on an already-X line is idempotent", () => {
    const existing = [ann({ id: 7, sectionId: 1, lineInSection: 1, value: "X" })];
    const plan = planSetLineGroups(ctx, existing, [{ sectionId: 1, lineInSection: 1, value: "X" }]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.inserts).toEqual([]);
  });
});

describe("planSetLineGroups — detached rows are inert", () => {
  it("never deletes a detached row, even at the same line", () => {
    const existing = [ann({ id: 1, value: "A", detached: true })];
    const plan = planSetLineGroups(ctx, existing, [{ sectionId: 1, lineInSection: 0, value: "B" }]);
    expect(plan.deleteIds).toEqual([]); // the detached row is untouched
    expect(plan.inserts).toEqual([
      { sectionId: 1, lineInSection: 0, startChar: null, endChar: null, value: "B", quote: "one" },
    ]);
  });
});

describe("planClearLines (D-3)", () => {
  it("deletes only whole-line rows at the given line address", () => {
    const existing = [
      ann({ id: 1, value: "A" }), // whole line on target
      ann({ id: 2, value: "A", startChar: 0, endChar: 2 }), // sub-line — left alone
      ann({ id: 3, sectionId: 1, lineInSection: 1, value: "B" }), // other line
    ];
    const plan = planClearLines(ctx, existing, [{ sectionId: 1, lineInSection: 0 }]);
    expect(plan.deleteIds).toEqual([1]);
  });

  it("rejects an address past the section's lines", () => {
    expect(() => planClearLines(ctx, [], [{ sectionId: 1, lineInSection: 9 }])).toThrow(
      InvalidLineAddressError,
    );
  });
});
