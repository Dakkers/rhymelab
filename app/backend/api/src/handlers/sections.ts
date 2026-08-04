/**
 * Section derivation.
 *
 * `rederiveSections` is shared: the entry handlers call it on every lyrics
 * change to re-derive sections from the authoritative lyrics text. Sections are
 * untyped and labelled positionally ("Section 1", "Section 2", …), so a
 * re-derivation is a pure function of the text — nothing is carried over.
 */
import { defaultSectionLabel, detectSections } from "@rhymelab/core";
import type { Prisma } from "../_generated/prisma/client";

/**
 * Replace an entry's sections to match `text`. Each blank-line-delimited block
 * becomes one positionally-labelled section. Runs against the caller's `db` —
 * always a transaction client, since a lyrics change must re-derive sections and
 * re-anchor annotations atomically (invariant 3: every multi-row mutation is one
 * transaction under the entry lock).
 */
export async function rederiveSections(
  db: Prisma.TransactionClient,
  entryId: number,
  text: string,
  now: Date,
): Promise<void> {
  await db.section.deleteMany({ where: { entryId } });
  const detected = detectSections(text);
  if (detected.length === 0) return;

  const values = detected.map((s, i) => ({
    entryId,
    orderIndex: s.orderIndex,
    label: defaultSectionLabel(i + 1),
    startOffset: s.startOffset,
    endOffset: s.endOffset,
    createdAt: now,
    updatedAt: now,
  }));
  await db.section.createMany({ data: values });
}
