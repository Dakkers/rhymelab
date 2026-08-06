/**
 * Applying a reconciler {@link ReconcilePlan} to Postgres, and the runtime
 * integrity assertion.
 *
 * The plan is pure data addressed by `ref`s (survivors carry their real id,
 * creations a negative ref). This module resolves refs → real ids against DB
 * inserts and lands the whole plan in ONE transaction, in the order the foreign
 * keys demand (all annotations move off a departing section before it is deleted;
 * canonical pointers are cleared before section churn and reset at the end). The
 * `(entry_id, order_index)` unique is DEFERRED first so survivors can be renumbered
 * without tripping it between statements (D-15). The reconciler never deletes an
 * annotation (invariant 2/4) — every existing row is updated in place; only copies
 * are inserted.
 */
import type { ReconcilePlan } from "@rhymelab/core";
import { assertEntryIntegrity as checkIntegrity } from "@rhymelab/core";
import type { Prisma } from "../_generated/prisma/client";

/**
 * Apply `plan`'s sections + annotations for `entryId` on the transaction client
 * `tx`. Does NOT touch the entry row (lyrics/version) — the caller owns that.
 */
export async function applyPlan(
  tx: Prisma.TransactionClient,
  entryId: number,
  plan: ReconcilePlan,
  now: Date,
): Promise<void> {
  // Defer the order_index uniqueness so survivors can be renumbered freely; it is
  // re-checked at COMMIT, by when the plan's orderIndexes are contiguous + unique.
  await tx.$executeRawUnsafe(`SET CONSTRAINTS "sections_entry_id_order_index_key" DEFERRED`);

  const refToId = new Map<number, number>();

  // 1. Clear every canonical pointer (reset at the end) so a departing canonical
  //    can be deleted and a pointer never references a not-yet-created creation.
  await tx.section.updateMany({ where: { entryId }, data: { canonicalSectionId: null } });

  // 2. Survivors: map ref → id, update offsets / orderIndex / manualUnlink.
  for (const s of plan.sections) {
    if (s.id === null) continue;
    refToId.set(s.ref, s.id);
    await tx.section.update({
      where: { id: s.id },
      data: {
        orderIndex: s.orderIndex,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
        manualUnlink: s.manualUnlink,
        updatedAt: now,
      },
    });
  }

  // 3. Creations: insert (pointer still null), capture the fresh ids.
  for (const s of plan.sections) {
    if (s.id !== null) continue;
    const created = await tx.section.create({
      data: {
        entryId,
        orderIndex: s.orderIndex,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
        manualUnlink: s.manualUnlink,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    refToId.set(s.ref, created.id);
  }

  // 4. Annotations: update every existing row in place (moved off any departing
  //    section already — the plan guarantees no row references a deleted section),
  //    insert the reconciler's copies. No deletes (invariant 2/4).
  for (const a of plan.annotations) {
    const sectionId = a.sectionRef === null ? null : (refToId.get(a.sectionRef) ?? null);
    if (a.id !== null) {
      await tx.annotation.update({
        where: { id: a.id },
        data: {
          sectionId,
          lineInSection: a.lineInSection,
          startChar: a.startChar,
          endChar: a.endChar,
          quote: a.quote,
          value: a.value,
          detached: a.detached,
          updatedAt: now,
        },
      });
    } else {
      await tx.annotation.create({
        data: {
          entryId,
          sectionId,
          lineInSection: a.lineInSection,
          startChar: a.startChar,
          endChar: a.endChar,
          quote: a.quote,
          value: a.value,
          detached: a.detached,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }

  // 5. Delete departed sections — nothing references them now (step 4 moved rows
  //    off, step 1 cleared pointers), so the Restrict FKs are satisfied.
  if (plan.deleteSectionIds.length) {
    await tx.section.deleteMany({ where: { id: { in: plan.deleteSectionIds } } });
  }

  // 6. Re-establish canonical pointers (targets all exist; never self — CHECK).
  for (const s of plan.sections) {
    if (s.canonicalRef === null) continue;
    await tx.section.update({
      where: { id: refToId.get(s.ref)! },
      data: { canonicalSectionId: refToId.get(s.canonicalRef)! },
    });
  }
}

/**
 * Read an entry's sections + annotations and assert the I1–I6 invariants
 * (§5.2) against its stored lyrics. Throws on any violation. Used after a save in
 * tests and as the deploy-time spot-check.
 */
export async function assertEntryIntegrity(
  db: Prisma.TransactionClient,
  entryId: number,
): Promise<void> {
  const entry = await db.entry.findUnique({ where: { id: entryId }, select: { lyrics: true } });
  if (!entry) return;
  const [sections, annotations] = await Promise.all([
    db.section.findMany({
      where: { entryId },
      select: {
        id: true,
        orderIndex: true,
        startOffset: true,
        endOffset: true,
        canonicalSectionId: true,
        manualUnlink: true,
      },
    }),
    db.annotation.findMany({
      where: { entryId },
      select: {
        sectionId: true,
        lineInSection: true,
        startChar: true,
        endChar: true,
        quote: true,
        value: true,
        detached: true,
      },
    }),
  ]);
  checkIntegrity(entry.lyrics, sections, annotations);
}
