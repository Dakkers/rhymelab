/**
 * Turning the canonical lyrics *text* into the structures the workbench draws
 * on top of it, and back. Everything here is pure and offset-based: given the
 * same text you always get the same lines, words and section boundaries, and
 * every span carries character offsets into the original string so annotations
 * can anchor to them.
 *
 * A "word" is a maximal run of non-whitespace characters — so trailing
 * punctuation rides along with the word ("dreary,", "lore—", "door."), matching
 * how the design highlights and how rhymes actually attach to a word.
 */

/** A run of non-whitespace characters, with its offsets into the full text. */
export interface WordToken {
  /** Position among the *words* of the whole poem (stable id for selection). */
  wordIndex: number;
  start: number;
  end: number;
  text: string;
}

/** A single line of the lyrics and the words within it. */
export interface LineToken {
  /** 0-based line number across the whole text. */
  index: number;
  start: number;
  /** Exclusive; the offset of the line's last character + 1 (excludes `\n`). */
  end: number;
  text: string;
  blank: boolean;
  words: WordToken[];
}

/** A detected structural block — a run of non-blank lines. */
export interface DetectedSection {
  orderIndex: number;
  startOffset: number;
  endOffset: number;
}

const WHITESPACE = /\s/;

/**
 * Split the text into lines, tagging each with its offsets and its word tokens.
 * `\r\n` and `\r` are normalised to a single `\n`'s worth of accounting is *not*
 * done here — callers should feed already-normalised text (see `normalizeText`).
 */
export function parseLines(text: string): LineToken[] {
  const lines: LineToken[] = [];
  let offset = 0;
  let wordIndex = 0;
  let lineIndex = 0;

  const rawLines = text.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!;
    const start = offset;
    const end = start + raw.length;

    const words: WordToken[] = [];
    let cursor = 0;
    while (cursor < raw.length) {
      // Skip whitespace.
      if (WHITESPACE.test(raw[cursor]!)) {
        cursor++;
        continue;
      }
      // Consume a word.
      const wordStart = cursor;
      while (cursor < raw.length && !WHITESPACE.test(raw[cursor]!)) cursor++;
      words.push({
        wordIndex: wordIndex++,
        start: start + wordStart,
        end: start + cursor,
        text: raw.slice(wordStart, cursor),
      });
    }

    lines.push({
      index: lineIndex++,
      start,
      end,
      text: raw,
      blank: raw.trim().length === 0,
      words,
    });

    // +1 for the '\n' that split() removed (not added after the final line).
    offset = end + 1;
  }

  return lines;
}

/** The final non-whitespace word of a line, or `null` for a blank line. */
export function finalWord(line: LineToken): WordToken | null {
  return line.words.length ? line.words[line.words.length - 1]! : null;
}

/**
 * Detect sections by splitting on blank lines: each maximal run of consecutive
 * non-blank lines becomes one section, spanning from the first line's start to
 * the last line's end (trailing blank lines are excluded).
 */
export function detectSections(text: string): DetectedSection[] {
  const lines = parseLines(text);
  const sections: DetectedSection[] = [];
  let current: { start: number; end: number } | null = null;

  for (const line of lines) {
    if (line.blank) {
      if (current) {
        sections.push({
          orderIndex: sections.length,
          startOffset: current.start,
          endOffset: current.end,
        });
        current = null;
      }
      continue;
    }
    if (!current) current = { start: line.start, end: line.end };
    else current.end = line.end;
  }
  if (current) {
    sections.push({
      orderIndex: sections.length,
      startOffset: current.start,
      endOffset: current.end,
    });
  }

  return sections;
}

/** The lines whose span falls within `[start, end)` — a section's lines. */
export function linesInRange(lines: LineToken[], start: number, end: number): LineToken[] {
  return lines.filter((l) => l.start >= start && l.end <= end);
}

/**
 * Normalise pasted text: unify newlines, strip trailing spaces per line, and
 * cap runs of blank lines to a single blank so section detection is stable.
 * Never touches offsets the caller has already computed — run this *before*
 * storing, then compute everything from the normalised string.
 */
export function normalizeText(text: string): string {
  // Fold every newline convention to `\n` — including the Unicode line/paragraph
  // separators (U+2028/U+2029) and NEL (U+0085) that paste from Word, PDFs, and
  // some JSON sources, which `\s`-based word splitting would otherwise treat as
  // in-word whitespace and collapse two visual lines into one.
  const unified = text.replace(/\r\n?|\u2028|\u2029|\u0085/g, "\n");
  const lines = unified.split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  // Collapse 2+ consecutive blank lines to one.
  const out: string[] = [];
  let blankRun = 0;
  for (const l of lines) {
    if (l.trim() === "") {
      blankRun++;
      if (blankRun > 1) continue;
    } else {
      blankRun = 0;
    }
    out.push(l);
  }
  // Trim leading/trailing blank lines.
  while (out.length && out[0]!.trim() === "") out.shift();
  while (out.length && out[out.length - 1]!.trim() === "") out.pop();
  return out.join("\n");
}

/** A section's positional label, e.g. "Section 1", "Section 2". */
export function defaultSectionLabel(oneBasedIndex: number): string {
  return `Section ${oneBasedIndex}`;
}
