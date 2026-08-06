import { describe, expect, it } from "vitest";
import { detectSections, parseLines } from "./lyrics";
import { assertEntryIntegrity } from "./integrity";
import {
  reconcile,
  resolvePlan,
  type ReconcileAnnotation,
  type ReconcilePlan,
  type ReconcileSection,
  type ResolvedAnnotation,
  type ResolvedSection,
} from "./reconcile";

/**
 * The Phase 2.5 duplicate matrix. Every case reconciles, then RESOLVES the plan
 * (refs → concrete ids, as the backend/mock apply would) and runs
 * `assertEntryIntegrity` — so each transition is checked against the exact I1–I6
 * production enforces, not just against hand-picked expectations. Duplicate state
 * is seeded by editing the `sections` `oldState` returns (D-11: a linked section
 * owns no rows, so annotate the canonical, not the duplicate).
 */

/** Old-state builder (mirrors reconcile.test.ts; annotate the canonical for dups). */
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
      sectionId,
      lineInSection: opts.detached ? null : lineInSection,
      startChar,
      endChar,
      quote,
      value,
      detached: opts.detached ?? false,
    });
    return id;
  }
  /** Point `dupId` at `canonId` (dup owns no rows — seed rows on the canonical). */
  function link(dupId: number, canonId: number): void {
    sections.find((s) => s.id === dupId)!.canonicalSectionId = canonId;
  }
  return { lyrics, sections, annotations, annotate, link };
}

/** Resolve a plan to concrete rows (creation/copy ids from high counters). */
function resolve(plan: ReconcilePlan): {
  sections: ResolvedSection[];
  annotations: ResolvedAnnotation[];
} {
  let sid = 1000;
  let aid = 5000;
  return resolvePlan(
    plan,
    () => ++sid,
    () => ++aid,
  );
}

/**
 * Reconcile one save, resolve it, assert integrity, and return the resolved state
 * (a valid input for the next save) plus the plan. The heart of the matrix: every
 * transition passes I1–I6 or the test fails here.
 */
function step(
  oldLyrics: string,
  sections: ReconcileSection[],
  annotations: ReconcileAnnotation[],
  input: string,
) {
  const plan = reconcile(oldLyrics, sections, annotations, input);
  const resolved = resolve(plan);
  assertEntryIntegrity(plan.newLyrics, resolved.sections, resolved.annotations);
  return { lyrics: plan.newLyrics, ...resolved, plan };
}

/** The section a resolved annotation renders on, following the link one hop. */
const canonicalOf = (s: ResolvedSection[], id: number | null) => {
  const sec = s.find((x) => x.id === id);
  return sec?.canonicalSectionId ?? id;
};
const live = (a: ResolvedAnnotation[]) => a.filter((x) => !x.detached);
const rowsOn = (a: ResolvedAnnotation[], sectionId: number) =>
  a.filter((x) => !x.detached && x.sectionId === sectionId);

describe("reconcile — duplicate lifecycle", () => {
  it("linked duplicate: canonical keeps the rows, the duplicate owns none", () => {
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(1, 0, "A");
    s.annotate(1, 1, "B");
    s.link(2, 1); // section 2 is a duplicate of section 1
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb");

    const s1 = r.sections.find((x) => x.orderIndex === 0)!;
    const s2 = r.sections.find((x) => x.orderIndex === 1)!;
    expect(s1.canonicalSectionId).toBeNull();
    expect(s2.canonicalSectionId).toBe(s1.id);
    expect(rowsOn(r.annotations, s1.id)).toHaveLength(2);
    expect(rowsOn(r.annotations, s2.id)).toHaveLength(0);
  });

  it("paste-a-chorus (R-3): the created copy links to the sticky canonical", () => {
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(1, 0, "A");
    s.annotate(1, 1, "B");
    s.link(2, 1);
    // Paste a THIRD identical chorus at the top → a creation joins the group.
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb\n\naa\nbb");

    expect(r.sections).toHaveLength(3);
    // Exactly one canonical, and it still owns the two rows (sticky — no churn).
    const canon = r.sections.filter((x) => x.canonicalSectionId === null);
    expect(canon).toHaveLength(1);
    expect(rowsOn(r.annotations, canon[0]!.id)).toHaveLength(2);
    // Every other section links to that one canonical.
    for (const sec of r.sections) {
      if (sec.canonicalSectionId === null) continue;
      expect(sec.canonicalSectionId).toBe(canon[0]!.id);
    }
  });

  it("fresh duplicate: the row-owning section becomes canonical, the copy links to it", () => {
    const s = oldState("aa\nbb");
    s.annotate(1, 0, "A");
    // Append an identical copy → a brand-new duplicate group forms this save.
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb");

    const owner = r.sections.find((x) => x.id === 1)!;
    const copy = r.sections.find((x) => x.id !== 1)!;
    expect(owner.canonicalSectionId).toBeNull();
    expect(copy.canonicalSectionId).toBe(owner.id);
    expect(rowsOn(r.annotations, owner.id)).toHaveLength(1);
  });

  it("fresh duplicate, neither annotated: the earliest is canonical", () => {
    const s = oldState("aa\nbb");
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb");
    const first = r.sections.find((x) => x.orderIndex === 0)!;
    const second = r.sections.find((x) => x.orderIndex === 1)!;
    expect(first.canonicalSectionId).toBeNull();
    expect(second.canonicalSectionId).toBe(first.id);
  });

  it("two row-owning sections collide on identical text: link none of them (D-11)", () => {
    // Two separately-annotated sections that happen to be byte-equal.
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(1, 0, "A");
    s.annotate(2, 0, "B"); // section 2 ALSO owns a row — not a clean duplicate
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb");
    // Neither row-owner is demoted to a link (I6); both keep their own rows.
    for (const sec of r.sections) expect(sec.canonicalSectionId).toBeNull();
    expect(rowsOn(r.annotations, 1).length).toBeGreaterThan(0);
    expect(rowsOn(r.annotations, 2).length).toBeGreaterThan(0);
  });

  it("duplicate-side divergence: materialize a copy + set manualUnlink (P10)", () => {
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(1, 0, "A");
    s.annotate(1, 1, "B");
    s.link(2, 1);
    // Append a line to section 2 → it diverges from the canonical.
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb\ncc");

    const s2 = r.sections.find((x) => x.orderIndex === 1)!;
    expect(s2.manualUnlink).toBe(true);
    expect(s2.canonicalSectionId).toBeNull();
    // Section 2 now owns its OWN copy of the canonical's rows (kept through divergence).
    expect(rowsOn(r.annotations, s2.id)).toHaveLength(2);
  });

  it("revert-round-trip (P10): a diverged-then-reverted duplicate keeps its own rows", () => {
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(1, 0, "A");
    s.annotate(1, 1, "B");
    s.link(2, 1);

    // Save 1 — diverge section 2 (append a line). It materializes + manualUnlinks.
    const one = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb\ncc");
    // Save 2 — revert section 2 back to the chorus text.
    const two = step(one.lyrics, one.sections, one.annotations, "aa\nbb\n\naa\nbb");

    const s2 = two.sections.find((x) => x.orderIndex === 1)!;
    // NOT silently relinked (manualUnlink sticks) — its own rows survive the revert.
    expect(s2.manualUnlink).toBe(true);
    expect(s2.canonicalSectionId).toBeNull();
    expect(rowsOn(two.annotations, s2.id)).toHaveLength(2);
    // And the original canonical still has its rows too.
    const s1 = two.sections.find((x) => x.orderIndex === 0)!;
    expect(rowsOn(two.annotations, s1.id)).toHaveLength(2);
  });

  it("canonical-side divergence: a successor is elected and inherits the rows (copy)", () => {
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(1, 0, "A");
    s.annotate(1, 1, "B");
    s.link(2, 1); // section 1 canonical, section 2 linked
    // Edit the CANONICAL (append a line to section 1); section 2 unchanged.
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\ncc\n\naa\nbb");

    const s1 = r.sections.find((x) => x.orderIndex === 0)!; // ex-canonical, diverged
    const s2 = r.sections.find((x) => x.orderIndex === 1)!; // successor
    expect(s1.manualUnlink).toBe(true);
    expect(s1.canonicalSectionId).toBeNull();
    // The successor inherited a copy of the chorus rows and is the group's canonical.
    expect(rowsOn(r.annotations, s2.id).length).toBeGreaterThanOrEqual(2);
  });

  it("departed canonical: rows hand off to a surviving duplicate (D-13)", () => {
    // Section 1 is a duplicate of section 2 (the canonical, which owns the rows).
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(2, 0, "A");
    s.annotate(2, 1, "B");
    s.link(1, 2); // section 1 → canonical section 2
    // Delete the SECOND chorus → the canonical (section 2) departs; section 1 stays.
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb");

    expect(r.plan.deleteSectionIds).toEqual([2]);
    expect(r.sections).toHaveLength(1);
    const survivor = r.sections[0]!;
    // The canonical's rows MOVED to the survivor — nothing orphaned, nothing lost.
    expect(rowsOn(r.annotations, survivor.id)).toHaveLength(2);
    expect(live(r.annotations)).toHaveLength(2);
  });

  it("departed canonical with no successor: rows orphan (never deleted)", () => {
    const s = oldState("aa\nbb\n\ncc\ndd");
    s.annotate(1, 0, "A");
    s.annotate(1, 1, "B");
    // Delete section 1 entirely (no equal survivor).
    const r = step(s.lyrics, s.sections, s.annotations, "cc\ndd");
    expect(r.plan.deleteSectionIds).toEqual([1]);
    const orphans = r.annotations.filter((a) => a.detached && a.sectionId === null);
    expect(orphans).toHaveLength(2);
    expect(orphans.every((a) => a.quote.length > 0)).toBe(true);
  });

  it("manualUnlink section is excluded from grouping (its rows stay its own)", () => {
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(2, 0, "A"); // section 2 owns a row
    s.sections.find((x) => x.id === 2)!.manualUnlink = true; // and is manually unlinked
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb");
    const s2 = r.sections.find((x) => x.orderIndex === 1)!;
    expect(s2.manualUnlink).toBe(true);
    expect(s2.canonicalSectionId).toBeNull(); // NOT relinked despite equal text
    expect(rowsOn(r.annotations, s2.id)).toHaveLength(1);
  });

  it("write-redirect: a split onto a linked creation attaches at the canonical (§5.4-4)", () => {
    // One block that is a doubled two-line hook; the SECOND half is annotated.
    const s = oldState("h1\nh2\nh1\nh2");
    s.annotate(1, 2, "A"); // the 2nd "h1"
    s.annotate(1, 3, "B"); // the 2nd "h2"
    // Split into two identical hook blocks. The 2nd is a creation → links to the 1st.
    const r = step(s.lyrics, s.sections, s.annotations, "h1\nh2\n\nh1\nh2");

    const canon = r.sections.filter((x) => x.canonicalSectionId === null);
    expect(canon).toHaveLength(1);
    const linked = r.sections.find((x) => x.canonicalSectionId !== null)!;
    // No live row sits on the linked section — the second-half rows redirected up.
    expect(rowsOn(r.annotations, linked.id)).toHaveLength(0);
    expect(rowsOn(r.annotations, canon[0]!.id).length).toBeGreaterThan(0);
  });

  it("re-attach redirects a hit inside a linked section to its canonical", () => {
    const s = oldState("aa\nbb\n\naa\nbb");
    s.annotate(1, 0, "A");
    s.link(2, 1);
    // A detached row whose quote ("aa") reappears — it must land on the canonical,
    // never on the linked duplicate (I3/I6).
    s.annotations.push({
      id: 300,
      sectionId: null,
      lineInSection: null,
      startChar: null,
      endChar: null,
      quote: "aa",
      value: "C",
      detached: true,
    });
    const r = step(s.lyrics, s.sections, s.annotations, "aa\nbb\n\naa\nbb");
    const reattached = r.annotations.find((a) => a.value === "C")!;
    if (!reattached.detached) {
      expect(canonicalOf(r.sections, reattached.sectionId)).toBe(reattached.sectionId);
      const target = r.sections.find((x) => x.id === reattached.sectionId)!;
      expect(target.canonicalSectionId).toBeNull();
    }
  });
});

describe("reconcile — repeated-chorus fixture (verbatim ×2/×3 sections)", () => {
  // A trimmed stand-in for .dummy/DEMO_LongIsland.txt: an "islands" chorus ×2 and a
  // "7th avenue" chorus ×3, plus unique verses — the duplicate shapes the matrix
  // needs, inline so the core test stays node-free.
  const islands = "We were two islands\nWhen the waters had parted\nInto the muse";
  const seventh = "Now 7th Avenue\nIt wouldn't be so kind to you\nYour ghost in my room";
  const demo = [
    "If the world was ending\nI'd bike over to your house",
    islands,
    seventh,
    "You went to school\nAnd got a serious degree",
    islands,
    seventh,
    "Walking through the streets\nWith a fading memory",
    seventh,
  ].join("\n\n");

  it("create path: identical choruses form linked groups; state is stable", () => {
    // create() reconciles with zero old state.
    const first = step("", [], [], demo);
    // Each distinct chorus text has exactly one canonical; every copy links to it.
    const byText = new Map<string, ResolvedSection[]>();
    for (const sec of first.sections) {
      const text = first.lyrics.slice(sec.startOffset, sec.endOffset);
      const list = byText.get(text) ?? [];
      list.push(sec);
      byText.set(text, list);
    }
    for (const group of byText.values()) {
      if (group.length < 2) continue;
      const canon = group.filter((x) => x.canonicalSectionId === null);
      expect(canon).toHaveLength(1);
      for (const sec of group) {
        if (sec !== canon[0]) expect(sec.canonicalSectionId).toBe(canon[0]!.id);
      }
    }
    // Re-saving the identical text is a stable no-op structurally (integrity holds).
    step(first.lyrics, first.sections, first.annotations, demo);
  });

  it("annotating a chorus keeps every copy pointed at the one canonical", () => {
    const first = step("", [], [], demo);
    // Find the "We were two islands" canonical and annotate its first line.
    const islandsCanon = first.sections.find(
      (sec) =>
        first.lyrics.slice(sec.startOffset, sec.endOffset).startsWith("We were two islands") &&
        sec.canonicalSectionId === null,
    )!;
    const anns: ReconcileAnnotation[] = first.annotations.map((a) => ({ ...a }));
    const line0 = parseLines(first.lyrics).find(
      (l) => !l.blank && l.start >= islandsCanon.startOffset && l.end <= islandsCanon.endOffset,
    )!;
    anns.push({
      id: 9001,
      sectionId: islandsCanon.id,
      lineInSection: 0,
      startChar: null,
      endChar: null,
      quote: line0.text,
      value: "A",
      detached: false,
    });
    const second = step(first.lyrics, first.sections, anns, demo);
    // Still exactly one canonical per island group, and it carries the row.
    expect(rowsOn(second.annotations, islandsCanon.id).length).toBeGreaterThanOrEqual(1);
  });
});
