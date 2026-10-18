import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";
import { loadEnv } from "../load-env";

/**
 * Create a throwaway database on the `DATABASE_URL` server, migrate it, and
 * provide its URL to the integration tests. The database is dropped on teardown.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  loadEnv();
  const serverUrl = process.env.DATABASE_URL;
  if (!serverUrl)
    throw new Error("DATABASE_URL MUST name a Postgres server for integration tests.");

  const name = `rhymelab_itest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const databaseUrl = withDatabase(serverUrl, name);

  const { initializeDb } = await import("../app/initializeDb");
  process.env.DATABASE_URL = withDatabase(serverUrl, "postgres");
  const admin = initializeDb();
  process.env.DATABASE_URL = databaseUrl;

  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } catch (err) {
    await admin.$disconnect();
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot create a test database. Is local Postgres running? ${cause}`);
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: resolve(import.meta.dirname, "../../../../../packages/database"),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "ignore",
  });

  project.provide("databaseUrl", databaseUrl);

  return async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
