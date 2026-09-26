import { config } from "dotenv";

/** Load env files into `process.env`. MUST run before anything reads config. */
export function loadEnv(): void {
  config({ path: envFilePaths() });
}

/**
 * The env files for the current `NODE_ENV`, highest priority first. Paths are
 * relative to the cwd, which MUST be this package's root.
 *
 * Existing variables are never overwritten. Secrets belong in the gitignored
 * `.env.<env>.local`.
 */
export function envFilePaths(): string[] {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  return [`.config/.env.${nodeEnv}.local`, `.config/.env.${nodeEnv}`, ".config/.env"];
}
