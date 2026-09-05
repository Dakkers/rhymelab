import { describe, expect, it } from "vitest";
import { detectSections, normalizeText, parseLines } from "./lyrics";

const NBSP = String.fromCodePoint(0x00a0);
const EN_QUAD = String.fromCodePoint(0x2000);
const HAIR_SPACE = String.fromCodePoint(0x200a);
const NNBSP = String.fromCodePoint(0x202f);
const MMSP = String.fromCodePoint(0x205f);
const IDEO_SPACE = String.fromCodePoint(0x3000);
const LINE_SEP = String.fromCodePoint(0x2028);
const PARA_SEP = String.fromCodePoint(0x2029);
const NEL = String.fromCodePoint(0x0085);
const COMBINING_ACUTE = String.fromCodePoint(0x0301);

describe("normalizeText", () => {
  it("NFC-composes decomposed sequences (é as one code point)", () => {
    const decomposed = "Cafe" + COMBINING_ACUTE;
    const out = normalizeText(decomposed);
    expect(out).toBe("Café");
    expect(out.length).toBe(4);
    expect(out).toBe(normalizeText("Café"));
  });

  it("folds NBSP and the fixed-width Unicode spaces to a plain ASCII space", () => {
    for (const sp of [NBSP, EN_QUAD, HAIR_SPACE, NNBSP, MMSP, IDEO_SPACE]) {
      expect(normalizeText(`a${sp}b`)).toBe("a b");
    }
    expect(normalizeText(`two${NBSP}islands`)).toBe(normalizeText("two islands"));
  });

  it("strips trailing exotic spaces (folded, then the trailing-space pass runs)", () => {
    expect(normalizeText(`word${NBSP}`)).toBe("word");
    expect(normalizeText(`word${IDEO_SPACE}${NBSP}`)).toBe("word");
  });

  it("does not touch case, punctuation, or apostrophes (D-10)", () => {
    expect(normalizeText("Don’t")).toBe("Don’t");
    expect(normalizeText("Kings? YES")).toBe("Kings? YES");
  });

  it("folds every newline convention to \\n (incl. U+2028/2029/0085)", () => {
    expect(normalizeText(`a\r\nb`)).toBe("a\nb");
    expect(normalizeText(`a\rb`)).toBe("a\nb");
    expect(normalizeText(`a${LINE_SEP}b`)).toBe("a\nb");
    expect(normalizeText(`a${PARA_SEP}b`)).toBe("a\nb");
    expect(normalizeText(`a${NEL}b`)).toBe("a\nb");
  });

  it("collapses blank-line runs and trims leading/trailing blanks", () => {
    expect(normalizeText("\n\nverse one\n\n\n\nverse two\n\n")).toBe("verse one\n\nverse two");
  });

  it("is idempotent — a second pass changes nothing", () => {
    const messy = `Verse${NBSP}one  ${NEL}line two${IDEO_SPACE}\r\n\n\n\nSection${PARA_SEP}two`;
    const once = normalizeText(messy);
    expect(normalizeText(once)).toBe(once);
  });

  it("keeps section detection stable after normalization", () => {
    const text = normalizeText(
      `hook line${NBSP}one\nhook line two\n\n\nhook line one\nhook line two`,
    );
    const sections = detectSections(text);
    expect(sections.length).toBe(2);
    const lines = parseLines(text);
    const slice = (s: (typeof sections)[number]) => text.slice(s.startOffset, s.endOffset);
    expect(slice(sections[0]!)).toBe(slice(sections[1]!));
    expect(lines.filter((l) => !l.blank).length).toBe(4);
  });
});
