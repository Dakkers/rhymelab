import {
  LyricEntrySectionTypeSchema,
  type LyricEntrySectionType,
} from "@rhymelab/database/schemas";

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
