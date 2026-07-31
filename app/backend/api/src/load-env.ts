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
 */
export function envFilePaths(): string[] {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  return [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`, ".env"];
}

/** Loads the env files into `process.env`. Call this before anything reads config. */
export function loadEnv(): void {
  config({ path: envFilePaths() });
}
