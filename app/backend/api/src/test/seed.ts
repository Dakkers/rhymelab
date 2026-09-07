import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeEntryBody, splitSections, type SectionType } from "@rhymelab/api-contract";
import { loadEnv } from "../load-env";
import { TEMP_USER_ID } from "../app/session";
import type { PrismaClient } from "@rhymelab/database";

loadEnv();

const { initializeDb } = await import("./../app/initializeDb");
const db = initializeDb();

try {
  await main(db);
} catch (err) {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
}

async function main(db: PrismaClient) {
  await createTempUser(db);

  const existing = new Set(
    (
      await db.lyricEntry.findMany({
        where: { userId: TEMP_USER_ID, title: { in: SEEDS.map((s) => s.title) } },
        select: { title: true },
      })
    ).map((e) => e.title),
  );

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
      userId: TEMP_USER_ID,
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

  await db.$transaction(
    toCreate.map((data) => {
      console.log(`✓ ${data.title} (${data.kind}) — ${data.structure.length} sections`);
      return db.lyricEntry.create({ data });
    }),
  );

  console.log(
    `\nSeed complete: ${toCreate.length} created, ${skipped} skipped, ` +
      `${missing} missing, ${invalid} invalid.`,
  );
  if (missing === SEEDS.length) {
    console.log(`No demo files found in ${DUMMY_DIR}. Drop the DEMO_*.txt files there and re-run.`);
  }

  await db.$disconnect();
  if (invalid > 0) process.exit(1);
}

async function createTempUser(db: PrismaClient) {
  if (
    !(await db.user.findUnique({
      where: { id: TEMP_USER_ID },
    }))
  ) {
    await db.user.create({
      data: {
        displayName: "Dak",
        id: TEMP_USER_ID,
        email: "d.h.stlaurent@gmail.com",
        passwordHash: "1234",
      },
    });
  }
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

function stripSectionHeaders(raw: string): string {
  return raw
    .split("\n")
    .map((line) => (/^\s*\[[^\]]*\]\s*$/.test(line) ? "" : line))
    .join("\n");
}

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

const DUMMY_DIR = resolve(import.meta.dirname, "../../../../.dummy");

type Seed = {
  /** Untracked source file under `.dummy/`, e.g. `DEMO_RoundHere.txt`. */
  file: string;
  title: string;
  kind: "poem" | "lyrics";
  author?: string[];
  artist?: string[];
  album?: string;
  year?: number;
  structure: SectionType[];
};

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
