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
 * Markup, stripped from the returned `body`:
 * - A line that is only `[Label]` or `[Label N]` (e.g. `[Verse 1]`,
 *   `[Pre-Chorus]`) labels every section up to the next header. Sections before
 *   the first header are labelled `verse`.
 * - A trailing `| tokens` annotates its line. Tokens are space-separated:
 *   - a letter group (`A`–`Z`, `AA`–`ZZ`) is a rhyme group scoped to its section,
 *   - `@name` joins the line's group with every group tagged `@name`,
 *   - `X` marks the line deliberately unrhymed,
 *   - `>` marks it enjambed.
 *   A line MUST NOT carry `X` alongside a letter group or `@name`.
 *
 * Rhyme groups become song-wide ids in order of first appearance. Annotation
 * `lineIndex`es address `body.split("\n")`.
 *
 * @param raw  The file's contents.
 * @return The entry fields. Annotations are pre-transform.
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

  const groups = new GroupUnion();
  const rows: { lineIndex: number; quote: string; groupKey: string | null; marker: LineMarker }[] =
    [];
  let section = 0;
  let contentLine = 0;
  for (const [lineIndex, quote] of lines.entries()) {
    if (quote === "") {
      section++;
      continue;
    }
    const marker = markers[contentLine++];
    if (!marker) continue;
    const keys = [
      ...(marker.letter ? [`${section}:${marker.letter}`] : []),
      ...marker.names.map((name) => `@${name}`),
    ];
    for (const key of keys.slice(1)) groups.join(keys[0] ?? key, key);
    rows.push({ lineIndex, quote, groupKey: keys[0] ?? null, marker });
  }

  const groupIds = new Map<string, number>();
  const annotations: ReadLineAnnotationRow[] = rows.map(
    ({ lineIndex, quote, groupKey, marker }) => {
      let rhymeGroup: number | null = null;
      if (marker.unrhymed) {
        rhymeGroup = UNRHYMED_SENTINEL;
      } else if (groupKey) {
        const root = groups.find(groupKey);
        if (!groupIds.has(root)) groupIds.set(root, groupIds.size + 1);
        rhymeGroup = groupIds.get(root) ?? null;
      }
      return { lineIndex, quote, rhymeGroup, enjambed: marker.enjambed };
    },
  );

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
  names: string[];
  unrhymed: boolean;
  enjambed: boolean;
}

class GroupUnion {
  private readonly parent = new Map<string, string>();

  find(key: string): string {
    const parent = this.parent.get(key);
    if (parent === undefined || parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  join(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
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
  const marker: LineMarker = { letter: null, names: [], unrhymed: false, enjambed: false };
  for (const token of tokens.trim().split(/\s+/).filter(Boolean)) {
    if (token === ">") {
      marker.enjambed = true;
    } else if (token === "X") {
      marker.unrhymed = true;
    } else if (/^[A-Z]{1,2}$/.test(token) && marker.letter === null) {
      marker.letter = token;
    } else if (/^@[\w-]+$/.test(token)) {
      marker.names.push(token.slice(1));
    } else {
      throw new AnnotatedBodyError(`line ${rawIndex + 1}: unexpected marker token "${token}"`);
    }
  }
  if (marker.unrhymed && (marker.letter || marker.names.length > 0)) {
    throw new AnnotatedBodyError(`line ${rawIndex + 1}: a line cannot be both X and a rhyme group`);
  }
  return marker;
}

const DEFAULT_SECTION_LABEL: LyricEntrySectionType = "verse";
const HEADER_PATTERN = /^\s*\[([^\]]+)\]\s*$/;
const MARKER_PATTERN = /\|([^|]*)$/;
