import {
  LyricEntrySectionTypeSchema,
  type LyricEntrySectionType,
} from "@rhymelab/database/schemas";
import type { ReadLineAnnotation } from "./lyricEntry.schemas";

const DEFAULT_SECTION_TYPE: LyricEntrySectionType = "verse";

/**
 * Derive an entry's list-view fields from its `body`. Blank lines count toward
 * `lineCount`; `excerpt` previews the opening non-blank lines.
 */
export function deriveEntrySummaryFields(body: string): {
  excerpt: string;
  lineCount: number;
  wordCount: number;
} {
  const lines = body.split("\n");
  const excerpt =
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" / ") || body.trim();
  return {
    excerpt,
    lineCount: lines.length,
    wordCount: body.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * The initial `structure` for a body: the default label for every section.
 */
export function initStructure(body: string): LyricEntrySectionType[] {
  return Array.from({ length: splitSections(body).length }, () => DEFAULT_SECTION_TYPE);
}

/**
 * Split a `body` into sections: runs of non-blank lines separated by blank
 * lines. An empty body has no sections.
 *
 * A `structure` MUST have exactly `splitSections(body).length` labels.
 */
export function splitSections(body: string): string[] {
  const normalized = normalizeEntryBody(body);
  return normalized === "" ? [] : normalized.split("\n\n");
}

/**
 * Normalize a `body`: every line trimmed, sections separated by exactly one
 * blank line, no leading or trailing blank lines.
 */
export function normalizeEntryBody(body: string): string {
  const lines = body.split("\n").map((line) => line.trim());
  const normalized: string[] = [];
  for (const line of lines) {
    if (line === "" && (normalized.length === 0 || normalized.at(-1) === "")) {
      continue;
    }
    normalized.push(line);
  }
  if (normalized.at(-1) === "") {
    normalized.pop();
  }
  return normalized.join("\n");
}

/**
 * Re-derive `structure` after `body` changes. Returns exactly
 * `splitSections(nextBody).length` labels.
 *
 * Sections whose text is unchanged keep their label, even when sections are
 * inserted or removed around them. New sections get the default label. A
 * reordered or edited section counts as new.
 */
export function resyncStructure(
  prevBody: string,
  prevStructure: readonly string[],
  nextBody: string,
): LyricEntrySectionType[] {
  const prev = splitSections(prevBody);
  const next = splitSections(nextBody);
  const prevLabels = coerceStructure(prevStructure, prev.length);

  const lcs: number[][] = Array.from({ length: prev.length + 1 }, () =>
    Array.from({ length: next.length + 1 }, () => 0),
  );
  for (let i = 1; i <= prev.length; i++) {
    for (let j = 1; j <= next.length; j++) {
      lcs[i][j] =
        prev[i - 1] === next[j - 1]
          ? lcs[i - 1][j - 1] + 1
          : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  const result: LyricEntrySectionType[] = Array.from(
    { length: next.length },
    () => DEFAULT_SECTION_TYPE,
  );
  let i = prev.length;
  let j = next.length;
  while (i > 0 && j > 0) {
    if (prev[i - 1] === next[j - 1]) {
      result[j - 1] = prevLabels[i - 1];
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

/**
 * Coerce a stored `structure` to exactly `length` valid labels. Missing or
 * unknown values become the default; legacy rows predating the column read as `[]`.
 */
function coerceStructure(structure: readonly string[], length: number): LyricEntrySectionType[] {
  return Array.from({ length }, (_, i) =>
    isSectionType(structure[i]) ? structure[i] : DEFAULT_SECTION_TYPE,
  );
}

function isSectionType(value: string | undefined): value is LyricEntrySectionType {
  return !!LyricEntrySectionTypeSchema.safeParse(value).success;
}

/** A line's place in its section's rhyme scheme. `group` is null for unrhymed lines. */
export type EntryLineRhyme = { group: number | null; letter: string; unrhymed: boolean };

export type EntryLine = {
  index: number;
  text: string;
  rhyme: EntryLineRhyme | null;
  enjambed: boolean;
};

export type EntrySection = { type: LyricEntrySectionType; lines: EntryLine[] };

/** The annotation fields {@link buildEntrySections} reads. */
export type SectionAnnotationInput = Pick<
  ReadLineAnnotation,
  "lineIndex" | "rhymeGroup" | "unrhymed" | "enjambed"
>;

/**
 * Build render-ready sections from a `body`, its `structure` and its annotations.
 *
 * Line `index` is song-wide and counts blank separator lines. Rhyme letters
 * restart at "A" in every section, in order of first appearance. Unrhymed lines
 * are "X". Annotations that do not land on a body line are dropped. Sections
 * missing a `structure` label read as the default.
 */
export function buildEntrySections(
  body: string,
  structure: readonly string[],
  annotations: readonly SectionAnnotationInput[],
): EntrySection[] {
  const byLine = new Map(annotations.map((annotation) => [annotation.lineIndex, annotation]));
  const sections = splitSections(body);
  const types = coerceStructure(structure, sections.length);
  let cursor = 0;

  return sections.map((text, sectionIndex) => {
    const letters = new Map<number, string>();
    const lines = text.split("\n").map((lineText, offset): EntryLine => {
      const index = cursor + offset;
      const annotation = byLine.get(index);
      if (!annotation) return { index, text: lineText, rhyme: null, enjambed: false };
      return {
        index,
        text: lineText,
        rhyme: toRhyme(annotation, letters),
        enjambed: annotation.enjambed,
      };
    });
    cursor += lines.length + 1;
    return { type: types[sectionIndex], lines };
  });
}

function toRhyme(
  annotation: SectionAnnotationInput,
  letters: Map<number, string>,
): EntryLineRhyme | null {
  if (annotation.unrhymed) return { group: null, letter: "X", unrhymed: true };
  if (annotation.rhymeGroup === null) return null;
  let letter = letters.get(annotation.rhymeGroup);
  if (letter === undefined) {
    letter = toLetters(letters.size);
    letters.set(annotation.rhymeGroup, letter);
  }
  return { group: annotation.rhymeGroup, letter, unrhymed: false };
}

function toLetters(ordinal: number): string {
  let label = "";
  for (let n = ordinal + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}
