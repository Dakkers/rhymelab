/**
 * The pure line-annotation write semantics — shared verbatim by the backend and
 * the MSW mock so they never drift (D-22). Everything here is a function of the
 * lyrics text plus the rows already stored; the caller applies the returned plan
 * to its own store (Prisma rows, or the in-memory test store).
 *
 * The model (Phase 1): an annotation is a whole-line span carrying a rhyme group.
 * Writes are REPLACE-at-line (D-4) with X-exclusivity (D-5) and idempotent dedupe
 * (D-6). Sub-line ("emphasis") rows can exist in the DB (legacy re-attachment) but
 * are never *written* by these ops; the plan treats them only as things an X or a
 * letter clears off a line.
 */
import { parseLines } from "./lyrics";
import { RHYME_GROUPS, type RhymeGroup } from "./constants";

/** A half-open character span `[startOffset, endOffset)` into the lyrics. */
export interface Span {
  startOffset: number;
  endOffset: number;
}

/** A stored annotation row, reduced to what the write planner needs. */
export interface ExistingAnnotation extends Span {
  id: number;
  value: string;
  /** Detached rows are off the text — never matched or deleted by a write. */
  detached: boolean;
}

/** One line-group write: assign `value` to the whole line at this span. */
export interface LineGroupItem extends Span {
  value: RhymeGroup;
}

/** A row the plan wants created. `quote` is sliced from the current lyrics. */
export interface AnnotationInsert extends Span {
  value: RhymeGroup;
  quote: string;
}

/** The effect of a write batch: rows to hard-delete (by id) and rows to insert. */
export interface AnnotationWritePlan {
  deleteIds: number[];
  inserts: AnnotationInsert[];
}

/**
 * Thrown when a write targets a span that is not exactly one non-blank line. The
 * caller maps it to a 400 — the client should only ever send line spans.
 */
export class NotALineSpanError extends Error {
  constructor(public readonly span: Span) {
    super(`Span [${span.startOffset}, ${span.endOffset}) is not a whole non-blank line`);
    this.name = "NotALineSpanError";
  }
}

/** The `[start, end)` spans of the non-blank lines of `text`. */
export function nonBlankLineSpans(text: string): Span[] {
  return parseLines(text)
    .filter((l) => !l.blank)
    .map((l) => ({ startOffset: l.start, endOffset: l.end }));
}

/** Is `[start, end)` exactly one non-blank line's span in `text`? */
export function isLineSpan(text: string, start: number, end: number): boolean {
  return nonBlankLineSpans(text).some((s) => s.startOffset === start && s.endOffset === end);
}

/** Is this a valid rhyme group (A–F / X)? */
export function isRhymeGroup(value: string): value is RhymeGroup {
  return (RHYME_GROUPS as readonly string[]).includes(value);
}

const sameSpan = (a: Span, b: Span) =>
  a.startOffset === b.startOffset && a.endOffset === b.endOffset;

/** Is `row` within the line span `line` (its span nested inside, incl. equal)? */
const withinLine = (row: Span, line: Span) =>
  row.startOffset >= line.startOffset && row.endOffset <= line.endOffset;

/**
 * A working row while planning: an existing row (has `id`) or one this batch just
 * inserted (no `id`, so removing it costs no delete).
 */
interface WorkingRow extends Span {
  id: number | null;
  value: string;
}

/**
 * Plan a `setLineGroups` batch: REPLACE each targeted line with its new group.
 *
 * Per item (line span `L`, group `V`), the rows removed from `L` are:
 * - REPLACE-at-line (D-4): every row whose span == `L`.
 * - X-exclusivity (D-5): if `V` is `X`, ALSO every row *within* `L` (any span) —
 *   an X clears the whole line; if `V` is a letter, ALSO any `X` row within `L` —
 *   a letter removes the line's "doesn't rhyme" mark.
 * Then one `(L, V)` row is inserted. Idempotent (D-6): if `L` already holds
 * exactly that single `(L, V)` row and nothing else needs clearing, the item is a
 * no-op (no churn of ids/timestamps).
 *
 * Items apply in order against a shared working set, so a later item sees an
 * earlier one's effect (a batch that stamps the same line twice → last wins).
 * Throws {@link NotALineSpanError} if any item's span isn't a whole non-blank line.
 */
export function planSetLineGroups(
  lyrics: string,
  existing: ExistingAnnotation[],
  items: LineGroupItem[],
): AnnotationWritePlan {
  const lineSpans = nonBlankLineSpans(lyrics);
  const isLine = (s: Span) => lineSpans.some((l) => sameSpan(l, s));

  // Only live (attached) rows participate; detached rows are off the text.
  const working: WorkingRow[] = existing
    .filter((r) => !r.detached)
    .map((r) => ({ id: r.id, startOffset: r.startOffset, endOffset: r.endOffset, value: r.value }));

  const deleteIds = new Set<number>();

  for (const item of items) {
    const line: Span = { startOffset: item.startOffset, endOffset: item.endOffset };
    if (!isLine(line)) throw new NotALineSpanError(line);
    const value = item.value;

    // Rows this write clears off the line.
    const toRemove = working.filter((r) => {
      if (sameSpan(r, line)) return true; // replace-at-line
      if (!withinLine(r, line)) return false;
      if (value === "X") return true; // X clears the whole line
      return r.value === "X"; // a letter clears the line's X (incl. a sub-line X)
    });

    // Idempotent: the line already holds exactly the row we'd write, nothing else.
    if (toRemove.length === 1 && sameSpan(toRemove[0]!, line) && toRemove[0]!.value === value) {
      continue;
    }

    for (const r of toRemove) {
      if (r.id !== null) deleteIds.add(r.id); // only persisted rows need a delete
    }
    const removed = new Set(toRemove);
    for (let i = working.length - 1; i >= 0; i--) {
      if (removed.has(working[i]!)) working.splice(i, 1);
    }
    working.push({ id: null, startOffset: line.startOffset, endOffset: line.endOffset, value });
  }

  // Inserts are exactly the rows this batch added that still survive — so a line
  // stamped twice in one batch yields one insert, not a stack (its first insert
  // was spliced out above). id === null ⟺ added here, so `value` is a RhymeGroup.
  const inserts: AnnotationInsert[] = working
    .filter((r) => r.id === null)
    .map((r) => ({
      startOffset: r.startOffset,
      endOffset: r.endOffset,
      value: r.value as RhymeGroup,
      quote: lyrics.slice(r.startOffset, r.endOffset),
    }));

  return { deleteIds: [...deleteIds], inserts };
}

/**
 * Plan a `clearLines` batch: hard-delete the whole-line rows at each given line
 * span (user-explicit clear, D-3). Sub-line rows are left alone. Throws
 * {@link NotALineSpanError} if a span isn't a whole non-blank line.
 */
export function planClearLines(
  lyrics: string,
  existing: ExistingAnnotation[],
  items: Span[],
): { deleteIds: number[] } {
  const isLine = (s: Span) => isLineSpan(lyrics, s.startOffset, s.endOffset);
  const deleteIds = new Set<number>();
  for (const item of items) {
    if (!isLine(item)) throw new NotALineSpanError(item);
    for (const r of existing) {
      if (!r.detached && sameSpan(r, item)) deleteIds.add(r.id);
    }
  }
  return { deleteIds: [...deleteIds] };
}
