/**
 * Small pure diff primitives the reconciler is built on: a longest-common-
 * subsequence matcher (returning index pairs) and a character-similarity ratio.
 * Kept separate from `reconcile.ts` so they can be tested — and reasoned about —
 * in isolation.
 */

/**
 * Align two line sequences into a full edit script. Exact matches (LCS anchors)
 * become `equal`; between anchors, leftover old/new lines pair positionally as
 * `replace` (an edited line — the reconciler decides by char-similarity whether
 * its annotations follow), and the surplus are `delete` (old line gone → its
 * rows detach) or `insert` (new line → starts unannotated). Order preserved.
 */
export function alignLines(oldLines: readonly string[], newLines: readonly string[]): LineOp[] {
  const anchors = lcsPairs(oldLines, newLines, (a, b) => a === b);
  const ops: LineOp[] = [];
  let oi = 0;
  let nj = 0;
  const emitGap = (oEnd: number, nEnd: number): void => {
    while (oi < oEnd && nj < nEnd) ops.push({ type: "replace", oldIndex: oi++, newIndex: nj++ });
    while (oi < oEnd) ops.push({ type: "delete", oldIndex: oi++ });
    while (nj < nEnd) ops.push({ type: "insert", newIndex: nj++ });
  };
  for (const [ai, bj] of anchors) {
    emitGap(ai, bj);
    ops.push({ type: "equal", oldIndex: ai, newIndex: bj });
    oi = ai + 1;
    nj = bj + 1;
  }
  emitGap(oldLines.length, newLines.length);
  return ops;
}

/**
 * Indices `[i, j]` of a longest common subsequence of `a` and `b` under `eq`,
 * in increasing order of both i and j (so the pairing preserves relative order).
 * O(n·m) time and space — fine for the handful of sections/lines an entry has.
 */
export function lcsPairs<T, U>(
  a: readonly T[],
  b: readonly U[],
  eq: (x: T, y: U) => boolean,
): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = eq(a[i]!, b[j]!)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i]!, b[j]!)) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/**
 * Character similarity in `[0, 1]`: `1` for identical strings, `0` for total
 * disagreement, `1 - editDistance/maxLength` between. Two empty strings are `1`.
 * The reconciler's 0.5 threshold (D-17) decides whether an edited line still
 * carries its annotations or detaches them.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Levenshtein edit distance between two strings (UTF-16 code units). */
export function levenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur: number[] = Array.from({ length: m + 1 }, () => 0);
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[m]!;
}

/** One step of a line alignment (see {@link alignLines}). */
export type LineOp =
  | { type: "equal"; oldIndex: number; newIndex: number }
  | { type: "replace"; oldIndex: number; newIndex: number }
  | { type: "delete"; oldIndex: number }
  | { type: "insert"; newIndex: number };
