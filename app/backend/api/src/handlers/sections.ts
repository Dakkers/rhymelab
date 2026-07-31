/**
 * Section derivation + the one section mutation.
 *
 * `rederiveSections` is shared: the entry handlers call it on every lyrics
 * change to re-derive sections from the authoritative lyrics text, carrying an
 * existing section's type/label over to the same position.
 */
import {
  defaultSectionLabel,
  detectSections,
  guessSectionType,
  type SectionType,
} from "@rhymelab/core";
import { prisma } from "../db";
import { authed } from "../orpc";

/**
 * Replace an entry's sections to match `text`, carrying an existing section's
 * `type`/`label` over to the same position when one is there. Callers pass the
 * already-loaded previous rows so this stays a pure re-derivation.
 */
export async function rederiveSections(
  entryId: number,
  isPoem: boolean,
  text: string,
  previous: Array<{ orderIndex: number; type: SectionType; label: string }>,
  now: Date,
): Promise<void> {
  await prisma.section.deleteMany({ where: { entryId } });
  const detected = detectSections(text);
  if (detected.length === 0) return;

  const prevByIndex = new Map(previous.map((p) => [p.orderIndex, p]));
  const values = detected.map((s, i) => {
    const carried = prevByIndex.get(i);
    const type = carried?.type ?? guessSectionType(isPoem);
    const label = carried?.label ?? defaultSectionLabel(type, i + 1);
    return {
      entryId,
      orderIndex: s.orderIndex,
      type,
      label,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      createdAt: now,
      updatedAt: now,
    };
  });
  await prisma.section.createMany({ data: values });
}

export const updateSection = authed.entries.updateSection.handler(async ({ input }) => {
  await prisma.section.update({
    where: { id: input.id },
    data: { type: input.type, label: input.label, updatedAt: new Date() },
  });
  return { ok: true as const };
});
