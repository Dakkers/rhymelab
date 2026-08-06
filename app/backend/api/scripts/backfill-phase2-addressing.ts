/**
 * Phase 2 backfill (§5.6 step 2): re-address every annotation from its absolute
 * `[start_offset, end_offset)` to the durable `(section_id, line_in_section,
 * start_char, end_char)` addressing. Runs AFTER the EXPAND migration (new columns
 * present, old columns still present) and BEFORE the CONTRACT migration (which
 * drops the old columns). All offset/line math is in JS (invariant 5).
 *
 * Per annotation (impl §5.6):
 *   - live & line-exact              → (sectionId, lineInSection, NULL, NULL)
 *   - live & sub-line within one line → (sectionId, lineInSection, startChar, endChar) — never widen
 *   - live & anything else            → treated as detached (below)
 *   - detached                        → reanchor(quote, start_offset, lyrics) once
 *       (offsets still exist): line-exact → whole-line; within-one-line → sub-line;
 *       else ORPHAN (section_id NULL, line_in_section NULL, detached = true, keep quote).
 *
 * SAFETY: dry-run by default (reports, rolls back); pass `--apply` to commit. Never
 * hard-deletes (invariant 4). The old columns are read via raw SQL because the
 * generated Prisma client no longer maps them.
 *
 * RUN (from app/backend/api):
 *   pnpm exec tsx scripts/backfill-phase2-addressing.ts            # dry-run
 *   pnpm exec tsx scripts/backfill-phase2-addressing.ts --apply    # commit
 */
import type { Prisma } from "../src/_generated/prisma/client";
import { loadEnv } from "../src/load-env";

loadEnv();

// db.ts reads DATABASE_URL at module-init, so import it only after loadEnv().
const { prisma } = await import("../src/db");
const { detectSections, parseLines, reanchor } = await import("@rhymelab/core");

const APPLY = process.argv.includes("--apply");

/** An annotation row read with the (about-to-be-dropped) absolute-offset columns. */
interface LegacyAnnotation {
  id: number;
  start_offset: number;
  end_offset: number;
  quote: string;
  detached: boolean;
}

/** The resolved Phase 2 addressing, or a decision to orphan the row. */
interface Address {
  sectionId: number | null;
  lineInSection: number | null;
  startChar: number | null;
  endChar: number | null;
  detached: boolean;
}

const ORPHAN: Address = {
  sectionId: null,
  lineInSection: null,
  startChar: null,
  endChar: null,
  detached: true,
};

interface DbSection {
  id: number;
  start_offset: number;
  end_offset: number;
}

/**
 * Address a `[start, end)` span against the entry's sections + lines: the section
 * that contains it, and the non-blank line within it. Returns an attached Address
 * when the span sits within a single non-blank line (whole-line ⇒ chars NULL,
 * sub-line ⇒ chars set), else null (spans lines / crosses sections / blank).
 */
function addressOf(
  lyrics: string,
  sections: DbSection[],
  start: number,
  end: number,
): Address | null {
  const lines = parseLines(lyrics);
  for (const sec of sections) {
    if (start < sec.start_offset || end > sec.end_offset) continue;
    const secLines = lines.filter(
      (l) => !l.blank && l.start >= sec.start_offset && l.end <= sec.end_offset,
    );
    for (let li = 0; li < secLines.length; li++) {
      const line = secLines[li]!;
      if (start >= line.start && end <= line.end) {
        const whole = start === line.start && end === line.end;
        return {
          sectionId: sec.id,
          lineInSection: li,
          startChar: whole ? null : start - line.start,
          endChar: whole ? null : end - line.start,
          detached: false,
        };
      }
    }
  }
  return null;
}

/** The Phase 2 address for one annotation (live direct, else a final reanchor). */
function resolveAddress(lyrics: string, sections: DbSection[], a: LegacyAnnotation): Address {
  if (!a.detached) {
    const direct = addressOf(lyrics, sections, a.start_offset, a.end_offset);
    if (direct) return direct;
  }
  // Detached, or a live row that no longer sits on a single line: one final reanchor.
  const re = reanchor(a.quote, a.start_offset, lyrics);
  if (re.detached) return ORPHAN;
  return addressOf(lyrics, sections, re.startOffset, re.endOffset) ?? ORPHAN;
}

interface EntryReport {
  entryId: number;
  wholeLine: number;
  subLine: number;
  reattached: number;
  orphaned: number;
}

async function backfillEntry(
  entryId: number,
  lyrics: string,
  sections: DbSection[],
): Promise<EntryReport> {
  const report: EntryReport = { entryId, wholeLine: 0, subLine: 0, reattached: 0, orphaned: 0 };
  const now = new Date();

  const run = async (db: Prisma.TransactionClient): Promise<void> => {
    const anns = await db.$queryRaw<LegacyAnnotation[]>`
      SELECT id, start_offset, end_offset, quote, detached
      FROM annotations WHERE entry_id = ${entryId} ORDER BY id ASC`;

    for (const a of anns) {
      const addr = resolveAddress(lyrics, sections, a);
      if (addr.sectionId === null) report.orphaned++;
      else if (a.detached) report.reattached++;
      else if (addr.startChar === null) report.wholeLine++;
      else report.subLine++;

      if (APPLY) {
        await db.annotation.update({
          where: { id: a.id },
          data: {
            sectionId: addr.sectionId,
            lineInSection: addr.lineInSection,
            startChar: addr.startChar,
            endChar: addr.endChar,
            detached: addr.detached,
            updatedAt: now,
          },
        });
      }
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

/** Verify the DB sections mirror detectSections(lyrics) — Phase 1 kept them in sync. */
function assertSectionsMatch(entryId: number, lyrics: string, sections: DbSection[]): void {
  const detected = detectSections(lyrics);
  const bad =
    detected.length !== sections.length ||
    detected.some((d) => {
      const s = sections.find(
        (x) => x.start_offset === d.startOffset && x.end_offset === d.endOffset,
      );
      return !s;
    });
  if (bad) {
    throw new Error(
      `entry ${entryId}: DB sections do not mirror detectSections(lyrics) — re-derive them before backfilling`,
    );
  }
}

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "PHASE 2 ADDRESSING BACKFILL — APPLY (committing)"
      : "PHASE 2 ADDRESSING BACKFILL — dry-run (no writes; pass --apply to commit)",
  );

  const entries = await prisma.entry.findMany({
    where: { deletedAt: null },
    select: { id: true, lyrics: true },
    orderBy: { id: "asc" },
  });

  let totalOrphaned = 0;
  for (const e of entries) {
    const sections = await prisma.$queryRaw<DbSection[]>`
      SELECT id, start_offset, end_offset FROM sections WHERE entry_id = ${e.id} ORDER BY order_index ASC`;
    assertSectionsMatch(e.id, e.lyrics, sections);
    const r = await backfillEntry(e.id, e.lyrics, sections);
    totalOrphaned += r.orphaned;
    console.log(
      `  entry ${r.entryId}: wholeLine=${r.wholeLine} subLine=${r.subLine} reattached=${r.reattached} orphaned=${r.orphaned}`,
    );
  }

  console.log(`\nDone. ${entries.length} entries processed. Total orphaned: ${totalOrphaned}.`);
  if (!APPLY) console.log("Dry-run only — re-run with --apply to commit.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
