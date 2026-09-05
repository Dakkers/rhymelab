/**
 * Plain (non-Zod) logic for entries — body normalization and the `structure`
 * array it's split into. `./entries.schema` builds its Zod schemas on top of
 * these; nothing here depends on Zod.
 */

/**
 * The section labels a `structure` array is built from. A closed set so the
 * column is validated at the API and a future picker is a plain dropdown;
 * `verse` doubles as the generic stanza label and is the default a section takes
 * before anyone assigns it. Poem-specific vocabulary can be added later — the
 * set is easy to extend.
 */
export const SECTION_TYPES = ["intro", "verse", "prechorus", "chorus", "bridge", "outro"] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

/** The label a section carries until it's assigned one — see `initStructure`. */
export const DEFAULT_SECTION_TYPE: SectionType = "verse";

const SECTION_TYPE_SET: ReadonlySet<string> = new Set(SECTION_TYPES);

/**
 * Standardize a submitted `body` before it's stored: trim every line, and
 * separate sections (runs of non-blank lines) by exactly one blank line.
 *
 * Concretely — trim each line, collapse any run of blank lines to a single one,
 * and drop leading/trailing blank lines. So a body pasted with ragged trailing
 * spaces and multi-line gaps between verses lands as the same clean shape every
 * time, whichever path (create or edit) submits it.
 *
 * Trimming each line also normalizes `\r\n` newlines to `\n` (the `\r` is
 * whitespace the trim removes), so a Windows-pasted body stores identically.
 */
export function normalizeEntryBody(body: string): string {
  const lines = body.split("\n").map((line) => line.trim());
  const normalized: string[] = [];
  for (const line of lines) {
    // Skip a blank line when the previous kept line was also blank (collapsing
    // runs) or when nothing non-blank has been kept yet (trimming the top).
    if (line === "" && (normalized.length === 0 || normalized.at(-1) === "")) {
      continue;
    }
    normalized.push(line);
  }
  // A single trailing blank can survive the loop (a blank following content);
  // drop it so the body ends on its last non-blank line.
  if (normalized.at(-1) === "") {
    normalized.pop();
  }
  return normalized.join("\n");
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
 * The `structure` a freshly-saved body gets: one {@link DEFAULT_SECTION_TYPE}
 * per section, so the invariant holds from the first write and the user assigns
 * real labels afterward.
 */
export function initStructure(body: string): SectionType[] {
  return Array.from({ length: splitSections(body).length }, () => DEFAULT_SECTION_TYPE);
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
): SectionType[] {
  const prev = splitSections(prevBody);
  const next = splitSections(nextBody);
  const prevLabels = coerceStructure(prevStructure, prev.length);

  // LCS length table over the two section-text sequences.
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

  // Backtrack: matched sections inherit their old label; everything else stays
  // the pre-filled default (covers inserted sections and any head insertions
  // left when the walk reaches the top edge).
  const result: SectionType[] = Array.from({ length: next.length }, () => DEFAULT_SECTION_TYPE);
  let i = prev.length;
  let j = next.length;
  while (i > 0 && j > 0) {
    if (prev[i - 1] === next[j - 1]) {
      result[j - 1] = prevLabels[i - 1];
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      i--; // old section removed
    } else {
      j--; // new section inserted
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
function coerceStructure(structure: readonly string[], length: number): SectionType[] {
  return Array.from({ length }, (_, i) =>
    isSectionType(structure[i]) ? structure[i] : DEFAULT_SECTION_TYPE,
  );
}

function isSectionType(value: string | undefined): value is SectionType {
  return value !== undefined && SECTION_TYPE_SET.has(value);
}

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
