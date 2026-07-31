/**
 * Pure derivations for the workbench: turning an entry's annotations into the
 * per-word highlight map, per-section rhyme-group counts, and the colour a given
 * annotation paints with. Kept out of the components so the rendering stays a
 * thin projection of these.
 */
import {
  MODE_META,
  RHYME_GROUP_COLORS,
  linesInRange,
  parseLines,
  type AnnotationMode,
  type LineToken,
  type RhymeGroup,
  type ViewMode,
} from "@rhymelab/core";
import type { AnnotationDTO, EntryDetail, SectionDTO } from "@rhymelab/api-contract";

export interface Selection {
  start: number;
  end: number;
  text: string;
  /** Global word index when a single word is selected; null for a phrase. */
  wordIndex: number | null;
}

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
              type: "verse",
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

type RhymeFinder = (start: number, end: number) => AnnotationDTO | null;

/** The rhyme group assigned to a line, or null when it has none. */
export function lineRhymeGroup(findRhyme: RhymeFinder, line: LineSpan): RhymeGroup | null {
  const ann = findRhyme(line.start, line.end);
  return ann?.value ? (ann.value as RhymeGroup) : null;
}

/**
 * The rhyme group shared by *every* line in a selection, or `undefined` when
 * they differ (or any is unassigned) — drives whether a group button reads as
 * active for a multi-line selection.
 */
export function commonRhymeGroup(
  findRhyme: RhymeFinder,
  lines: LineSpan[],
): RhymeGroup | undefined {
  if (lines.length === 0) return undefined;
  const first = lineRhymeGroup(findRhyme, lines[0]!);
  if (first == null) return undefined;
  return lines.every((l) => lineRhymeGroup(findRhyme, l) === first) ? first : undefined;
}

export interface HighlightColor {
  solid: string;
  tint: string;
  ink: string;
}

/** `#rrggbb` → `rgba(r,g,b,alpha)`. */
export function tintOf(hex: string, alpha = 0.24): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The highlight an annotation paints with, or null if it carries no colour. */
export function colorForAnnotation(ann: AnnotationDTO): HighlightColor | null {
  if (ann.mode === "rhyme-scheme") {
    const c = RHYME_GROUP_COLORS[(ann.value ?? "X") as RhymeGroup];
    return c ? { solid: c.solid, tint: c.tint, ink: c.ink } : null;
  }
  if (ann.mode === "theme") {
    const base = ann.color ?? MODE_META.theme.color;
    return { solid: base, tint: tintOf(base), ink: base };
  }
  const base = MODE_META[ann.mode].color;
  return { solid: base, tint: tintOf(base), ink: base };
}

const covers = (a: AnnotationDTO, start: number, end: number) =>
  !a.detached && a.startOffset <= start && a.endOffset >= end;

/**
 * For one mode, map each covered character-range to its annotation, so a word
 * token can look up whether it's highlighted. Returns a finder over word spans.
 */
export function makeWordFinder(annotations: AnnotationDTO[], mode: ViewMode) {
  if (mode === "read") return () => null;
  const inMode = annotations.filter((a) => a.mode === mode);
  // Prefer the *tightest* covering annotation, matching `annotationsCoveringSpan`
  // (the inspector) — so an overlapping word + phrase paint the colour the panel
  // reports as active, not whichever was created first.
  return (start: number, end: number): AnnotationDTO | null => {
    let best: AnnotationDTO | null = null;
    for (const a of inMode) {
      if (!covers(a, start, end)) continue;
      if (!best || a.endOffset - a.startOffset < best.endOffset - best.startOffset) best = a;
    }
    return best;
  };
}

/** Every mode's annotation that covers a span — for the inspector's summary. */
export function annotationsCoveringSpan(
  annotations: AnnotationDTO[],
  start: number,
  end: number,
): Partial<Record<AnnotationMode, AnnotationDTO>> {
  const out: Partial<Record<AnnotationMode, AnnotationDTO>> = {};
  for (const a of annotations) {
    if (covers(a, start, end)) {
      // Prefer the tightest covering annotation per mode.
      const prev = out[a.mode];
      if (!prev || a.endOffset - a.startOffset < prev.endOffset - prev.startOffset) {
        out[a.mode] = a;
      }
    }
  }
  return out;
}

/** Rhyme-group counts within a section (by annotation start offset). */
export function groupCountsForSection(
  annotations: AnnotationDTO[],
  section: SectionDTO,
): Record<RhymeGroup, number> {
  const counts: Record<RhymeGroup, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0 };
  for (const a of annotations) {
    if (
      a.mode === "rhyme-scheme" &&
      !a.detached &&
      a.value &&
      a.startOffset >= section.startOffset &&
      a.startOffset < section.endOffset
    ) {
      const g = a.value as RhymeGroup;
      if (g in counts) counts[g]++;
    }
  }
  return counts;
}

/** The distinct theme names used across an entry, for quick re-use in the panel. */
export function existingThemes(annotations: AnnotationDTO[]): string[] {
  const seen = new Set<string>();
  for (const a of annotations) {
    if (a.mode === "theme" && a.value && !a.detached) seen.add(a.value);
  }
  return [...seen].sort((x, y) => x.localeCompare(y));
}
