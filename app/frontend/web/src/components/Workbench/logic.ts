/**
 * Pure derivations for the workbench: turning an entry's annotations into the
 * per-line rhyme lookup, per-section rhyme-group counts, and the colour a given
 * annotation paints with. Kept out of the components so the rendering stays a thin
 * projection of these.
 *
 * Phase 2: annotations are addressed by `(sectionId, lineInSection)`, and a linked
 * duplicate section renders its *canonical's* rows (D-18 projection is client-side).
 * Every lookup resolves the link one hop, so all copies of a chorus paint the same
 * groups from the one shared set of rows.
 */
import {
  RHYME_GROUP_COLORS,
  linesInRange,
  parseLines,
  type LineToken,
  type RhymeGroup,
} from "@rhymelab/core";
import type { AnnotationDTO, EntryDetail, SectionDTO } from "@rhymelab/api-contract";

/** One line as a selectable, annotatable unit (rhyme scheme works line-by-line). */
export interface LineSpan {
  /** 0-based line index across the whole text (stable id within a selection). */
  index: number;
  /** 0-based line within its section — the annotation address. */
  lineInSection: number;
  start: number;
  end: number;
  text: string;
}

/**
 * The rhyme-scheme selection: one or more lines, always within a single section
 * (multi-select never crosses a section boundary). `lines` is ordered by index
 * and non-empty.
 */
export interface LineSelection {
  sectionId: number;
  lines: LineSpan[];
}

/** A section paired with the parsed lines that fall inside it. */
export interface SectionWithLines {
  section: SectionDTO;
  lines: LineToken[];
}

/**
 * Split an entry into its sections, each carrying the lines it spans. The server
 * always materialises sections now (empty lyrics ⇒ no sections ⇒ nothing to
 * annotate), so there is no synthetic single-section fallback (P11).
 */
export function deriveSections(entry: EntryDetail): SectionWithLines[] {
  const parsed = parseLines(entry.lyrics);
  return entry.sections.map((section) => ({
    section,
    lines: linesInRange(parsed, section.startOffset, section.endOffset),
  }));
}

/** The non-blank lines of a section, paired with their `lineInSection` address. */
export function annotatableLines(
  lines: LineToken[],
): Array<{ line: LineToken; lineInSection: number }> {
  const out: Array<{ line: LineToken; lineInSection: number }> = [];
  let n = 0;
  for (const line of lines) {
    if (line.blank) continue;
    out.push({ line, lineInSection: n });
    n++;
  }
  return out;
}

/** Resolves a line address to its rhyme annotation, following duplicate links. */
export type RhymeFinder = (sectionId: number, lineInSection: number) => AnnotationDTO | null;

/**
 * Build the rhyme lookup for an entry. Whole-line rows are keyed by their
 * `(sectionId, lineInSection)`; a linked section resolves one hop to its canonical
 * so every copy reads the shared rows. On a line holding overlapping rows the
 * higher id wins (D-7). Sub-line "emphasis" rows never drive the line badge (D-8).
 */
export function makeRhymeFinder(entry: EntryDetail): RhymeFinder {
  const canonicalOf = new Map(entry.sections.map((s) => [s.id, s.canonicalSectionId]));
  const resolve = (sectionId: number): number => canonicalOf.get(sectionId) ?? sectionId;

  const byLine = new Map<string, AnnotationDTO>();
  for (const a of entry.annotations) {
    if (a.detached || a.sectionId === null || a.lineInSection === null || a.startChar !== null) {
      continue; // detached / orphaned / sub-line rows don't drive the line badge
    }
    const key = `${a.sectionId}:${a.lineInSection}`;
    const cur = byLine.get(key);
    if (!cur || a.id > cur.id) byLine.set(key, a);
  }

  return (sectionId, lineInSection) => byLine.get(`${resolve(sectionId)}:${lineInSection}`) ?? null;
}

/**
 * The `value` shared by every line in a selection (within one section), or
 * `undefined` when they differ or any line is unassigned — drives whether a group
 * reads as active for a multi-line selection.
 */
export function commonRhymeGroup(
  finder: RhymeFinder,
  sectionId: number,
  lines: LineSpan[],
): RhymeGroup | undefined {
  if (lines.length === 0) return undefined;
  const first = finder(sectionId, lines[0]!.lineInSection);
  if (!first) return undefined;
  return lines.every((l) => finder(sectionId, l.lineInSection)?.value === first.value)
    ? first.value
    : undefined;
}

export interface HighlightColor {
  solid: string;
  tint: string;
  ink: string;
}

/** The highlight a rhyme annotation paints with. `value` is always a group now. */
export function colorForAnnotation(ann: AnnotationDTO): HighlightColor {
  const c = RHYME_GROUP_COLORS[ann.value];
  return { solid: c.solid, tint: c.tint, ink: c.ink };
}

/**
 * Rhyme-group counts for a section — WHOLE-LINE rows only (D-8 rollup), read from
 * the section's canonical so a linked copy shows the shared counts. `lineCount` is
 * the section's non-blank line count.
 */
export function groupCountsForSection(
  finder: RhymeFinder,
  sectionId: number,
  lineCount: number,
): Record<RhymeGroup, number> {
  const counts: Record<RhymeGroup, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0 };
  for (let li = 0; li < lineCount; li++) {
    const ann = finder(sectionId, li);
    if (ann) counts[ann.value]++;
  }
  return counts;
}

/** How a section relates to its duplicate group — drives the link affordance (P13). */
export interface DuplicateInfo {
  /** This section renders a canonical's rows (edits apply to all copies). */
  linked: boolean;
  /** This section is a canonical others link to. */
  isCanonical: boolean;
  /** User-unlinked (exempt from auto-linking) and a shareable canonical peer exists. */
  unlinkedWithPeer: boolean;
  /** How many sections share this group's rows (self + linked copies). */
  copyCount: number;
}

/** Classify a section's place in its duplicate group (for the link affordance). */
export function duplicateInfo(entry: EntryDetail, section: SectionDTO): DuplicateInfo {
  const linkedToThis = entry.sections.filter((s) => s.canonicalSectionId === section.id);
  const sameText = (a: SectionDTO, b: SectionDTO) =>
    entry.lyrics.slice(a.startOffset, a.endOffset) ===
    entry.lyrics.slice(b.startOffset, b.endOffset);

  if (section.canonicalSectionId !== null) {
    const canon = entry.sections.find((s) => s.id === section.canonicalSectionId);
    const copyCount = canon
      ? 1 + entry.sections.filter((s) => s.canonicalSectionId === canon.id).length
      : 2;
    return { linked: true, isCanonical: false, unlinkedWithPeer: false, copyCount };
  }
  if (linkedToThis.length > 0) {
    return {
      linked: false,
      isCanonical: true,
      unlinkedWithPeer: false,
      copyCount: 1 + linkedToThis.length,
    };
  }
  if (section.manualUnlink) {
    const hasPeer = entry.sections.some(
      (s) =>
        s.id !== section.id &&
        s.canonicalSectionId === null &&
        !s.manualUnlink &&
        sameText(s, section),
    );
    return { linked: false, isCanonical: false, unlinkedWithPeer: hasPeer, copyCount: 1 };
  }
  return { linked: false, isCanonical: false, unlinkedWithPeer: false, copyCount: 1 };
}
