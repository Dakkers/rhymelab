/**
 * Pure derivations for the workbench: turning an entry's annotations into the
 * per-word highlight map, per-section rhyme-group counts, and the colour a given
 * annotation paints with. Kept out of the components so the rendering stays a
 * thin projection of these.
 */
import {
  MODE_META,
  RHYME_GROUP_COLORS,
  type AnnotationMode,
  type RhymeGroup,
  type ViewMode,
} from "#/lib/constants";
import type { AnnotationDTO, SectionDTO } from "#/server/entries";

export interface Selection {
  start: number;
  end: number;
  text: string;
  /** Global word index when a single word is selected; null for a phrase. */
  wordIndex: number | null;
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
  if (ann.mode === "rhyme-structure") {
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
      a.mode === "rhyme-structure" &&
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
