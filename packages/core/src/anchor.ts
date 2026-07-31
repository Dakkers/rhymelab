/**
 * Re-anchoring annotations when the lyrics text changes.
 *
 * Annotations are stored as `[startOffset, endOffset)` plus the exact `quote`
 * they covered. After an edit those offsets may no longer point at the same
 * text, so before saving new lyrics we try to re-find each annotation's `quote`
 * in the new string — preferring the occurrence nearest its old position — and
 * fall back to marking it `detached` (kept in the DB, hidden from the text)
 * when the quoted text is gone entirely.
 */

export interface ReanchorResult {
  startOffset: number;
  endOffset: number;
  detached: boolean;
}

/**
 * Find `quote` in `newText`, choosing the occurrence whose start is closest to
 * `oldStart`. Returns the new offsets, or `detached: true` if not found.
 */
export function reanchor(quote: string, oldStart: number, newText: string): ReanchorResult {
  if (quote.length === 0) {
    return { startOffset: oldStart, endOffset: oldStart, detached: true };
  }

  // Fast path: unchanged at the same position.
  if (newText.slice(oldStart, oldStart + quote.length) === quote) {
    return { startOffset: oldStart, endOffset: oldStart + quote.length, detached: false };
  }

  let best = -1;
  let bestDist = Infinity;
  let from = newText.indexOf(quote);
  while (from !== -1) {
    const dist = Math.abs(from - oldStart);
    if (dist < bestDist) {
      bestDist = dist;
      best = from;
    }
    from = newText.indexOf(quote, from + 1);
  }

  if (best === -1) {
    return { startOffset: oldStart, endOffset: oldStart + quote.length, detached: true };
  }
  return { startOffset: best, endOffset: best + quote.length, detached: false };
}
