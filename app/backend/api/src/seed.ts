/**
 * Demo data seeder — `pnpm db:seed` (run from the repo root, or
 * `pnpm --filter @rhymelab/api db:seed`).
 *
 * Loads a handful of songs/poems into the current `DATABASE_URL`'s `entries`
 * table so a fresh database has something to look at. It's a convenience for
 * local development and demos, never part of the app or a migration.
 *
 * ## Where the text comes from — and why it isn't in this file
 *
 * The lyric/poem bodies are read at runtime from `<repo>/.dummy/DEMO_*.txt`,
 * which are **untracked** (only `.dummy/.gitkeep` is committed). That's
 * deliberate: those texts are third-party copyrighted works, so they stay out of
 * the repository. What's committed here is just the *runner* plus each piece's
 * non-copyrightable metadata — its title, kind, and section labels. Drop the
 * matching `DEMO_*.txt` files into `.dummy/` to seed them; a piece whose file is
 * absent is skipped with a note (so this still runs cleanly on a fresh clone or
 * in CI, it just seeds whatever is present).
 *
 * ## What it does to each body
 *
 * A source file may carry `[Verse]` / `[Chorus]`-style section headers inline.
 * Those are stripped out of the stored `body` and captured instead in the
 * `structure` column — one {@link SectionType} label per section — which is
 * exactly what the column is for. Every body is run through the contract's
 * `normalizeEntryBody`, and the label count is asserted against
 * `splitSections(body).length` before the write, so the
 * `structure.length === section count` invariant holds from the first insert.
 *
 * ## Idempotency
 *
 * Safe to re-run: a piece whose title already exists for the seed user is skipped
 * rather than duplicated. The check counts tombstoned (soft-deleted) rows too, so
 * re-seeding after deleting a demo piece in the app doesn't resurrect it as a
 * second *live* copy alongside the tombstone. To reseed from scratch, wipe the
 * database first (`./rhymelab-sandbox reset`, or drop the rows) and run again.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeEntryBody, splitSections, type SectionType } from "@rhymelab/api-contract";
import { loadEnv } from "./load-env";
import { SINGLE_USER_ID } from "./session";

// `./db` reads DATABASE_URL at module load, so the environment has to be
// populated before it's imported — hence the dynamic import below, after this.
loadEnv();

/** A piece to seed. The body text lives in `<repo>/.dummy/<file>`, not here. */
type Seed = {
  /** Untracked source file under `.dummy/`, e.g. `DEMO_RoundHere.txt`. */
  file: string;
  title: string;
  kind: "poem" | "lyrics";
  author?: string[];
  artist?: string[];
  album?: string;
  year?: number;
  /**
   * One label per body section, in order — asserted against the parsed body's
   * section count at seed time, so a mislabelled entry fails loudly here rather
   * than writing a `structure` that's out of step with its `body`.
   */
  structure: SectionType[];
};

const SEEDS: Seed[] = [
  {
    file: "DEMO_LongIsland.txt",
    title: "Long Island",
    kind: "lyrics",
    structure: ["verse", "prechorus", "chorus", "verse", "prechorus", "chorus", "bridge", "chorus"],
  },
  {
    file: "DEMO_RocketGirl.txt",
    title: "Rocket Girl",
    kind: "lyrics",
    structure: ["verse", "chorus", "verse", "chorus", "outro"],
  },
  {
    file: "DEMO_RoundHere.txt",
    title: "Round Here",
    kind: "lyrics",
    structure: ["verse", "chorus", "verse", "chorus", "bridge", "verse", "chorus", "outro"],
  },
  {
    file: "DEMO_TheDays.txt",
    title: "The Days",
    kind: "lyrics",
    structure: ["verse", "prechorus", "chorus", "verse", "prechorus", "chorus", "outro"],
  },
  {
    file: "DEMO_TheNightTheyDroveOldDixieDown.txt",
    title: "The Night They Drove Old Dixie Down",
    kind: "lyrics",
    structure: ["verse", "chorus", "verse", "chorus", "verse", "chorus"],
  },
  {
    file: "DEMO_TheWasteLand.txt",
    title: "The Waste Land",
    kind: "poem",
    author: ["T. S. Eliot"],
    year: 1922,
    structure: ["verse"],
  },
];

/** `<repo>/.dummy` — this file is `<repo>/app/backend/api/src/seed.ts`. */
const DUMMY_DIR = resolve(import.meta.dirname, "../../../../.dummy");

/**
 * Blank out any line that is only a bracketed section header, e.g. `[Chorus]`.
 *
 * The header is replaced with a blank line rather than deleted, so it still
 * *separates* the sections around it. Deleting it would rely on a blank line
 * already being present: a header-delimited file with no blank lines
 * (`[Verse]\na\n[Chorus]\nb`) would otherwise collapse into a single section and
 * fail the count check below. `normalizeEntryBody` then collapses any doubled
 * blank (a header that already had a blank line beside it) back to one.
 */
function stripSectionHeaders(raw: string): string {
  return raw
    .split("\n")
    .map((line) => (/^\s*\[[^\]]*\]\s*$/.test(line) ? "" : line))
    .join("\n");
}

/** Read and clean a seed's body, or return null if its source file is absent. */
function readBody(file: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(resolve(DUMMY_DIR, file), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return normalizeEntryBody(stripSectionHeaders(raw));
}

/** The Prisma `entry.create` payload a validated seed turns into. */
type EntryCreateData = {
  userId: string;
  kind: string;
  title: string;
  author: string[];
  year?: number;
  body: string;
  structure: SectionType[];
  artist: string[];
  album?: string;
};

async function main() {
  const { prisma } = await import("./db");

  // Skip pieces already seeded (by title) for the single user, so re-runs don't
  // duplicate. Tombstoned rows count too (no `deletedAt` filter): a soft-deleted
  // demo piece stays "already seeded" rather than coming back as a live dup.
  // One query up front rather than a lookup per piece.
  const existing = new Set(
    (
      await prisma.entry.findMany({
        where: { userId: SINGLE_USER_ID, title: { in: SEEDS.map((s) => s.title) } },
        select: { title: true },
      })
    ).map((e) => e.title),
  );

  // Validate every piece *before* writing anything: a bad piece (missing file or
  // a label count that doesn't match its body) is reported and skipped, never
  // aborting the run or leaving a partial seed. The survivors are created
  // together in one transaction below, so the seed is all-or-nothing.
  const toCreate: EntryCreateData[] = [];
  let skipped = 0;
  let missing = 0;
  let invalid = 0;

  for (const seed of SEEDS) {
    if (existing.has(seed.title)) {
      console.log(`• ${seed.title} — already present, skipping`);
      skipped++;
      continue;
    }

    const body = readBody(seed.file);
    if (body === null) {
      console.warn(`• ${seed.title} — no .dummy/${seed.file}, skipping`);
      missing++;
      continue;
    }

    const sections = splitSections(body);
    if (sections.length !== seed.structure.length) {
      console.error(
        `✗ ${seed.title} — body of .dummy/${seed.file} has ${sections.length} sections but ` +
          `${seed.structure.length} labels (${seed.structure.join(", ")}); fix the label list ` +
          `in seed.ts to match. Skipping.`,
      );
      invalid++;
      continue;
    }

    toCreate.push({
      userId: SINGLE_USER_ID,
      kind: seed.kind,
      title: seed.title,
      author: seed.author ?? [],
      year: seed.year,
      body,
      structure: seed.structure,
      artist: seed.artist ?? [],
      album: seed.album,
    });
  }

  await prisma.$transaction(
    toCreate.map((data) => {
      console.log(`✓ ${data.title} (${data.kind}) — ${data.structure.length} sections`);
      return prisma.entry.create({ data });
    }),
  );

  console.log(
    `\nSeed complete: ${toCreate.length} created, ${skipped} skipped, ` +
      `${missing} missing, ${invalid} invalid.`,
  );
  if (missing === SEEDS.length) {
    console.log(`No demo files found in ${DUMMY_DIR}. Drop the DEMO_*.txt files there and re-run.`);
  }

  await prisma.$disconnect();
  // A mislabeled piece is a real misconfiguration — surface it in the exit code
  // (after seeding everything valid) so a caller or CI notices.
  if (invalid > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  const { prisma } = await import("./db");
  await prisma.$disconnect();
  process.exit(1);
});
