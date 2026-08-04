import { describe, expect, it } from "vitest";
import { detectSections, parseLines } from "./lyrics";
import { reconcile, type ReconcileAnnotation, type ReconcileSection } from "./reconcile";

/**
 * Builds the "old state" for a lyrics string the way the DB would hold it —
 * sections addressed by id/orderIndex, annotations by (sectionId, lineInSection)
 * — and lets a test annotate specific lines. Section ids are 1-based by position.
 */
function oldState(lyrics: string) {
  const sections: ReconcileSection[] = detectSections(lyrics).map((d, i) => ({
    id: i + 1,
    orderIndex: i,
    startOffset: d.startOffset,
    endOffset: d.endOffset,
    canonicalSectionId: null,
    manualUnlink: false,
  }));
  const parsed = parseLines(lyrics);
  const linesOf = (s: ReconcileSection) =>
    parsed.filter((l) => !l.blank && l.start >= s.startOffset && l.end <= s.endOffset);
  const annotations: ReconcileAnnotation[] = [];
  let nextId = 100;
  function annotate(
    sectionId: number,
    lineInSection: number,
    value: string,
    opts: { startChar?: number; endChar?: number; detached?: boolean } = {},
  ): number {
    const sec = sections.find((s) => s.id === sectionId)!;
    const line = linesOf(sec)[lineInSection]!;
    const startChar = opts.startChar ?? null;
    const endChar = opts.endChar ?? null;
    const quote = startChar === null ? line.text : line.text.slice(startChar, endChar ?? undefined);
    const id = nextId++;
    annotations.push({
      id,
      sectionId: opts.detached ? sectionId : sectionId,
      lineInSection: opts.detached ? null : lineInSection,
      startChar,
      endChar,
      quote,
      value,
      detached: opts.detached ?? false,
    });
    return id;
  }
  return { lyrics, sections, annotations, annotate };
}

const byId = (plan: ReturnType<typeof reconcile>, id: number) =>
  plan.annotations.find((a) => a.id === id)!;

describe("reconcile — structural transitions (no duplicates)", () => {
  it("1→1 same: sections and annotations unchanged", () => {
    const s = oldState("one\ntwo");
    const a0 = s.annotate(1, 0, "A");
    const a1 = s.annotate(1, 1, "B");
    const plan = reconcile(s.lyrics, s.sections, s.annotations, "one\ntwo");

    expect(plan.sections.map((x) => x.id)).toEqual([1]);
    expect(plan.deleteSectionIds).toEqual([]);
    expect(byId(plan, a0)).toMatchObject({
      sectionRef: 1,
      lineInSection: 0,
      quote: "one",
      detached: false,
    });
    expect(byId(plan, a1)).toMatchObject({
      sectionRef: 1,
      lineInSection: 1,
      quote: "two",
      detached: false,
    });
  });

  it("1→1 edited above threshold: the edited line carries with a fresh quote", () => {
    const s = oldState("the quick brown fox\nsecond line");
    const a0 = s.annotate(1, 0, "A");
    // One-word tweak → similarity well above 0.5.
    const plan = reconcile(s.lyrics, s.sections, s.annotations, "the quick brown box\nsecond line");
    expect(plan.sections.map((x) => x.id)).toEqual([1]);
    expect(byId(plan, a0)).toMatchObject({
      sectionRef: 1,
      lineInSection: 0,
      quote: "the quick brown box",
      detached: false,
    });
  });

  it("1→1 edited below threshold: the rewritten line detaches, section keeps id", () => {
    const s = oldState("the quick brown fox\nkeep this line\nand this one");
    const a0 = s.annotate(1, 0, "A"); // on the line we wipe out
    const a1 = s.annotate(1, 1, "B"); // on a line that stays
    const plan = reconcile(
      s.lyrics,
      s.sections,
      s.annotations,
      "totally different words here\nkeep this line\nand this one",
    );
    // 2 of 3 lines exact-match → section survives (id 1 kept).
    expect(plan.sections.map((x) => x.id)).toEqual([1]);
    expect(byId(plan, a0)).toMatchObject({ detached: true, lineInSection: null, sectionRef: 1 });
    expect(byId(plan, a1)).toMatchObject({
      detached: false,
      lineInSection: 1,
      quote: "keep this line",
    });
  });

  it("1→0 departure without successor: rows orphan (never delete)", () => {
    const s = oldState("verse one\nverse two\n\nchorus line");
    const a0 = s.annotate(1, 0, "A"); // in the section we delete
    const a1 = s.annotate(2, 0, "B"); // in the surviving section
    // Drop the first section entirely.
    const plan = reconcile(s.lyrics, s.sections, s.annotations, "chorus line");
    expect(plan.deleteSectionIds).toEqual([1]);
    // Orphaned: no section, detached, quote preserved.
    expect(byId(plan, a0)).toMatchObject({
      sectionRef: null,
      lineInSection: null,
      detached: true,
      quote: "verse one",
    });
    // The surviving section kept id 2; its annotation rides along.
    const survivor = plan.sections.find((x) => x.id === 2)!;
    expect(byId(plan, a1)).toMatchObject({
      sectionRef: survivor.ref,
      detached: false,
      quote: "chorus line",
    });
  });

  it("0→1 creation: a new block is a creation; existing rows untouched", () => {
    const s = oldState("verse one\nverse two");
    const a0 = s.annotate(1, 0, "A");
    const plan = reconcile(
      s.lyrics,
      s.sections,
      s.annotations,
      "verse one\nverse two\n\nbrand new section",
    );
    expect(plan.sections.map((x) => x.id)).toEqual([1, null]);
    const creation = plan.sections.find((x) => x.id === null)!;
    expect(creation.ref).toBeLessThan(0);
    expect(byId(plan, a0)).toMatchObject({ sectionRef: 1, lineInSection: 0, detached: false });
  });

  it("1→2 split: the tail line follows into the new block", () => {
    const s = oldState("line one\nline two");
    const a0 = s.annotate(1, 0, "A");
    const a1 = s.annotate(1, 1, "B");
    // Insert a blank so the two lines become two sections.
    const plan = reconcile(s.lyrics, s.sections, s.annotations, "line one\n\nline two");
    // Tie (1 line each) → earlier block keeps id 1; the second is a creation.
    const first = plan.sections.find((x) => x.orderIndex === 0)!;
    const second = plan.sections.find((x) => x.orderIndex === 1)!;
    expect(first.id).toBe(1);
    expect(second.id).toBeNull();
    expect(byId(plan, a0)).toMatchObject({
      sectionRef: first.ref,
      lineInSection: 0,
      detached: false,
    });
    expect(byId(plan, a1)).toMatchObject({
      sectionRef: second.ref,
      lineInSection: 0,
      detached: false,
    });
  });

  it("2→1 merge: both sections' rows land on the merged block; the loser departs", () => {
    const s = oldState("aaa\nbbb\n\nccc\nddd");
    const a0 = s.annotate(1, 0, "A");
    const a1 = s.annotate(2, 1, "C"); // on 'ddd'
    // Remove the blank → one 4-line block.
    const plan = reconcile(s.lyrics, s.sections, s.annotations, "aaa\nbbb\nccc\nddd");
    expect(plan.sections).toHaveLength(1);
    const merged = plan.sections[0]!;
    // Both own rows → tie → earlier orderIndex (id 1) keeps the id; id 2 departs.
    expect(merged.id).toBe(1);
    expect(plan.deleteSectionIds).toEqual([2]);
    expect(byId(plan, a0)).toMatchObject({
      sectionRef: merged.ref,
      lineInSection: 0,
      detached: false,
    });
    expect(byId(plan, a1)).toMatchObject({
      sectionRef: merged.ref,
      lineInSection: 3,
      quote: "ddd",
      detached: false,
    });
  });

  it("reorder keeps every annotation on its line's text (ids preserved w/ context)", () => {
    // Three sections reordered A,B,C → A,C,B. Content-LCS preserves the anchors;
    // annotations must still land on their own line's text, never detached.
    const s = oldState("aaa\n\nbbb\n\nccc");
    const a0 = s.annotate(1, 0, "A"); // aaa
    const a1 = s.annotate(2, 0, "B"); // bbb
    const a2 = s.annotate(3, 0, "C"); // ccc
    const plan = reconcile(s.lyrics, s.sections, s.annotations, "aaa\n\nccc\n\nbbb");
    // Each annotation is attached and quotes its original line.
    for (const [id, quote] of [
      [a0, "aaa"],
      [a1, "bbb"],
      [a2, "ccc"],
    ] as const) {
      expect(byId(plan, id)).toMatchObject({ quote, detached: false });
    }
    // No annotation was orphaned or lost.
    expect(plan.annotations.filter((a) => a.detached)).toHaveLength(0);
  });

  it("re-attaches a detached row when its quote reappears", () => {
    const s = oldState("alpha\nbravo");
    // A previously-detached row whose text is about to come back.
    s.annotations.push({
      id: 200,
      sectionId: 1,
      lineInSection: null,
      startChar: null,
      endChar: null,
      quote: "charlie",
      value: "C",
      detached: true,
    });
    const plan = reconcile(s.lyrics, s.sections, s.annotations, "alpha\nbravo\ncharlie");
    const re = byId(plan, 200);
    expect(re).toMatchObject({ detached: false, quote: "charlie", startChar: null, endChar: null });
    // Attaches at the line that now holds "charlie" (lineInSection 2 of section 1).
    expect(re.lineInSection).toBe(2);
  });
});
