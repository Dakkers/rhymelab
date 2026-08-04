/**
 * One-off renormalization backfill (Phase 0.2 of the annotation/section redesign).
 *
 * WHY: `normalizeText` gained NFC composition + exotic-space folding (Phase 0.1).
 * Lyrics stored *before* that may hold NFD/NBSP bytes. Without this backfill, the
 * NEXT ordinary save of such an entry renormalizes the text while the stored
 * `quote`s keep their old bytes — `reanchor` then misses and annotations silently
 * detach. This pass renormalizes every entry up front and re-establishes the
 * invariant that each attached annotation's `quote` is a byte-exact slice of the
 * stored (normalized) lyrics, so a later save's fast path matches and nothing
 * detaches spuriously.
 *
 * SAFETY: dry-run by default — it reports what WOULD change and rolls back. Pass
 * `--apply` to commit. Entries whose text is already normalized are skipped, so a
 * second run (after --apply) is an all-skips no-op (idempotent). Never
 * hard-deletes; a quote that can't be re-found is *detached* (kept, offsets +
 * quote preserved), per invariant 4.
 *
 * RUN (from app/backend/api):
 *   pnpm exec tsx scripts/renormalize-backfill.ts            # dry-run
 *   pnpm exec tsx scripts/renormalize-backfill.ts --apply    # commit
 *
 * Expect ZERO detachments on ASCII-only data (those entries normalize to
 * themselves and are skipped entirely).
 */
import type { Prisma } from "../src/_generated/prisma/client";
import { loadEnv } from "../src/load-env";

loadEnv();

/** Either the base client (dry-run reads) or a locked transaction client (--apply). */
type DbClient = Prisma.TransactionClient;

// db.ts reads DATABASE_URL at module-init, so import it only after loadEnv().
const { prisma } = await import("../src/db");
const { normalizeText, reanchor } = await import("@rhymelab/core");
const { rederiveSections } = await import("../src/handlers/sections");

const APPLY = process.argv.includes("--apply");

/**
 * The character-level transforms `normalizeText` applies to the whole text —
 * NFC composition, exotic-space folding, and newline unification — but WITHOUT
 * its line-level trailing-strip / blank-collapse. Applied to a stored `quote`,
 * it yields exactly the bytes that quote's characters now have in the normalized
 * lyrics, so re-anchoring an old (NFD/NBSP) quote against new text still matches.
 * Kept in lockstep with `normalizeText` in `packages/core/src/lyrics.ts`.
 */
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NEWLINES = /\r\n?|\u2028|\u2029|\u0085/g;
function foldToMatch(quote: string): string {
  return quote.normalize("NFC").replace(UNICODE_SPACES, " ").replace(NEWLINES, "\n");
}

interface EntryReport {
  entryId: number;
  reattached: number;
  quotesRefreshed: number;
  newlyDetached: number;
}

async function backfillEntry(entryId: number, next: string): Promise<EntryReport> {
  const report: EntryReport = { entryId, reattached: 0, quotesRefreshed: 0, newlyDetached: 0 };
  const now = new Date();

  // Computes the report from reads and, when APPLY, writes the changes. `db` is
  // the base client on a dry-run (read-only) or the locked tx client on --apply.
  const run = async (db: DbClient): Promise<void> => {
    const anns = await db.annotation.findMany({ where: { entryId, deletedAt: null } });
    for (const a of anns) {
      const res = reanchor(foldToMatch(a.quote), a.startOffset, next);
      if (res.detached) {
        if (!a.detached) report.newlyDetached++;
        if (APPLY) {
          await db.annotation.update({
            where: { id: a.id },
            data: {
              startOffset: res.startOffset,
              endOffset: res.endOffset,
              detached: true,
              updatedAt: now,
            },
          });
        }
      } else {
        // Re-slice the quote from the normalized text so it is byte-exact again.
        const quote = next.slice(res.startOffset, res.endOffset);
        if (a.detached) report.reattached++;
        if (quote !== a.quote) report.quotesRefreshed++;
        if (APPLY) {
          await db.annotation.update({
            where: { id: a.id },
            data: {
              startOffset: res.startOffset,
              endOffset: res.endOffset,
              quote,
              detached: false,
              updatedAt: now,
            },
          });
        }
      }
    }

    if (APPLY) {
      await rederiveSections(db, entryId, next, now);
      await db.entry.update({ where: { id: entryId }, data: { lyrics: next, updatedAt: now } });
    }
  };

  if (APPLY) {
    // Same lock + JS-offset discipline as saveLyrics (invariants 3 & 5).
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM entries WHERE id = ${entryId} AND deleted_at IS NULL FOR UPDATE`;
      await run(tx);
    });
  } else {
    await run(prisma);
  }

  return report;
}

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "RENORMALIZE BACKFILL — APPLY (committing)"
      : "RENORMALIZE BACKFILL — dry-run (no writes; pass --apply to commit)",
  );

  const entries = await prisma.entry.findMany({
    where: { deletedAt: null },
    select: { id: true, lyrics: true },
    orderBy: { id: "asc" },
  });

  let changed = 0;
  let skipped = 0;
  let totalDetached = 0;

  for (const e of entries) {
    const next = normalizeText(e.lyrics);
    if (next === e.lyrics) {
      skipped++;
      continue;
    }
    changed++;
    const r = await backfillEntry(e.id, next);
    totalDetached += r.newlyDetached;
    console.log(
      `  entry ${e.id}: reattached=${r.reattached} quotesRefreshed=${r.quotesRefreshed} newlyDetached=${r.newlyDetached}`,
    );
  }

  console.log(
    `\nDone. entries: ${entries.length} total, ${changed} needed renormalization, ${skipped} already-normalized (skipped).`,
  );
  console.log(
    `Total newly-detached annotations: ${totalDetached}` +
      (totalDetached === 0 ? " (expected on ASCII-only data)" : " — inspect these entries."),
  );
  if (!APPLY && changed > 0) console.log("Dry-run only — re-run with --apply to commit.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
