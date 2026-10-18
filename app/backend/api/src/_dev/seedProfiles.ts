import { CORPUS } from "@rhymelab/fixtures";

/** A seedable piece. `file` names a hand-annotated source in `.dummy/`; `annotated` inlines one. */
export type SeedSource = {
  title: string;
  kind: "poem" | "song";
  authors?: string[];
  year?: number;
} & ({ annotated: string } | { file: string });

export const SEED_PROFILES = {
  baseline: [],
  default: CORPUS,
  demo: [
    ...CORPUS,
    { file: "DEMO_LongIsland.txt", title: "Long Island", kind: "song" },
    { file: "DEMO_RocketGirl.txt", title: "Rocket Girl", kind: "song" },
    { file: "DEMO_RoundHere.txt", title: "Round Here", kind: "song" },
    { file: "DEMO_TheDays.txt", title: "The Days", kind: "song" },
    {
      file: "DEMO_TheNightTheyDroveOldDixieDown.txt",
      title: "The Night They Drove Old Dixie Down",
      kind: "song",
    },
    {
      file: "DEMO_TheWasteLand.txt",
      title: "The Waste Land",
      kind: "poem",
      authors: ["T. S. Eliot"],
      year: 1922,
    },
  ],
} satisfies Record<string, readonly SeedSource[]>;

export type SeedProfile = keyof typeof SEED_PROFILES;

/**
 * The profile named by `--profile <name>` or `--profile=<name>` in `argv`.
 * Defaults to `default`.
 *
 * @throws {Error} When the named profile does not exist.
 */
export function profileFromArgv(argv: readonly string[]): SeedProfile {
  const index = argv.findIndex((arg) => arg === "--profile" || arg.startsWith("--profile="));
  if (index === -1) return "default";
  const arg = argv[index] ?? "";
  const name = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : (argv[index + 1] ?? "");
  if (!Object.hasOwn(SEED_PROFILES, name)) {
    throw new Error(
      `unknown seed profile "${name}"; expected one of ${Object.keys(SEED_PROFILES).join(", ")}`,
    );
  }
  return name as SeedProfile;
}

/** Whether `url` names a Postgres server on this machine. */
export function isLocalDatabaseUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return LOCAL_HOSTS.has(host);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
