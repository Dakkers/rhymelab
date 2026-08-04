import { describe, expect, it } from "vitest";
import { alignLines, lcsPairs, levenshtein, similarity } from "./diff";

const eqStr = (a: string, b: string) => a === b;

describe("lcsPairs", () => {
  it("pairs a common subsequence preserving order", () => {
    // a: A B C D   b: A C D  → matches A,C,D
    expect(lcsPairs(["A", "B", "C", "D"], ["A", "C", "D"], eqStr)).toEqual([
      [0, 0],
      [2, 1],
      [3, 2],
    ]);
  });

  it("handles a reorder — keeps the longer in-order run", () => {
    // a: A B  b: B A  → LCS length 1; the matcher takes the first viable ([A,A]).
    const pairs = lcsPairs(["A", "B"], ["B", "A"], eqStr);
    expect(pairs).toHaveLength(1);
  });

  it("is empty when nothing matches", () => {
    expect(lcsPairs(["A", "B"], ["C", "D"], eqStr)).toEqual([]);
  });

  it("matches duplicates left-to-right", () => {
    // Two 'X' in each — LCS length 2, paired in order.
    expect(lcsPairs(["X", "Y", "X"], ["X", "X"], eqStr)).toEqual([
      [0, 0],
      [2, 1],
    ]);
  });
});

describe("alignLines", () => {
  it("marks an edited middle line as replace, keeping the rest equal", () => {
    expect(alignLines(["a", "b", "c"], ["a", "x", "c"])).toEqual([
      { type: "equal", oldIndex: 0, newIndex: 0 },
      { type: "replace", oldIndex: 1, newIndex: 1 },
      { type: "equal", oldIndex: 2, newIndex: 2 },
    ]);
  });

  it("marks a removed line delete and an added line insert", () => {
    expect(alignLines(["a", "b"], ["a"])).toEqual([
      { type: "equal", oldIndex: 0, newIndex: 0 },
      { type: "delete", oldIndex: 1 },
    ]);
    expect(alignLines(["a"], ["a", "b"])).toEqual([
      { type: "equal", oldIndex: 0, newIndex: 0 },
      { type: "insert", newIndex: 1 },
    ]);
  });

  it("pairs a wholesale rewrite positionally as replaces", () => {
    expect(alignLines(["a", "b", "c"], ["x", "y", "z"])).toEqual([
      { type: "replace", oldIndex: 0, newIndex: 0 },
      { type: "replace", oldIndex: 1, newIndex: 1 },
      { type: "replace", oldIndex: 2, newIndex: 2 },
    ]);
  });
});

describe("levenshtein", () => {
  it("is 0 for identical, length for disjoint", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("counts single edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("flaw", "lawn")).toBe(2);
  });
});

describe("similarity", () => {
  it("is 1 for identical (incl. both empty) and drops with edits", () => {
    expect(similarity("hello world", "hello world")).toBe(1);
    expect(similarity("", "")).toBe(1);
    expect(similarity("abcd", "abce")).toBe(0.75); // 1 edit / 4
  });

  it("straddles the 0.5 threshold sensibly", () => {
    // A small tweak to a long line stays well above 0.5 (keeps annotations)...
    expect(similarity("the quick brown fox", "the quick brown box")).toBeGreaterThan(0.5);
    // ...a wholesale rewrite falls below it (detaches).
    expect(similarity("the quick brown fox", "a totally different line")).toBeLessThan(0.5);
  });
});
