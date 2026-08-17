import { config } from "dotenv";

/**
 * Ordered list of env files to load, most specific first.
 *
 * NODE_ENV drives which environment's files are used (defaults to
 * "development"). Secrets live in the gitignored `.env.<env>.local` files;
 * committed `.env.<env>` and `.env` hold non-secret defaults.
 *
 * Precedence matches dotenv semantics: variables already present in the
 * environment are never overwritten, so the earlier a file appears here, the
 * higher its priority.
 *
 * The files live in `.config/` alongside the other tooling config, matching
 * where the web app keeps its own (`envDir: ".config"`). Paths are relative to
 * the process cwd, which is this package's root for every entry point that
 * calls this — `pnpm dev`/`start`, the Prisma CLI via `prisma.config.ts`, and
 * Vitest.
 */
export function envFilePaths(): string[] {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  return [`.config/.env.${nodeEnv}.local`, `.config/.env.${nodeEnv}`, ".config/.env"];
}

/** Loads the env files into `process.env`. Call this before anything reads config. */
export function loadEnv(): void {
  config({ path: envFilePaths() });
}
