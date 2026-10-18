/**
 * Checks that committed env files stay credential-free and cover every
 * variable the apps read. A committed dummy is fine; a committed real secret
 * is an incident.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { capture } from "./proc.mts";
import { API_ENV_FILE, parseDotenv, WEB_ENV_FILE } from "./env.mts";

export interface EnvFinding {
  file: string;
  key: string;
  problem: string;
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\b(sk|rk|pk)_live_[0-9A-Za-z]{8,}/, "live API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bgh[pousr]_[0-9A-Za-z]{30,}/, "GitHub token"],
  [/\bgithub_pat_[0-9A-Za-z_]{20,}/, "GitHub token"],
  [/\bxox[abposr]-[0-9A-Za-z-]{10,}/, "Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bnpg_[0-9A-Za-z]{8,}/, "Neon password"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\beyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/, "JWT"],
];

const DUMMY_MARKERS = /(dev|test|example|change-?me|insecure|dummy|placeholder|local|password)/i;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Problems with the values in one env file's text. */
export function findSecrets(file: string, text: string): EnvFinding[] {
  const findings: EnvFinding[] = [];
  for (const [key, value] of Object.entries(parseDotenv(text))) {
    const pattern = SECRET_PATTERNS.find(([regex]) => regex.test(value));
    if (pattern) {
      findings.push({ file, key, problem: `looks like a ${pattern[1]}` });
      continue;
    }
    const url = parseUrl(value);
    if (url?.password && !LOCAL_HOSTS.has(url.hostname)) {
      findings.push({ file, key, problem: `credentials for non-local host ${url.hostname}` });
      continue;
    }
    if (!url && value.length >= 24 && entropy(value) >= 4.3 && !DUMMY_MARKERS.test(value)) {
      findings.push({ file, key, problem: "high-entropy value with no dummy marker" });
    }
  }
  return findings;
}

/**
 * Variables the code reads that `declared` doesn't cover. `reads` maps each
 * variable to the files that read it.
 */
export function undeclaredReads(
  reads: Map<string, string[]>,
  declared: ReadonlySet<string>,
): EnvFinding[] {
  return [...reads]
    .filter(([key]) => !declared.has(key))
    .map(([key, files]) => ({
      file: files.join(", "),
      key,
      problem: "read by the code but missing from the committed defaults",
    }));
}

/** Run every check against the checkout at `root`. */
export function verifyEnv(root: string): EnvFinding[] {
  const listed = capture("git", ["ls-files", "--", "*.env*", ".env*"], { cwd: root });
  const files = listed.stdout.split("\n").filter((f) => /(^|\/)\.env/.test(f));
  const findings = files.flatMap((file) =>
    findSecrets(file, readFileSync(join(root, file), "utf8")),
  );

  const apiDeclared = new Set([
    ...Object.keys(parseDotenv(readFileSync(join(root, API_ENV_FILE), "utf8"))),
    "NODE_ENV",
  ]);
  const webDeclared = new Set([
    ...Object.keys(parseDotenv(readFileSync(join(root, WEB_ENV_FILE), "utf8"))),
    "DEV",
    "PROD",
    "MODE",
    "SSR",
    "BASE_URL",
    "VITE_KEEP_DOM",
  ]);
  findings.push(
    ...undeclaredReads(
      scanReads(
        root,
        ["app/backend/api/src", "packages/database"],
        /process\.env(?:\.|\[["'])([A-Z_][A-Z0-9_]*)/g,
      ),
      apiDeclared,
    ),
    ...undeclaredReads(
      scanReads(root, ["app/frontend/web/src"], /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g),
      webDeclared,
    ),
  );
  return findings;
}

function scanReads(root: string, dirs: string[], pattern: RegExp): Map<string, string[]> {
  const reads = new Map<string, string[]>();
  for (const dir of dirs) {
    for (const file of walk(join(root, dir))) {
      for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
        const key = match[1] ?? "";
        const rel = relative(root, file);
        const seen = reads.get(key) ?? [];
        if (!seen.includes(rel)) seen.push(rel);
        reads.set(key, seen);
      }
    }
  }
  return reads;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "_generated" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

function parseUrl(value: string): URL | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Shannon entropy in bits per character. */
export function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}
