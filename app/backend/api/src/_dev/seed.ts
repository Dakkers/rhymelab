import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLyricEntrySchema } from "@rhymelab/api-contract";
import { AnnotatedBodyError, parseAnnotatedBody } from "@rhymelab/fixtures";
import { loadEnv } from "../load-env";
import { TEMP_USER_ID } from "../app/session";
import { initializeOrms, type PrismaClient } from "@rhymelab/database";
import {
  isLocalDatabaseUrl,
  profileFromArgv,
  SEED_PROFILES,
  type SeedProfile,
  type SeedSource,
} from "./seedProfiles";

loadEnv();

let profile: SeedProfile;
try {
  profile = profileFromArgv(process.argv.slice(2));
} catch (err) {
  console.error((err as Error).message);
  process.exit(2);
}
if (!isLocalDatabaseUrl(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to seed: DATABASE_URL MUST point at a Postgres on localhost.");
  process.exit(1);
}
const SEEDS: readonly SeedSource[] = SEED_PROFILES[profile];

const { initializeDb } = await import("../app/initializeDb");
const db = initializeDb();
const { instantiateControllers } = await import("../app/instantiateControllers");
const orms = initializeOrms({ prisma: db, readonlyPrisma: db });
const ctrls = instantiateControllers({ db, ...orms });

async function main(db: PrismaClient) {
  console.log(`Seeding profile "${profile}"…`);
  await createTempUser(db);

  const existing = new Set(
    (
      await db.lyricEntry.findMany({
        where: { userId: TEMP_USER_ID, title: { in: SEEDS.map((s) => s.title) } },
        select: { title: true },
      })
    ).map((e) => e.title),
  );

  let skipped = 0;
  let missing = 0;
  let invalid = 0;

  await db.$transaction(
    async (tx) => {
      for (const seed of SEEDS) {
        if (existing.has(seed.title)) {
          console.log(`• ${seed.title} — already present, skipping`);
          skipped++;
          continue;
        }

        const raw = "annotated" in seed ? seed.annotated : readSeedFile(seed.file);
        if (raw === null) {
          console.warn(`• ${seed.title} — no source file in .dummy/, skipping`);
          missing++;
          continue;
        }

        let parsed;
        try {
          parsed = parseAnnotatedBody(raw);
        } catch (err) {
          if (!(err instanceof AnnotatedBodyError)) throw err;
          console.error(`✗ ${seed.title}: ${err.message}. Skipping.`);
          invalid++;
          continue;
        }
        const { body, structure, annotations } = parsed;

        const input = createLyricEntrySchema.parse({
          kind: seed.kind,
          title: seed.title,
          authors: seed.authors ?? [],
          artists: [],
          year: seed.year,
          body,
        });
        const createResult = await ctrls.LyricEntryController.create(
          { ...input, userId: TEMP_USER_ID },
          tx,
        );

        await ctrls.LyricEntryController.updateStructure(createResult.id, structure, tx);

        await tx.lineAnnotation.createMany({
          data: annotations.map((annotation) => ({ entryId: createResult.id, ...annotation })),
        });
      }
    },
    { timeout: 30_000 },
  );

  console.log(
    `\nSeed complete: ${SEEDS.length - skipped - missing - invalid} created, ${skipped} skipped, ` +
      `${missing} missing, ${invalid} invalid.`,
  );

  if (missing > 0) {
    console.log(
      `Missing demo files belong in ${DUMMY_DIR}. Drop the DEMO_*.txt files there and re-run.`,
    );
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
        displayName: "Sandbox",
        id: TEMP_USER_ID,
        email: "sandbox@rhymelab.test",
        passwordHash: "1234",
      },
    });
  }
}

/** Read a seed's annotated source file, or return null if it is absent. */
function readSeedFile(file: string): string | null {
  try {
    return readFileSync(resolve(DUMMY_DIR, file), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

const DUMMY_DIR = resolve(import.meta.dirname, "../../../../../.dummy");

// -- Run

try {
  await main(db);
} catch (err) {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
}
