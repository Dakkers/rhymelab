import {
  LyricEntrySectionTypeSchema,
  normalizeEntryBody,
  splitSections,
  UNRHYMED_SENTINEL,
  type LyricEntrySectionType,
  type ReadLineAnnotationRow,
} from "@rhymelab/api-contract";

/**
 * Parse a hand-annotated lyrics file into an entry's `body`, `structure`, and
 * line annotations.
 *
 * Markup, all of it stripped from the returned `body`:
 * - A line that is only `[Label]` or `[Label N]` (e.g. `[Verse 1]`,
 *   `[Pre-Chorus]`) labels every section up to the next header. Sections before
 *   the first header are labelled `verse`.
 * - A trailing `| tokens` annotates its line. Tokens are space-separated:
 *   a letter group (`A`–`Z`, `AA`–`ZZ`) is a song-wide rhyme group, `X` marks the
 *   line deliberately unrhymed, and `>` marks it enjambed. A line MUST NOT carry
 *   both a letter group and `X`.
 *
 * Letter groups become rhyme group ids in order of first appearance. Annotation
 * `lineIndex`es address `body.split("\n")`.
 *
 * @param raw  The file's contents.
 * @return The cleaned entry fields. Annotations are in DB shape.
 * @throws {AnnotatedBodyError} When a header label or marker token is not recognised.
 */
export function parseAnnotatedBody(raw: string): ParsedAnnotatedBody {
  const markers: (LineMarker | null)[] = [];
  const headerBeforeLine: (LyricEntrySectionType | null)[] = [];
  let pendingHeader: LyricEntrySectionType | null = null;

  const stripped = raw.split("\n").map((line, rawIndex) => {
    const header = HEADER_PATTERN.exec(line);
    if (header) {
      pendingHeader = parseSectionLabel(header[1] ?? "", rawIndex);
      return "";
    }
    const marked = MARKER_PATTERN.exec(line);
    const text = (marked ? line.slice(0, marked.index) : line).trim();
    if (text === "") {
      if (marked) {
        throw new AnnotatedBodyError(`line ${rawIndex + 1}: marker on a blank line`);
      }
      return "";
    }
    markers.push(marked ? parseMarker(marked[1] ?? "", rawIndex) : null);
    headerBeforeLine.push(pendingHeader);
    pendingHeader = null;
    return text;
  });

  const body = normalizeEntryBody(stripped.join("\n"));
  const lines = body.split("\n");

  const groupIds = new Map<string, number>();
  const annotations: ReadLineAnnotationRow[] = [];
  let contentLine = 0;
  for (const [lineIndex, quote] of lines.entries()) {
    if (quote === "") continue;
    const marker = markers[contentLine++];
    if (!marker) continue;
    let rhymeGroup: number | null = null;
    if (marker.unrhymed) {
      rhymeGroup = UNRHYMED_SENTINEL;
    } else if (marker.letter) {
      if (!groupIds.has(marker.letter)) groupIds.set(marker.letter, groupIds.size + 1);
      rhymeGroup = groupIds.get(marker.letter) ?? null;
    }
    annotations.push({ lineIndex, quote, rhymeGroup, enjambed: marker.enjambed });
  }

  if (annotations.at(-1)?.enjambed && annotations.at(-1)?.lineIndex === lines.length - 1) {
    throw new AnnotatedBodyError("the last line cannot be enjambed");
  }

  return { body, structure: deriveStructure(body, headerBeforeLine), annotations };
}

/** Thrown when an annotated lyrics file contains markup that can't be parsed. */
export class AnnotatedBodyError extends Error {
  override name = "AnnotatedBodyError";
}

export interface ParsedAnnotatedBody {
  body: string;
  structure: LyricEntrySectionType[];
  annotations: ReadLineAnnotationRow[];
}

interface LineMarker {
  letter: string | null;
  unrhymed: boolean;
  enjambed: boolean;
}

function deriveStructure(
  body: string,
  headerBeforeLine: (LyricEntrySectionType | null)[],
): LyricEntrySectionType[] {
  let label: LyricEntrySectionType = DEFAULT_SECTION_LABEL;
  let contentLine = 0;
  return splitSections(body).map((section) => {
    label = headerBeforeLine[contentLine] ?? label;
    contentLine += section.split("\n").length;
    return label;
  });
}

function parseSectionLabel(label: string, rawIndex: number): LyricEntrySectionType {
  const normalized = label
    .replace(/\s+\d+$/, "")
    .replace(/[\s-]/g, "")
    .toLowerCase();
  const parsed = LyricEntrySectionTypeSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new AnnotatedBodyError(`line ${rawIndex + 1}: unknown section header "[${label}]"`);
  }
  return parsed.data;
}

function parseMarker(tokens: string, rawIndex: number): LineMarker {
  const marker: LineMarker = { letter: null, unrhymed: false, enjambed: false };
  for (const token of tokens.trim().split(/\s+/).filter(Boolean)) {
    if (token === ">") {
      marker.enjambed = true;
    } else if (token === "X") {
      marker.unrhymed = true;
    } else if (/^[A-Z]{1,2}$/.test(token) && marker.letter === null) {
      marker.letter = token;
    } else {
      throw new AnnotatedBodyError(`line ${rawIndex + 1}: unexpected marker token "${token}"`);
    }
  }
  if (marker.unrhymed && marker.letter) {
    throw new AnnotatedBodyError(`line ${rawIndex + 1}: a line cannot be both X and a rhyme group`);
  }
  return marker;
}

const DEFAULT_SECTION_LABEL: LyricEntrySectionType = "verse";
const HEADER_PATTERN = /^\s*\[([^\]]+)\]\s*$/;
const MARKER_PATTERN = /\|([^|]*)$/;
