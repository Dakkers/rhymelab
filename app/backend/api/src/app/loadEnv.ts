import { config } from "dotenv";

export function loadEnv(): void {
  config({ path: envFilePaths() });
}

export function envFilePaths(): string[] {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  return [`.config/.env.${nodeEnv}.local`, `.config/.env.${nodeEnv}`, ".config/.env"];
}
