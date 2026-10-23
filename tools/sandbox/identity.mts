/**
 * The worktree's sandbox identity: its slug, isolated database, preferred
 * ports, and where its runtime state lives. Everything is derived from the
 * checkout's directory name, so the same worktree always maps to the same
 * database and ports.
 */
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dirname, "../..");

export const PG = {
  host: "localhost",
  port: 5433,
  user: "rhymelab",
  password: "rhymelab",
  container: "rhymelab-postgres",
  composeProject: "rhymelab",
  composeService: "postgres",
} as const;

export const DEFAULT_DB = "rhymelab";

export interface Identity {
  root: string;
  slug: string;
  db: string;
  dbUrl: string;
  webBase: number;
  apiBase: number;
  stateDir: string;
  credentialsFile: string;
}

/** The identity of the checkout at `root`. */
export function identityFor(root: string = REPO_ROOT): Identity {
  const slug = slugify(basename(root));
  const db = databaseName(slug);
  const offset = stableHash(slug) % 50;
  return {
    root,
    slug,
    db,
    dbUrl: databaseUrl(db),
    webBase: 3000 + offset,
    apiBase: 4000 + offset,
    stateDir: resolve(tmpdir(), "rhymelab-sandbox", slug),
    credentialsFile: resolve(root, ".sandbox-credentials.json"),
  };
}

/** Lowercase `name` and fold every run of non-alphanumerics to one `_`. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * The isolated database for `slug`. The primary checkout keeps the shared
 * default. The result MUST fit Postgres's 63-character identifier limit and
 * MUST stay unique when truncated.
 */
export function databaseName(slug: string): string {
  const name =
    slug === DEFAULT_DB ? DEFAULT_DB : slug.startsWith("rhymelab_") ? slug : `rhymelab_${slug}`;
  if (name.length <= 63) return name;
  const hash = String(stableHash(name));
  return `${name.slice(0, 62 - hash.length)}_${hash}`;
}

/** A connection URL for `db` on the sandbox Postgres server. */
export function databaseUrl(db: string): string {
  return `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${db}`;
}

/** A stable unsigned 32-bit hash. Not cryptographic. */
export function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}
