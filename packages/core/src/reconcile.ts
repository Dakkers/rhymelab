/**
 * The reconciler — the pure heart of Phase 2. Given an entry's stored lyrics,
 * sections and annotations plus the newly-saved lyrics, it produces a **plan**
 * (pure data) describing how sections and annotations must change so that:
 *
 *  - sections mirror `detectSections(newLyrics)` (durable ids preserved across
 *    edits/moves/splits/merges where possible),
 *  - every annotation follows its line where the text still has it, detaches when
 *    its line was rewritten past recognition, and orphans when its line is gone —
 *    never guessing, never silently widening (invariant 2),
 *  - duplicate sections share one canonical's annotations (Phase 2.5 — layered on
 *    top of the structural matching here).
 *
 * The handler applies the plan in one transaction; the MSW mock applies the same
 * plan to its store (D-22). Nothing here touches a DB or a clock.
 *
 * This module is built in two layers: the STRUCTURAL matching + annotation remap
 * (this file), and the DUPLICATE lifecycle (election/handoff/materialization),
 * which decorates the plan's `canonicalRef`/`manualUnlink` and copy rows.
 */
import { alignLines, lcsPairs, similarity } from "./diff";
import { detectSections, normalizeText, parseLines, type LineToken } from "./lyrics";
import { reanchor } from "./anchor";

/* ------------------------------------------------------------------ */
/* Inputs (pure projections of the DB rows)                            */
/* ------------------------------------------------------------------ */

export interface ReconcileSection {
  id: number;
  orderIndex: number;
  startOffset: number;
  endOffset: number;
  canonicalSectionId: number | null;
  manualUnlink: boolean;
}

export interface ReconcileAnnotation {
  id: number;
  sectionId: number | null;
  lineInSection: number | null;
  /** null = whole line; otherwise a sub-line char range within the line. */
  startChar: number | null;
  endChar: number | null;
  quote: string;
  value: string;
  detached: boolean;
}

/* ------------------------------------------------------------------ */
/* Plan (pure output)                                                  */
/* ------------------------------------------------------------------ */

/**
 * A section in the post-save world. Survivors carry their real `id` and a `ref`
 * equal to that id; creations have `id: null` and a negative `ref`. `canonicalRef`
 * points at another planned section's `ref` (or null). The apply step maps refs
 * to real ids (creations get fresh ids) and resolves the pointers.
 */
export interface PlannedSection {
  ref: number;
  id: number | null;
  orderIndex: number;
  startOffset: number;
  endOffset: number;
  canonicalRef: number | null;
  manualUnlink: boolean;
}

/**
 * An annotation in the post-save world. Existing rows carry their `id`; rows the
 * reconciler creates (duplicate materialization/handoff copies) have `id: null`.
 * `sectionRef` is the planned section it lands on (null ⟺ orphaned).
 */
export interface PlannedAnnotation {
  id: number | null;
  sectionRef: number | null;
  lineInSection: number | null;
  startChar: number | null;
  endChar: number | null;
  quote: string;
  value: string;
  detached: boolean;
}

export interface ReconcilePlan {
  newLyrics: string;
  sections: PlannedSection[];
  /** Old section ids to delete (their rows have been moved/orphaned first). */
  deleteSectionIds: number[];
  /** The complete post-save annotation set (existing rows repositioned + copies). */
  annotations: PlannedAnnotation[];
}

/** How similar a rewritten line must stay to keep its annotations (D-17). */
const LINE_CARRY_THRESHOLD = 0.5;
/** Fraction of a section's (smaller-side) lines that must exact-match to survive. */
const SECTION_SURVIVE_THRESHOLD = 0.5;

/* ------------------------------------------------------------------ */
/* Internal models                                                     */
/* ------------------------------------------------------------------ */

interface OldSecModel {
  section: ReconcileSection;
  index: number;
  /** The section's non-blank line texts (lineInSection ⇒ index here). */
  lines: string[];
}

interface NewBlockModel {
  index: number;
  orderIndex: number;
  startOffset: number;
  endOffset: number;
  /** The block's non-blank line tokens (lineInSection ⇒ index here). */
  lines: LineToken[];
}

/** Where one old line landed in the new text. */
interface LineDestination {
  blockIndex: number;
  newLineIndex: number;
  /** True when the new line is byte-identical (else it's an edited/replace pair). */
  exact: boolean;
}

/* ------------------------------------------------------------------ */
/* Section + line matching (§5.4 step 2 — two-level LCS)               */
/* ------------------------------------------------------------------ */

/** Split a section's stored slice into its non-blank line texts. */
function sliceLines(lyrics: string, s: ReconcileSection): string[] {
  return lyrics.slice(s.startOffset, s.endOffset).split("\n");
}

/** The non-blank line tokens that fall inside a block's span. */
function blockLineTokens(all: LineToken[], startOffset: number, endOffset: number): LineToken[] {
  return all.filter((l) => !l.blank && l.start >= startOffset && l.end <= endOffset);
}

/**
 * Result of matching old sections to new blocks: which old id each new block
 * inherits (null ⇒ creation), and where each old line landed (null ⇒ gone).
 */
interface MatchResult {
  /** blockOwnerOldId[blockIndex] = the old section id this block keeps, or null. */
  blockOwnerOldId: (number | null)[];
  /** lineDest["oldSecIdx:lineIdx"] = destination, or absent if the line is gone. */
  lineDest: Map<string, LineDestination>;
}

const lineKey = (secIdx: number, lineIdx: number) => `${secIdx}:${lineIdx}`;
const range = (a: number, b: number): number[] =>
  Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

/**
 * Two-level LCS (D-17). First match whole sections by byte-equal content (so an
 * unchanged section that only moved keeps its id and an identity line map); then,
 * within each contiguous gap of unmatched old sections × new blocks, line-align to
 * attribute edited/split/merged lines and decide each gap block's owner. A pure
 * swap can still cost the moved section its id — the re-attach pass recovers its
 * annotations by text.
 */
function matchSections(
  olds: OldSecModel[],
  blocks: NewBlockModel[],
  rowOwnerIds: Set<number>,
): MatchResult {
  const oldContents = olds.map((o) => o.lines.join("\n"));
  const newContents = blocks.map((b) => b.lines.map((l) => l.text).join("\n"));
  const anchors = lcsPairs(oldContents, newContents, (a, b) => a === b);

  const lineDest = new Map<string, LineDestination>();
  const blockOwnerOldId: (number | null)[] = Array.from({ length: blocks.length }, () => null);
  // contrib[oldIdx][blockIdx] = attributed lines (from gaps); exact = of those, byte-equal.
  const contrib: number[][] = olds.map(() => Array.from({ length: blocks.length }, () => 0));
  const exact: number[][] = olds.map(() => Array.from({ length: blocks.length }, () => 0));

  // 2a — exact whole-section survivors: keep the id, identity line map.
  for (const [oi, nj] of anchors) {
    blockOwnerOldId[nj] = olds[oi]!.section.id;
    olds[oi]!.lines.forEach((_, k) =>
      lineDest.set(lineKey(oi, k), { blockIndex: nj, newLineIndex: k, exact: true }),
    );
  }

  // 2b — line-align each contiguous gap between content anchors (sentinels bound the ends).
  const bounds: Array<[number, number]> = [[-1, -1], ...anchors, [olds.length, blocks.length]];
  for (let g = 0; g < bounds.length - 1; g++) {
    const gapOld = range(bounds[g]![0] + 1, bounds[g + 1]![0]);
    const gapNew = range(bounds[g]![1] + 1, bounds[g + 1]![1]);
    if (gapOld.length === 0 && gapNew.length === 0) continue;

    const oldFlat: Array<{ secIdx: number; lineIdx: number; text: string }> = [];
    for (const oi of gapOld)
      olds[oi]!.lines.forEach((text, lineIdx) => oldFlat.push({ secIdx: oi, lineIdx, text }));
    const newFlat: Array<{ blockIdx: number; lineIdx: number; text: string }> = [];
    for (const bj of gapNew)
      blocks[bj]!.lines.forEach((tok, lineIdx) =>
        newFlat.push({ blockIdx: bj, lineIdx, text: tok.text }),
      );

    for (const op of alignLines(
      oldFlat.map((l) => l.text),
      newFlat.map((l) => l.text),
    )) {
      if (op.type !== "equal" && op.type !== "replace") continue;
      const o = oldFlat[op.oldIndex]!;
      const n = newFlat[op.newIndex]!;
      contrib[o.secIdx]![n.blockIdx]! += 1;
      if (op.type === "equal") exact[o.secIdx]![n.blockIdx]! += 1;
      lineDest.set(lineKey(o.secIdx, o.lineIdx), {
        blockIndex: n.blockIdx,
        newLineIndex: n.lineIdx,
        exact: op.type === "equal",
      });
    }
  }

  assignBlockOwners(olds, blocks, contrib, exact, rowOwnerIds, blockOwnerOldId);
  return { blockOwnerOldId, lineDest };
}

/**
 * Fill each still-unowned block's `blockOwnerOldId`. An old id lands on the single
 * block holding the majority of that section's attributed lines (split → majority
 * block, ties → earlier block); a block with several such contributors is owned by
 * the majority contributor (merge → D-17 tiebreak); a winner below the survival
 * threshold, or a block with no contributor, is a creation (owner stays null).
 */
function assignBlockOwners(
  olds: OldSecModel[],
  blocks: NewBlockModel[],
  contrib: number[][],
  exact: number[][],
  rowOwnerIds: Set<number>,
  blockOwnerOldId: (number | null)[],
): void {
  const primaryBlock = (oldIdx: number): number | null => {
    let best = -1;
    let bestCount = 0;
    for (let b = 0; b < blocks.length; b++) {
      if (contrib[oldIdx]![b]! > bestCount) {
        bestCount = contrib[oldIdx]![b]!;
        best = b;
      }
    }
    return bestCount > 0 ? best : null;
  };

  for (let b = 0; b < blocks.length; b++) {
    if (blockOwnerOldId[b] !== null) continue; // already an exact-content survivor
    const candidates = olds
      .map((o) => o.index)
      .filter((oi) => contrib[oi]![b]! > 0 && primaryBlock(oi) === b);
    if (candidates.length === 0) continue;
    const winner = pickMergeWinner(candidates, b, contrib, olds, rowOwnerIds);
    const smaller = Math.min(olds[winner]!.lines.length, blocks[b]!.lines.length);
    const ratio = smaller === 0 ? 0 : exact[winner]![b]! / smaller;
    blockOwnerOldId[b] = ratio >= SECTION_SURVIVE_THRESHOLD ? olds[winner]!.section.id : null;
  }
}

/**
 * Among old sections contributing to one block, the (old-index of the) one whose
 * id it keeps: most attributed lines wins; on an exact tie, the canonical
 * contributor, then a row-owning contributor, then the earliest orderIndex (D-17).
 */
function pickMergeWinner(
  candidates: number[],
  blockIdx: number,
  contrib: number[][],
  olds: OldSecModel[],
  rowOwnerIds: Set<number>,
): number {
  const isCanonical = (oi: number) =>
    olds.some((o) => o.section.canonicalSectionId === olds[oi]!.section.id);
  const ownsRows = (oi: number) => rowOwnerIds.has(olds[oi]!.section.id);
  const rank = (oi: number) => (isCanonical(oi) ? 2 : ownsRows(oi) ? 1 : 0);
  return candidates.reduce((best, oi) => {
    const cb = contrib[best]![blockIdx]!;
    const co = contrib[oi]![blockIdx]!;
    if (co !== cb) return co > cb ? oi : best;
    if (rank(oi) !== rank(best)) return rank(oi) > rank(best) ? oi : best;
    return olds[oi]!.section.orderIndex < olds[best]!.section.orderIndex ? oi : best;
  });
}

/* ------------------------------------------------------------------ */
/* Main reconcile                                                      */
/* ------------------------------------------------------------------ */

export function reconcile(
  oldLyrics: string,
  oldSections: ReconcileSection[],
  oldAnnotations: ReconcileAnnotation[],
  input: string,
): ReconcilePlan {
  const newText = normalizeText(input);

  const olds: OldSecModel[] = [...oldSections]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((section, index) => ({ section, index, lines: sliceLines(oldLyrics, section) }));
  const oldById = new Map(olds.map((o) => [o.section.id, o]));

  const parsedNew = parseLines(newText);
  const blocks: NewBlockModel[] = detectSections(newText).map((d) => ({
    index: d.orderIndex,
    orderIndex: d.orderIndex,
    startOffset: d.startOffset,
    endOffset: d.endOffset,
    lines: blockLineTokens(parsedNew, d.startOffset, d.endOffset),
  }));

  // Which old sections own at least one annotation row (detached rows count — D-11).
  const rowOwnerIds = new Set(
    oldAnnotations.filter((a) => a.sectionId !== null).map((a) => a.sectionId as number),
  );

  const { blockOwnerOldId, lineDest } = matchSections(olds, blocks, rowOwnerIds);

  // Build the post-save section set: each block becomes a PlannedSection, keeping
  // an old id (survivor) or getting a negative creation ref.
  let creationCounter = 0;
  const blockRef: number[] = Array.from({ length: blocks.length }, () => 0);
  const sections: PlannedSection[] = blocks.map((b) => {
    const ownerOldId = blockOwnerOldId[b.index];
    if (ownerOldId !== null) {
      blockRef[b.index] = ownerOldId;
      const old = oldById.get(ownerOldId)!;
      return {
        ref: ownerOldId,
        id: ownerOldId,
        orderIndex: b.orderIndex,
        startOffset: b.startOffset,
        endOffset: b.endOffset,
        canonicalRef: null, // duplicate election runs in Phase 2.5
        manualUnlink: old.section.manualUnlink,
      };
    }
    const ref = -++creationCounter;
    blockRef[b.index] = ref;
    return {
      ref,
      id: null,
      orderIndex: b.orderIndex,
      startOffset: b.startOffset,
      endOffset: b.endOffset,
      canonicalRef: null,
      manualUnlink: false,
    };
  });

  const survivingOldIds = new Set(sections.filter((s) => s.id !== null).map((s) => s.id!));
  const deleteSectionIds = olds
    .filter((o) => !survivingOldIds.has(o.section.id))
    .map((o) => o.section.id);

  // A ref → its section's new startOffset (for the re-attach oldStart hint).
  const refStartOffset = new Map<number, number>();
  for (let b = 0; b < blocks.length; b++) refStartOffset.set(blockRef[b]!, blocks[b]!.startOffset);

  // Remap every existing annotation via the line map.
  const annotations: PlannedAnnotation[] = oldAnnotations.map((a) =>
    remapAnnotation(a, oldById, blocks, blockRef, lineDest, newText),
  );

  // Re-attach pass: every detached/orphaned row tries to re-find its quote.
  for (const pa of annotations) {
    if (!pa.detached) continue;
    reattach(pa, newText, blocks, blockRef, refStartOffset);
  }

  return { newLyrics: newText, sections, deleteSectionIds, annotations };
}

/**
 * Place one existing annotation in the new world via the line map. A whole-line
 * row follows its line (carrying if exact, or if the edited line stayed ≥0.5
 * similar); a sub-line row carries only through an exact line match (never widen,
 * D-17 2d). Anything else detaches — keeping its section when the section
 * survived, orphaning (sectionId null) when it departed. `quote` is recomputed
 * from the new text.
 */
function remapAnnotation(
  a: ReconcileAnnotation,
  oldById: Map<number, OldSecModel>,
  blocks: NewBlockModel[],
  blockRef: number[],
  lineDest: Map<string, LineDestination>,
  newText: string,
): PlannedAnnotation {
  const base: PlannedAnnotation = {
    id: a.id,
    sectionRef: null,
    lineInSection: null,
    startChar: null,
    endChar: null,
    quote: a.quote,
    value: a.value,
    detached: true,
  };

  // Already detached, or unaddressed → leave detached for the re-attach pass. Keep
  // a surviving section pointer where we still have one.
  const oldSec = a.sectionId !== null ? oldById.get(a.sectionId) : undefined;
  if (a.detached || a.sectionId === null || a.lineInSection === null || !oldSec) {
    base.sectionRef = oldSec ? survivorRef(oldSec, blockRef) : null;
    return base;
  }

  const dest = lineDest.get(lineKey(oldSec.index, a.lineInSection));
  if (!dest) {
    // The line is gone. Detach; keep the section pointer if it survived, else orphan.
    base.sectionRef = survivorRef(oldSec, blockRef);
    return base;
  }

  const block = blocks[dest.blockIndex]!;
  const newLine = block.lines[dest.newLineIndex]!;
  const ref = blockRef[dest.blockIndex]!;

  if (a.startChar === null) {
    // Whole-line row: carries on an exact match, or an edited line still ≥0.5 similar.
    const oldLine = oldSec.lines[a.lineInSection]!;
    const carries = dest.exact || similarity(oldLine, newLine.text) >= LINE_CARRY_THRESHOLD;
    if (!carries) {
      base.sectionRef = ref;
      return base;
    }
    return {
      id: a.id,
      sectionRef: ref,
      lineInSection: dest.newLineIndex,
      startChar: null,
      endChar: null,
      quote: newLine.text,
      value: a.value,
      detached: false,
    };
  }

  // Sub-line row: carries only through an exact line match (conservative, D-17 2d).
  if (!dest.exact) {
    base.sectionRef = ref;
    return base;
  }
  return {
    id: a.id,
    sectionRef: ref,
    lineInSection: dest.newLineIndex,
    startChar: a.startChar,
    endChar: a.endChar,
    quote: newText.slice(newLine.start + a.startChar, newLine.start + (a.endChar ?? 0)),
    value: a.value,
    detached: false,
  };
}

/** The planned ref of the block that inherited `oldSec`'s id, or null (departed). */
function survivorRef(oldSec: OldSecModel, blockRef: number[]): number | null {
  const id = oldSec.section.id;
  return blockRef.includes(id) ? id : null;
}

/**
 * Re-attach one detached/orphaned row: re-find its `quote` in the new text near
 * its section (or anywhere, for orphans), and re-address it iff the hit is exactly
 * one line, or falls within a single line (never spanning lines — invariant 2).
 */
function reattach(
  pa: PlannedAnnotation,
  newText: string,
  blocks: NewBlockModel[],
  blockRef: number[],
  refStartOffset: Map<number, number>,
): void {
  if (!pa.quote) return;
  const oldStart = pa.sectionRef !== null ? (refStartOffset.get(pa.sectionRef) ?? 0) : 0;
  const res = reanchor(pa.quote, oldStart, newText);
  if (res.detached) return;

  const located = locateSpan(blocks, blockRef, res.startOffset, res.endOffset);
  if (!located) return;

  pa.sectionRef = located.sectionRef;
  pa.lineInSection = located.lineInSection;
  pa.startChar = located.startChar;
  pa.endChar = located.endChar;
  pa.quote = newText.slice(res.startOffset, res.endOffset);
  pa.detached = false;
}

/** Map an absolute `[start,end)` to a (sectionRef, lineInSection, chars) address,
 *  or null if it isn't within a single non-blank line. */
function locateSpan(
  blocks: NewBlockModel[],
  blockRef: number[],
  start: number,
  end: number,
): {
  sectionRef: number;
  lineInSection: number;
  startChar: number | null;
  endChar: number | null;
} | null {
  for (const b of blocks) {
    for (let li = 0; li < b.lines.length; li++) {
      const line = b.lines[li]!;
      if (start >= line.start && end <= line.end) {
        const whole = start === line.start && end === line.end;
        return {
          sectionRef: blockRef[b.index]!,
          lineInSection: li,
          startChar: whole ? null : start - line.start,
          endChar: whole ? null : end - line.start,
        };
      }
    }
  }
  return null;
}
