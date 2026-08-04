/**
 * Phase 1 data script (Migration A's "Script B"). Run ONCE, AFTER
 * `migrate deploy` applies 20260804180000_annotation_semantics_v2.
 *
 * Phase 1's write ops only ever produce whole-line rows, but the table may still
 * hold live rows whose span is NOT exactly one non-blank line — legacy word- or
 * cross-section spans from before the app went line-only, possibly relocated by
 * `reanchor`. Migration A deliberately does NOT delete them (they carry a real
 * value + quote and may be user data, invariant 4 / D-20). This pass DETACHES
 * them (kept, off the text, offsets + quote preserved) so the line UI is clean.
 *
 * SAFETY: dry-run by default; `--apply` to commit. Idempotent (a second run finds
 * nothing new to detach). Never deletes.
 *
 * RUN (from app/backend/api, after the migration):
 *   pnpm exec tsx scripts/detach-nonline-annotations.ts            # dry-run
 *   pnpm exec tsx scripts/detach-nonline-annotations.ts --apply    # commit
 */
import type { Prisma } from "../src/_generated/prisma/client";
import { loadEnv } from "../src/load-env";

loadEnv();

const { prisma } = await import("../src/db");
const { isLineSpan } = await import("@rhymelab/core");

const APPLY = process.argv.includes("--apply");

type DbClient = Prisma.TransactionClient;

async function detachForEntry(entryId: number, lyrics: string): Promise<number> {
  let detached = 0;

  const run = async (db: DbClient): Promise<void> => {
    const now = new Date();
    const anns = await db.annotation.findMany({ where: { entryId, detached: false } });
    for (const a of anns) {
      if (isLineSpan(lyrics, a.startOffset, a.endOffset)) continue; // whole-line — keep
      detached++;
      if (APPLY) {
        // Keep offsets + quote; just mark it off the text (invariant 4).
        await db.annotation.update({
          where: { id: a.id },
          data: { detached: true, updatedAt: now },
        });
      }
    }
  };

  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM entries WHERE id = ${entryId} AND deleted_at IS NULL FOR UPDATE`;
      await run(tx);
    });
  } else {
    await run(prisma);
  }

  return detached;
}

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "DETACH NON-LINE ANNOTATIONS — APPLY (committing)"
      : "DETACH NON-LINE ANNOTATIONS — dry-run (no writes; pass --apply to commit)",
  );

  const entries = await prisma.entry.findMany({
    where: { deletedAt: null },
    select: { id: true, lyrics: true },
    orderBy: { id: "asc" },
  });

  let total = 0;
  for (const e of entries) {
    const n = await detachForEntry(e.id, e.lyrics);
    total += n;
    if (n > 0)
      console.log(`  entry ${e.id}: ${n} non-line row(s) ${APPLY ? "detached" : "would detach"}`);
  }

  console.log(
    `\nDone. ${total} row(s) ${APPLY ? "detached" : "would detach"} across ${entries.length} entries.`,
  );
  if (!APPLY && total > 0) console.log("Dry-run only — re-run with --apply to commit.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
