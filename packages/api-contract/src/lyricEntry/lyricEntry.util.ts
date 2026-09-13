import {
  LyricEntrySectionTypeSchema,
  type LyricEntrySectionType,
} from "@rhymelab/database/schemas";

const DEFAULT_SECTION_TYPE: LyricEntrySectionType = "verse";

/**
 * Derive the list-view fields (`excerpt`, `lineCount`, `wordCount`) from an
 * entry's `body`. Kept beside the schema they populate and shared by the API
 * handler (which derives them on read) and the web MSW mock (which mirrors it),
 * so the two can't drift. A line is anything between newlines, blank ones
 * included; `excerpt` previews the opening non-blank lines.
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
 * The `structure` a freshly-saved body gets: one {@link DEFAULT_SECTION_TYPE}
 * per section, so the invariant holds from the first write and the user assigns
 * real labels afterward.
 */
export function initStructure(body: string): LyricEntrySectionType[] {
  return Array.from({ length: splitSections(body).length }, () => DEFAULT_SECTION_TYPE);
}

/**
 * Split a `body` into its sections — the units a `structure` array labels. One
 * definition of "a section" for every path: normalize first (so a section is a
 * run of non-blank lines, delimited by exactly one blank line), then split on
 * the blank line. An empty body has no sections.
 *
 * The invariant the whole feature rests on is `structure.length ===
 * splitSections(body).length`; this is the right-hand side.
 */
export function splitSections(body: string): string[] {
  const normalized = normalizeEntryBody(body);
  return normalized === "" ? [] : normalized.split("\n\n");
}

/**
 * Standardize a submitted `body` before it's stored: trim every line, and
 * separate sections (runs of non-blank lines) by exactly one blank line.
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
 * Re-derive an entry's `structure` after its `body` was edited, so the array
 * never drifts from the section count — the crux of the feature.
 *
 * It aligns the old and new sections by their *text* (a longest-common-
 * subsequence over the section blocks, exact-match), then: a section that
 * survived the edit keeps whatever label it had; an inserted section takes the
 * default; a removed section's label is dropped with it. Because the alignment
 * respects order, this is correct even when the edit is in the middle of the
 * piece — inserting a verse after the first chorus doesn't shift every label
 * below it, the way a naive "pad/truncate the tail" would.
 *
 * The result is always exactly `splitSections(nextBody).length` labels long.
 *
 * Not handled specially (all acceptable — the count invariant always holds):
 * reordering sections and editing text *within* a section both read as a
 * remove + insert, so the affected section falls back to the default label.
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
 * Coerce a stored `structure` to a clean array of exactly `length` labels —
 * padding short arrays (a legacy row that predates the column reads as `[]`) and
 * mapping any value that isn't a current section type to the default. Keeps the
 * alignment below working on trustworthy input.
 */
function coerceStructure(structure: readonly string[], length: number): LyricEntrySectionType[] {
  return Array.from({ length }, (_, i) =>
    isSectionType(structure[i]) ? structure[i] : DEFAULT_SECTION_TYPE,
  );
}

function isSectionType(value: string | undefined): value is LyricEntrySectionType {
  return !!LyricEntrySectionTypeSchema.safeParse(value).success;
}
