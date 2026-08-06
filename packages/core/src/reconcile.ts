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
 * (`matchSections` → `remapAnnotation`), and the DUPLICATE lifecycle
 * (`electDuplicates`: grouping/election/handoff/materialization + the I2/I3
 * self-heal), which decorates the plan's `canonicalRef`/`manualUnlink` and adds
 * the copy rows a divergence/handoff needs.
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
  /** Diagnostics from the I2/I3 self-heal (a section found both linked and
   *  row-owning). Empty in the healthy case; the caller may log them. */
  warnings: string[];
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
/* Duplicate lifecycle (§5.3 + §5.4 step 3)                            */
/* ------------------------------------------------------------------ */

/** A canonical's live row the reconciler must copy onto another section. */
interface PlacedCopy {
  targetRef: number;
  src: ReconcileAnnotation;
}

interface ElectionResult {
  /** Materialization / canonical-side-divergence copies to place (id: null). */
  copies: PlacedCopy[];
  /** Departed canonical old id → successor ref (its rows MOVE, not orphan — D-13). */
  moveSuccessor: Map<number, number>;
  warnings: string[];
}

/**
 * Decide the post-save duplicate links (§5.3): who is canonical, who links to it,
 * who becomes `manualUnlink` on divergence, and which rows must be copied (a
 * diverging duplicate keeps its own copy; a departing/diverging canonical hands
 * off to a successor). Mutates each `PlannedSection`'s `canonicalRef`/`manualUnlink`
 * and returns the copies + move successors for the annotation pass to apply.
 *
 * Grouping is byte-equal text over the planned post-save section set — survivors
 * *and* creations — minus `manualUnlink` islands (D-10); a paste-a-chorus creation
 * therefore links on the very save that adds it. Election is sticky (D-11): an
 * unchanged canonical stays; else a lone row-owner wins; several row-owners each
 * stay standalone with the row-less members linking to the earliest; else the
 * earliest orderIndex. "Owns rows" counts detached rows carrying the id.
 */
function electDuplicates(
  sections: PlannedSection[],
  planByRef: Map<number, PlannedSection>,
  oldById: Map<number, OldSecModel>,
  oldSections: ReconcileSection[],
  oldAnnotations: ReconcileAnnotation[],
  survivingOldIds: Set<number>,
  newText: string,
): ElectionResult {
  const copies: PlacedCopy[] = [];
  const moveSuccessor = new Map<number, number>();
  const warnings: string[] = [];

  const content = (s: PlannedSection): string => newText.slice(s.startOffset, s.endOffset);

  // Pre-remap live, addressable rows by owning section id — the copy sources.
  const liveRowsBySection = new Map<number, ReconcileAnnotation[]>();
  for (const a of oldAnnotations) {
    if (a.detached || a.sectionId === null || a.lineInSection === null) continue;
    const list = liveRowsBySection.get(a.sectionId) ?? [];
    list.push(a);
    liveRowsBySection.set(a.sectionId, list);
  }
  // Row ownership (pre-remap) counts DETACHED rows carrying a sectionId too (D-11).
  const ownerIds = new Set(
    oldAnnotations.filter((a) => a.sectionId !== null).map((a) => a.sectionId as number),
  );
  // Sections that acquire rows via a copy/move during this pass now own rows.
  const gotRows = new Set<number>();
  const ownsRowsNow = (ref: number): boolean => (ref > 0 && ownerIds.has(ref)) || gotRows.has(ref);

  // Old duplicate links (only genuine ones; a manual-unlink section has no pointer).
  const oldCanonTargets = new Set(
    oldSections.filter((s) => s.canonicalSectionId !== null).map((s) => s.canonicalSectionId!),
  );

  // ---- Pass A: resolve old links that broke (handoff / divergence, D-12/D-13) ----
  for (const canonId of oldCanonTargets) {
    const canonOld = oldById.get(canonId);
    if (!canonOld) continue;
    const groupOldText = canonOld.lines.join("\n");
    // Old members of this group: the canonical + everything that pointed at it.
    const memberIds = [
      canonId,
      ...oldSections.filter((s) => s.canonicalSectionId === canonId).map((s) => s.id),
    ];
    // Surviving members whose NEW text still equals the group text, earliest first.
    const equalSurvivors = memberIds
      .filter((m) => survivingOldIds.has(m) && content(planByRef.get(m)!) === groupOldText)
      .map((m) => planByRef.get(m)!)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const canonSurvived = survivingOldIds.has(canonId);
    const canonPlan = canonSurvived ? planByRef.get(canonId)! : null;
    const canonUnchanged = canonPlan !== null && content(canonPlan) === groupOldText;

    if (canonUnchanged) {
      // Sticky: canonical stays. Its still-equal duplicates relink in Pass B; a
      // duplicate that diverged materializes (copy the canonical's rows down).
      for (const m of memberIds) {
        if (m === canonId || !survivingOldIds.has(m)) continue;
        const mPlan = planByRef.get(m)!;
        if (content(mPlan) !== groupOldText) {
          for (const src of liveRowsBySection.get(canonId) ?? [])
            copies.push({ targetRef: m, src });
          gotRows.add(m);
          mPlan.manualUnlink = true;
        }
      }
    } else if (canonPlan !== null) {
      // Canonical survived but DIVERGED. Hand its rows to the earliest still-equal
      // successor (a copy — the ex-canonical keeps its own rows, remapped), mark
      // the ex-canonical manual-unlink so a later revert won't silently relink it.
      const successor = equalSurvivors[0];
      if (successor) {
        for (const src of liveRowsBySection.get(canonId) ?? [])
          copies.push({ targetRef: successor.ref, src });
        gotRows.add(successor.ref);
        canonPlan.manualUnlink = true;
      }
    } else {
      // Canonical DEPARTED. Its rows MOVE to the earliest still-equal successor
      // (byte-equal ⇒ same coordinates), else they orphan via the departure path.
      const successor = equalSurvivors[0];
      if (successor) {
        moveSuccessor.set(canonId, successor.ref);
        gotRows.add(successor.ref);
      }
    }
  }

  // ---- Pass B: regroup + elect over the non-manual-unlink planned sections ----
  const groups = new Map<string, PlannedSection[]>();
  for (const s of sections) {
    if (s.manualUnlink) continue;
    const key = content(s);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue; // a lone section is standalone (canonicalRef null)
    const byOrder = [...group].sort((a, b) => a.orderIndex - b.orderIndex);

    // Sticky: an existing surviving canonical (an old canonical target still here).
    const existingCanon = byOrder.find((s) => s.id !== null && oldCanonTargets.has(s.id));
    if (existingCanon) {
      link(group, existingCanon);
      continue;
    }

    const rowOwners = byOrder.filter((s) => ownsRowsNow(s.ref));
    if (rowOwners.length === 1) {
      link(group, rowOwners[0]!);
    } else if (rowOwners.length >= 2) {
      // Several annotated sections collided on identical text — keep each standalone
      // and point only the row-less members at the earliest owner (D-11).
      const target = rowOwners[0]!;
      for (const s of group) if (!ownsRowsNow(s.ref)) s.canonicalRef = target.ref;
    } else {
      link(group, byOrder[0]!);
    }
  }

  // ---- I2/I3 self-heal (ships in production): a section both linked and
  //      row-owning has its pointer cleared and manual-unlink set (P12). ----
  for (const s of sections) {
    if (s.canonicalRef !== null && ownsRowsNow(s.ref)) {
      warnings.push(`self-heal: section ref ${s.ref} was linked while owning rows`);
      s.canonicalRef = null;
      s.manualUnlink = true;
    }
  }

  // ---- Flatten pointers (I2): a link whose target is itself linked hops once. ----
  for (const s of sections) {
    if (s.canonicalRef === null) continue;
    const target = planByRef.get(s.canonicalRef);
    if (target && target.canonicalRef !== null) s.canonicalRef = target.canonicalRef;
  }

  return { copies, moveSuccessor, warnings };
}

/** Point every non-canonical member of a group at `canon`; canon stays standalone. */
function link(group: PlannedSection[], canon: PlannedSection): void {
  for (const s of group) s.canonicalRef = s === canon ? null : canon.ref;
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
        canonicalRef: null, // duplicate election runs below
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

  const planByRef = new Map(sections.map((s) => [s.ref, s]));
  const blockByRef = new Map<number, NewBlockModel>();
  for (let b = 0; b < blocks.length; b++) blockByRef.set(blockRef[b]!, blocks[b]!);
  // A ref → its section's new startOffset (for the re-attach oldStart hint).
  const refStartOffset = new Map<number, number>();
  for (let b = 0; b < blocks.length; b++) refStartOffset.set(blockRef[b]!, blocks[b]!.startOffset);

  // Duplicate election: sets canonicalRef/manualUnlink on `sections` and hands
  // back the copies + move successors the annotation pass applies.
  const { copies, moveSuccessor, warnings } = electDuplicates(
    sections,
    planByRef,
    oldById,
    oldSections,
    oldAnnotations,
    survivingOldIds,
    newText,
  );
  // Write-redirect (D-6/§5.4-4): a row placed on a linked section attaches one hop
  // up at the canonical (valid by byte-equality); I2 guarantees one hop suffices.
  const redirect = (ref: number): number => {
    const s = planByRef.get(ref);
    return s && s.canonicalRef !== null ? s.canonicalRef : ref;
  };

  // Remap every existing annotation via the line map (moving a departed canonical's
  // rows onto its successor), then add the reconciler's copies, deduped (D-6).
  const annotations: PlannedAnnotation[] = oldAnnotations.map((a) =>
    remapAnnotation(
      a,
      oldById,
      blocks,
      blockRef,
      blockByRef,
      lineDest,
      moveSuccessor,
      redirect,
      newText,
    ),
  );

  const seen = attachedKeySet(annotations);
  for (const c of copies) {
    const placed = placeRow(
      null,
      c.targetRef,
      c.src.lineInSection!,
      c.src.startChar,
      c.src.endChar,
      c.src.value,
      c.src.quote,
      blockByRef,
      redirect,
      newText,
    );
    if (placed.detached) {
      annotations.push(placed); // an out-of-bounds copy is kept detached, recoverable
      continue;
    }
    const key = attachedKey(placed);
    if (key !== null && seen.has(key)) continue; // identical row already exists — skip (D-6)
    if (key !== null) seen.add(key);
    annotations.push(placed);
  }

  // Re-attach pass: every detached/orphaned row tries to re-find its quote.
  for (const pa of annotations) {
    if (!pa.detached) continue;
    reattach(pa, newText, blocks, blockRef, blockByRef, refStartOffset, redirect, seen);
  }

  return { newLyrics: newText, sections, deleteSectionIds, annotations, warnings };
}

/* ------------------------------------------------------------------ */
/* Annotation placement / remap / re-attach                           */
/* ------------------------------------------------------------------ */

/** A stable key for an attached row's address + value (for D-6 dedupe). */
function attachedKey(pa: PlannedAnnotation): string | null {
  if (pa.detached || pa.sectionRef === null || pa.lineInSection === null) return null;
  return `${pa.sectionRef}:${pa.lineInSection}:${pa.startChar}:${pa.endChar}:${pa.value}`;
}

function attachedKeySet(annotations: PlannedAnnotation[]): Set<string> {
  const set = new Set<string>();
  for (const pa of annotations) {
    const key = attachedKey(pa);
    if (key !== null) set.add(key);
  }
  return set;
}

/**
 * Place a row on `ref`'s block at `(lineInSection, chars)`, following the
 * write-redirect to the canonical when `ref` is linked (valid by byte-equality).
 * Recomputes `quote` from the new text; a placement that would fall outside the
 * line (line gone, span past the line's end) detaches instead — never guess,
 * never widen (invariant 2). A whole-line placement is always in-bounds ⇒ valid.
 */
function placeRow(
  id: number | null,
  ref: number,
  lineInSection: number,
  startChar: number | null,
  endChar: number | null,
  value: string,
  fallbackQuote: string,
  blockByRef: Map<number, NewBlockModel>,
  redirect: (ref: number) => number,
  newText: string,
): PlannedAnnotation {
  const targetRef = redirect(ref);
  const detachedAt = (sectionRef: number | null): PlannedAnnotation => ({
    id,
    sectionRef,
    lineInSection: null,
    startChar: null,
    endChar: null,
    quote: fallbackQuote,
    value,
    detached: true,
  });

  const block = blockByRef.get(targetRef);
  if (!block) return detachedAt(null);
  const line = block.lines[lineInSection];
  if (!line) return detachedAt(targetRef);

  if (startChar === null) {
    return {
      id,
      sectionRef: targetRef,
      lineInSection,
      startChar: null,
      endChar: null,
      quote: line.text,
      value,
      detached: false,
    };
  }
  const ec = endChar ?? 0;
  if (startChar < 0 || ec > line.text.length || startChar >= ec) return detachedAt(targetRef);
  return {
    id,
    sectionRef: targetRef,
    lineInSection,
    startChar,
    endChar: ec,
    quote: newText.slice(line.start + startChar, line.start + ec),
    value,
    detached: false,
  };
}

/**
 * Place one existing annotation in the new world via the line map. A whole-line
 * row follows its line (carrying if exact, or if the edited line stayed ≥0.5
 * similar); a sub-line row carries only through an exact line match (never widen,
 * D-17 2d). A row whose line vanished with a departed *canonical* moves onto that
 * canonical's successor (D-13). Anything else detaches — keeping its section when
 * the section survived, orphaning (sectionRef null) when it departed.
 */
function remapAnnotation(
  a: ReconcileAnnotation,
  oldById: Map<number, OldSecModel>,
  blocks: NewBlockModel[],
  blockRef: number[],
  blockByRef: Map<number, NewBlockModel>,
  lineDest: Map<string, LineDestination>,
  moveSuccessor: Map<number, number>,
  redirect: (ref: number) => number,
  newText: string,
): PlannedAnnotation {
  const detachedAt = (sectionRef: number | null): PlannedAnnotation => ({
    id: a.id,
    sectionRef,
    lineInSection: null,
    startChar: null,
    endChar: null,
    quote: a.quote,
    value: a.value,
    detached: true,
  });

  const oldSec = a.sectionId !== null ? oldById.get(a.sectionId) : undefined;

  // Already detached, or unaddressed → leave detached for the re-attach pass. Keep
  // a (redirected) surviving section pointer where we still have one.
  if (a.detached || a.sectionId === null || a.lineInSection === null || !oldSec) {
    const ref = oldSec ? survivorRef(oldSec, blockRef) : null;
    return detachedAt(ref === null ? null : redirect(ref));
  }

  const dest = lineDest.get(lineKey(oldSec.index, a.lineInSection));
  if (!dest) {
    // The line is gone. If the whole section departed *and* it was a canonical with
    // a handoff successor, move the row onto the successor (byte-equal ⇒ valid).
    const survived = survivorRef(oldSec, blockRef);
    if (survived === null && moveSuccessor.has(a.sectionId)) {
      return placeRow(
        a.id,
        moveSuccessor.get(a.sectionId)!,
        a.lineInSection,
        a.startChar,
        a.endChar,
        a.value,
        a.quote,
        blockByRef,
        redirect,
        newText,
      );
    }
    return detachedAt(survived === null ? null : redirect(survived));
  }

  const ref = blockRef[dest.blockIndex]!;
  const newLine = blocks[dest.blockIndex]!.lines[dest.newLineIndex]!;

  if (a.startChar === null) {
    // Whole-line row: carries on an exact match, or an edited line still ≥0.5 similar.
    const carries =
      dest.exact ||
      similarity(oldSec.lines[a.lineInSection]!, newLine.text) >= LINE_CARRY_THRESHOLD;
    if (!carries) return detachedAt(redirect(ref));
    return placeRow(
      a.id,
      ref,
      dest.newLineIndex,
      null,
      null,
      a.value,
      a.quote,
      blockByRef,
      redirect,
      newText,
    );
  }

  // Sub-line row: carries only through an exact line match (conservative, D-17 2d).
  if (!dest.exact) return detachedAt(redirect(ref));
  return placeRow(
    a.id,
    ref,
    dest.newLineIndex,
    a.startChar,
    a.endChar,
    a.value,
    a.quote,
    blockByRef,
    redirect,
    newText,
  );
}

/** The planned ref of the block that inherited `oldSec`'s id, or null (departed). */
function survivorRef(oldSec: OldSecModel, blockRef: number[]): number | null {
  const id = oldSec.section.id;
  return blockRef.includes(id) ? id : null;
}

/**
 * Re-attach one detached/orphaned row: re-find its `quote` in the new text near
 * its section (or anywhere, for orphans), and re-address it iff the hit is exactly
 * one line, or falls within a single line (never spanning lines — invariant 2). A
 * hit inside a linked section redirects one hop to its canonical (I3/I6); a hit
 * that would duplicate an existing row is skipped (D-6).
 */
function reattach(
  pa: PlannedAnnotation,
  newText: string,
  blocks: NewBlockModel[],
  blockRef: number[],
  blockByRef: Map<number, NewBlockModel>,
  refStartOffset: Map<number, number>,
  redirect: (ref: number) => number,
  seen: Set<string>,
): void {
  if (!pa.quote) return;
  const oldStart = pa.sectionRef !== null ? (refStartOffset.get(pa.sectionRef) ?? 0) : 0;
  const res = reanchor(pa.quote, oldStart, newText);
  if (res.detached) return;

  const located = locateSpan(blocks, blockRef, res.startOffset, res.endOffset);
  if (!located) return;

  const placed = placeRow(
    pa.id,
    located.sectionRef,
    located.lineInSection,
    located.startChar,
    located.endChar,
    pa.value,
    pa.quote,
    blockByRef,
    redirect,
    newText,
  );
  if (placed.detached) return; // couldn't confidently place — stay detached

  const key = attachedKey(placed);
  if (key !== null && seen.has(key)) return; // identical row already present — skip
  if (key !== null) seen.add(key);

  pa.sectionRef = placed.sectionRef;
  pa.lineInSection = placed.lineInSection;
  pa.startChar = placed.startChar;
  pa.endChar = placed.endChar;
  pa.quote = placed.quote;
  pa.detached = false;
}

/* ------------------------------------------------------------------ */
/* Plan resolution (refs → ids)                                        */
/* ------------------------------------------------------------------ */

/** A section row after the plan's refs are resolved to real ids. */
export interface ResolvedSection {
  id: number;
  orderIndex: number;
  startOffset: number;
  endOffset: number;
  canonicalSectionId: number | null;
  manualUnlink: boolean;
}

/** An annotation row after the plan's refs are resolved to real ids. */
export interface ResolvedAnnotation {
  id: number;
  sectionId: number | null;
  lineInSection: number | null;
  startChar: number | null;
  endChar: number | null;
  quote: string;
  value: string;
  detached: boolean;
}

/**
 * Turn a plan's `ref`/`canonicalRef`/`sectionRef` into real ids: survivors keep
 * their id, creations and copies draw fresh ids from the allocators. This is the
 * in-memory apply the MSW mock uses (D-22) and what the tests feed the integrity
 * checker; the backend applies the same mapping against DB inserts. Pure.
 */
export function resolvePlan(
  plan: ReconcilePlan,
  allocSectionId: () => number,
  allocAnnotationId: () => number,
): { sections: ResolvedSection[]; annotations: ResolvedAnnotation[] } {
  const refToId = new Map<number, number>();
  for (const s of plan.sections) refToId.set(s.ref, s.id ?? allocSectionId());

  const sections = plan.sections.map((s) => ({
    id: refToId.get(s.ref)!,
    orderIndex: s.orderIndex,
    startOffset: s.startOffset,
    endOffset: s.endOffset,
    canonicalSectionId: s.canonicalRef === null ? null : (refToId.get(s.canonicalRef) ?? null),
    manualUnlink: s.manualUnlink,
  }));

  const annotations = plan.annotations.map((a) => ({
    id: a.id ?? allocAnnotationId(),
    sectionId: a.sectionRef === null ? null : (refToId.get(a.sectionRef) ?? null),
    lineInSection: a.lineInSection,
    startChar: a.startChar,
    endChar: a.endChar,
    quote: a.quote,
    value: a.value,
    detached: a.detached,
  }));

  return { sections, annotations };
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
