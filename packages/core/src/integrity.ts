/**
 * The post-save integrity invariants (I1–I6, impl §5.2) as a pure checker, shared
 * by the reconciler unit tests (fed a resolved plan) and the backend's runtime
 * `assertEntryIntegrity(entryId)` (fed the DB rows). It is a function of the
 * lyrics text plus the sections/annotations addressed against it — the same shape
 * whether the ids are real DB ids or a plan's resolved refs.
 *
 * A healthy entry yields no violations. `assertEntryIntegrity` throws on the first
 * failure; the tests assert an empty list. Keeping it here (not in the handler)
 * means the reconciler is checked against exactly the rules production enforces.
 */
import { detectSections, parseLines } from "./lyrics";

/** A section as the invariants see it (shape-compatible with the resolved DB row). */
export interface IntegritySection {
  id: number;
  orderIndex: number;
  startOffset: number;
  endOffset: number;
  /** The section this one is a duplicate of, or null when standalone/canonical. */
  canonicalSectionId: number | null;
  manualUnlink: boolean;
}

/** An annotation as the invariants see it (shape-compatible with the resolved DB row). */
export interface IntegrityAnnotation {
  sectionId: number | null;
  lineInSection: number | null;
  startChar: number | null;
  endChar: number | null;
  quote: string;
  value: string;
  detached: boolean;
}

/**
 * Check I1–I6 against `lyrics`. Returns a list of human-readable violations
 * (empty ⟺ healthy). Pure — no DB, no clock.
 *
 * - I1: sections mirror `detectSections(lyrics)` in offsets + orderIndex.
 * - I2: a link points at a section whose own link is null (flattened; no self-link).
 * - I3: a linked section owns zero annotation rows (detached rows carrying its id
 *   count).
 * - I4: a live (non-detached) row is addressed — section set, line in range, span
 *   within the line, `quote` == the addressed text.
 * - I5: detached ⇒ `lineInSection` null; orphaned ⇒ also `sectionId` null; `quote`
 *   is never empty.
 * - I6: no row-owning section is linked (the static half of D-11's stickiness).
 */
export function checkEntryIntegrity(
  lyrics: string,
  sections: IntegritySection[],
  annotations: IntegrityAnnotation[],
): string[] {
  const violations: string[] = [];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const parsed = parseLines(lyrics);
  const linesOf = (s: IntegritySection) =>
    parsed.filter((l) => !l.blank && l.start >= s.startOffset && l.end <= s.endOffset);

  // I1 — sections mirror detectSections exactly (offsets + orderIndex, as a set).
  const detected = detectSections(lyrics);
  if (detected.length !== sections.length) {
    violations.push(`I1: ${sections.length} sections but detectSections found ${detected.length}`);
  }
  for (const d of detected) {
    const match = sections.find(
      (s) =>
        s.orderIndex === d.orderIndex &&
        s.startOffset === d.startOffset &&
        s.endOffset === d.endOffset,
    );
    if (!match) {
      violations.push(
        `I1: no section for detected block @${d.orderIndex} [${d.startOffset},${d.endOffset})`,
      );
    }
  }

  // I2 — links are flattened and never self-referential.
  for (const s of sections) {
    if (s.canonicalSectionId === null) continue;
    if (s.canonicalSectionId === s.id) {
      violations.push(`I2: section ${s.id} links to itself`);
      continue;
    }
    const target = byId.get(s.canonicalSectionId);
    if (!target) {
      violations.push(`I2: section ${s.id} links to missing section ${s.canonicalSectionId}`);
    } else if (target.canonicalSectionId !== null) {
      violations.push(`I2: section ${s.id} links to ${target.id} which is itself linked (chain)`);
    }
  }

  // Row ownership per section (detached rows carrying a sectionId count — D-11).
  const ownerIds = new Set(
    annotations.filter((a) => a.sectionId !== null).map((a) => a.sectionId as number),
  );

  // I3 / I6 — a linked (or row-owning-and-linked) section owns zero rows.
  for (const s of sections) {
    if (s.canonicalSectionId !== null && ownerIds.has(s.id)) {
      violations.push(
        `I3/I6: section ${s.id} is linked to ${s.canonicalSectionId} yet owns annotation rows`,
      );
    }
  }

  // I4 / I5 — per-annotation addressing.
  for (const a of annotations) {
    if (!a.quote) violations.push(`I5: an annotation has an empty quote (value ${a.value})`);

    if (a.detached) {
      if (a.lineInSection !== null) {
        violations.push(`I5: detached row keeps lineInSection ${a.lineInSection}`);
      }
      continue;
    }

    // Live row (I4).
    if (a.sectionId === null) {
      violations.push(`I4: live row (value ${a.value}) has no sectionId`);
      continue;
    }
    const sec = byId.get(a.sectionId);
    if (!sec) {
      violations.push(`I4: live row points at missing section ${a.sectionId}`);
      continue;
    }
    if (sec.canonicalSectionId !== null) {
      // A live row must never sit on a linked section (it should be one hop up).
      violations.push(
        `I4: live row sits on linked section ${a.sectionId} (should be on its canonical)`,
      );
      continue;
    }
    const lines = linesOf(sec);
    if (a.lineInSection === null || a.lineInSection < 0 || a.lineInSection >= lines.length) {
      violations.push(
        `I4: live row lineInSection ${a.lineInSection} out of range [0,${lines.length}) in section ${a.sectionId}`,
      );
      continue;
    }
    const line = lines[a.lineInSection]!;
    const expected =
      a.startChar === null
        ? line.text
        : lyrics.slice(line.start + a.startChar, line.start + (a.endChar ?? 0));
    if (a.startChar !== null) {
      const ec = a.endChar ?? 0;
      if (a.startChar < 0 || ec > line.text.length || a.startChar >= ec) {
        violations.push(
          `I4: sub-line span [${a.startChar},${a.endChar}) outside line in section ${a.sectionId}`,
        );
        continue;
      }
    }
    if (a.quote !== expected) {
      violations.push(
        `I4: quote "${a.quote}" != addressed text "${expected}" in section ${a.sectionId} line ${a.lineInSection}`,
      );
    }
  }

  return violations;
}

/** Throw if `checkEntryIntegrity` finds any violation (used in tests + at runtime). */
export function assertEntryIntegrity(
  lyrics: string,
  sections: IntegritySection[],
  annotations: IntegrityAnnotation[],
): void {
  const violations = checkEntryIntegrity(lyrics, sections, annotations);
  if (violations.length > 0) {
    throw new Error(`Entry integrity violated:\n  - ${violations.join("\n  - ")}`);
  }
}
