/**
 * Pure derivations for the workbench: turning an entry's annotations into the
 * per-line highlight lookup, per-section rhyme-group counts, and the colour a
 * given annotation paints with. Kept out of the components so the rendering
 * stays a thin projection of these.
 */
import {
  RHYME_GROUP_COLORS,
  linesInRange,
  parseLines,
  type LineToken,
  type RhymeGroup,
} from "@rhymelab/core";
import type { AnnotationDTO, EntryDetail, SectionDTO } from "@rhymelab/api-contract";

/** One line as a selectable, annotatable span (rhyme scheme works line-by-line). */
export interface LineSpan {
  /** 0-based line index across the whole text (stable id within a selection). */
  index: number;
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
 * Split an entry into its sections, each carrying the lines it spans. When the
 * backend hasn't split the lyrics (no `sections`) but there is text, synthesise a
 * single "Lyrics" section covering all of it so there's always something to
 * annotate; empty lyrics yield no sections at all.
 */
export function deriveSections(entry: EntryDetail): SectionWithLines[] {
  const parsed = parseLines(entry.lyrics);
  const sections: SectionDTO[] =
    entry.sections.length > 0
      ? entry.sections
      : entry.lyrics.trim().length > 0
        ? [
            {
              id: -1,
              orderIndex: 0,
              label: "Lyrics",
              startOffset: 0,
              endOffset: entry.lyrics.length,
            },
          ]
        : [];
  return sections.map((section) => ({
    section,
    lines: linesInRange(parsed, section.startOffset, section.endOffset),
  }));
}

/** A finder over a line span (see `makeLineFinder`). */
type LineFinder = (start: number, end: number) => AnnotationDTO | null;

/**
 * The field shared by *every* line in a selection for one mode's finder, or
 * `undefined` when they differ (or any line is unassigned) — drives whether an
 * option/group reads as active for a multi-line selection. `pick` reads the
 * relevant field off the covering annotation (`value` for the group/option
 * modes, `body` for notes).
 */
function commonField(
  finder: LineFinder,
  lines: LineSpan[],
  pick: (ann: AnnotationDTO) => string | null,
): string | undefined {
  if (lines.length === 0) return undefined;
  const fieldOf = (l: LineSpan): string | null => {
    const ann = finder(l.start, l.end);
    return ann ? pick(ann) : null;
  };
  const first = fieldOf(lines[0]!);
  if (first == null) return undefined;
  return lines.every((l) => fieldOf(l) === first) ? first : undefined;
}

/** The `value` shared by every selected line for a mode, or `undefined`. */
export function commonValueForLines(finder: LineFinder, lines: LineSpan[]): string | undefined {
  return commonField(finder, lines, (a) => a.value);
}

/**
 * The rhyme group shared by every line in a selection — the rhyme-scheme
 * specialisation of `commonValueForLines`, narrowed back to `RhymeGroup`.
 */
export function commonRhymeGroup(finder: LineFinder, lines: LineSpan[]): RhymeGroup | undefined {
  return commonValueForLines(finder, lines) as RhymeGroup | undefined;
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

const covers = (a: AnnotationDTO, start: number, end: number) =>
  !a.detached && a.startOffset <= start && a.endOffset >= end;

/**
 * Map each covered character-range to its annotation, so a line can look up
 * whether it's highlighted. Returns a finder over line spans.
 */
export function makeLineFinder(annotations: AnnotationDTO[]) {
  // Priority is a total order (D-7): the *narrower* covering span wins so an
  // overlapping line + phrase paint the colour the panel reports as active; ties
  // break to the higher id (the more recent write), never to insertion order.
  return (start: number, end: number): AnnotationDTO | null => {
    let best: AnnotationDTO | null = null;
    for (const a of annotations) {
      if (!covers(a, start, end)) continue;
      if (best === null) {
        best = a;
        continue;
      }
      const aWidth = a.endOffset - a.startOffset;
      const bestWidth = best.endOffset - best.startOffset;
      if (aWidth < bestWidth || (aWidth === bestWidth && a.id > best.id)) best = a;
    }
    return best;
  };
}

/**
 * Rhyme-group counts within a section — WHOLE-LINE rows only (D-8 rollup): a
 * sub-line "emphasis" row refines a line's membership, it isn't a second member,
 * so it doesn't add to the count. `lines` are the section's parsed lines.
 */
export function groupCountsForSection(
  annotations: AnnotationDTO[],
  lines: LineToken[],
): Record<RhymeGroup, number> {
  const counts: Record<RhymeGroup, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0 };
  const lineSpans = new Set(lines.filter((l) => !l.blank).map((l) => `${l.start}:${l.end}`));
  for (const a of annotations) {
    if (a.detached) continue;
    if (!lineSpans.has(`${a.startOffset}:${a.endOffset}`)) continue; // whole-line rows only
    counts[a.value]++;
  }
  return counts;
}
