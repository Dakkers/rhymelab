/**
 * The pure line-annotation write semantics — shared verbatim by the backend and
 * the MSW mock so they never drift (D-22). Everything here is a function of the
 * entry's sections/lyrics plus the rows already stored; the caller applies the
 * returned plan to its own store (Prisma rows, or the in-memory test store).
 *
 * The model (Phase 2): an annotation is addressed by `(sectionId, lineInSection)`
 * plus an optional sub-line char range. Writes are REPLACE-at-line (D-4) with
 * X-exclusivity (D-5), idempotent dedupe (D-6), and a write-redirect (§5.3): a
 * write addressed to a linked duplicate resolves one hop to its canonical, so
 * every copy shares the one canonical's rows. Sub-line ("emphasis") rows can exist
 * in the DB (reconciler re-attachment) but are never *written* by these ops; the
 * plan treats them only as things an X or a letter clears off a line.
 */
import { parseLines } from "./lyrics";
import { RHYME_GROUPS, type RhymeGroup } from "./constants";

/**
 * Build a {@link WriteContext} from the stored lyrics + sections. `redirect`
 * follows a section's `canonicalSectionId` one hop (I2 guarantees that suffices);
 * `lineText` slices the section's non-blank lines from the lyrics.
 */
export function makeWriteContext(lyrics: string, sections: WriteSection[]): WriteContext {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const lines = parseLines(lyrics);
  const sectionLines = (sectionId: number): string[] => {
    const s = byId.get(sectionId);
    if (!s) return [];
    return lines
      .filter((l) => !l.blank && l.start >= s.startOffset && l.end <= s.endOffset)
      .map((l) => l.text);
  };
  return {
    redirect: (sectionId) => byId.get(sectionId)?.canonicalSectionId ?? sectionId,
    lineText: (sectionId, lineInSection) => sectionLines(sectionId)[lineInSection] ?? null,
  };
}

/** Is this a valid rhyme group (A–F / X)? */
export function isRhymeGroup(value: string): value is RhymeGroup {
  return (RHYME_GROUPS as readonly string[]).includes(value);
}

/**
 * Plan a `setLineGroups` batch: REPLACE each targeted line with its new group.
 *
 * Each item's section id is first redirected to its canonical (§5.3) so a write on
 * a linked duplicate lands on the shared rows. Per item (line `L`, group `V`) the
 * rows removed from `L` are:
 * - REPLACE-at-line (D-4): every whole-line row at `L`.
 * - X-exclusivity (D-5): if `V` is `X`, ALSO every sub-line row at `L` — an X clears
 *   the whole line; if `V` is a letter, ALSO an `X` row at `L`.
 * Then one whole-line `(L, V)` row is inserted. Idempotent (D-6): a line already
 * holding exactly that single `(L, V)` row is a no-op.
 *
 * Items apply in order against a shared working set (a batch that stamps the same
 * line twice → last wins). Throws {@link InvalidLineAddressError} if an address
 * isn't a real non-blank line.
 */
export function planSetLineGroups(
  ctx: WriteContext,
  existing: ExistingAnnotation[],
  items: LineGroupItem[],
): AnnotationWritePlan {
  // Only live (attached) rows participate; detached rows are off the text.
  const working: WorkingRow[] = existing
    .filter((r) => !r.detached && r.sectionId !== null && r.lineInSection !== null)
    .map((r) => ({
      id: r.id,
      sectionId: r.sectionId as number,
      lineInSection: r.lineInSection as number,
      startChar: r.startChar,
      value: r.value,
    }));

  const deleteIds = new Set<number>();

  for (const item of items) {
    const sectionId = ctx.redirect(item.sectionId);
    const line: LineAddress = { sectionId, lineInSection: item.lineInSection };
    const text = ctx.lineText(sectionId, item.lineInSection);
    if (text === null) throw new InvalidLineAddressError(line);
    const value = item.value;

    // Rows this write clears off the line.
    const toRemove = working.filter((r) => {
      if (!sameLine(r, line)) return false;
      if (r.startChar === null) return true; // whole-line row → replace-at-line
      if (value === "X") return true; // X clears the whole line (incl. sub-line rows)
      return r.value === "X"; // a letter clears the line's X (incl. a sub-line X)
    });

    // Idempotent: the line already holds exactly the whole-line row we'd write.
    if (toRemove.length === 1 && toRemove[0]!.startChar === null && toRemove[0]!.value === value) {
      continue;
    }

    for (const r of toRemove) if (r.id !== null) deleteIds.add(r.id);
    const removed = new Set(toRemove);
    for (let i = working.length - 1; i >= 0; i--) {
      if (removed.has(working[i]!)) working.splice(i, 1);
    }
    working.push({
      id: null,
      sectionId,
      lineInSection: item.lineInSection,
      startChar: null,
      value,
    });
  }

  // Inserts are exactly the whole-line rows this batch added that still survive.
  const inserts: AnnotationInsert[] = working
    .filter((r) => r.id === null)
    .map((r) => ({
      sectionId: r.sectionId,
      lineInSection: r.lineInSection,
      startChar: null,
      endChar: null,
      value: r.value as RhymeGroup,
      quote: ctx.lineText(r.sectionId, r.lineInSection) ?? "",
    }));

  return { deleteIds: [...deleteIds], inserts };
}

/**
 * Plan a `clearLines` batch: hard-delete the whole-line rows at each given line
 * address (user-explicit clear, D-3), after redirecting to the canonical. Sub-line
 * rows are left alone. Throws {@link InvalidLineAddressError} if an address isn't a
 * real non-blank line.
 */
export function planClearLines(
  ctx: WriteContext,
  existing: ExistingAnnotation[],
  items: LineAddress[],
): { deleteIds: number[] } {
  const deleteIds = new Set<number>();
  for (const item of items) {
    const sectionId = ctx.redirect(item.sectionId);
    const line: LineAddress = { sectionId, lineInSection: item.lineInSection };
    if (ctx.lineText(sectionId, item.lineInSection) === null) {
      throw new InvalidLineAddressError(line);
    }
    for (const r of existing) {
      if (!r.detached && r.startChar === null && sameLine(r, line)) deleteIds.add(r.id);
    }
  }
  return { deleteIds: [...deleteIds] };
}

/** Same whole-line address (both whole-line, same section + line). */
function sameLine(r: { sectionId: number | null; lineInSection: number | null }, a: LineAddress) {
  return r.sectionId === a.sectionId && r.lineInSection === a.lineInSection;
}

/**
 * Thrown when a write targets an address that isn't a real non-blank line of the
 * current lyrics (bad section id, or a line index past the section). The caller
 * maps it to a 400 — the client should only ever send valid line addresses.
 */
export class InvalidLineAddressError extends Error {
  constructor(public readonly address: LineAddress) {
    super(`(${address.sectionId}, ${address.lineInSection}) is not a non-blank line`);
    this.name = "InvalidLineAddressError";
  }
}

/** A whole-line address: the section and the 0-based line within it. */
export interface LineAddress {
  sectionId: number;
  lineInSection: number;
}

/** A stored annotation row, reduced to what the write planner needs. */
export interface ExistingAnnotation {
  id: number;
  sectionId: number | null;
  lineInSection: number | null;
  /** null = whole line; otherwise a sub-line char range within the line. */
  startChar: number | null;
  endChar: number | null;
  value: string;
  /** Detached rows are off the text — never matched or deleted by a write. */
  detached: boolean;
}

/** One line-group write: assign `value` to the whole line at this address. */
export interface LineGroupItem extends LineAddress {
  value: RhymeGroup;
}

/** A row the plan wants created. `quote` is the whole-line text from the lyrics. */
export interface AnnotationInsert extends LineAddress {
  startChar: number | null;
  endChar: number | null;
  value: RhymeGroup;
  quote: string;
}

/** The effect of a write batch: rows to hard-delete (by id) and rows to insert. */
export interface AnnotationWritePlan {
  deleteIds: number[];
  inserts: AnnotationInsert[];
}

/** A section as the write planner sees it — offsets + its duplicate link. */
export interface WriteSection {
  id: number;
  startOffset: number;
  endOffset: number;
  canonicalSectionId: number | null;
}

/** Resolves addresses against the stored lyrics/sections (built once per write). */
export interface WriteContext {
  /** Redirect a write on a linked section to its canonical (one hop — I2). */
  redirect(sectionId: number): number;
  /** The whole-line text at `(sectionId, lineInSection)`, or null if invalid. */
  lineText(sectionId: number, lineInSection: number): string | null;
}

/**
 * A working row while planning: an existing row (has `id`) or one this batch just
 * inserted (no `id`, so removing it costs no delete).
 */
interface WorkingRow {
  id: number | null;
  sectionId: number;
  lineInSection: number;
  startChar: number | null;
  value: string;
}
