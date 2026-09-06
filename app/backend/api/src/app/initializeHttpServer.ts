import { initializeOrms } from "@rhymelab/database";
import { buildServer } from "./buildServer";
import { initializeDb } from "./initializeDb";

export async function initializeHttpServer(opts?: { host: string; port?: number | string }) {
  const db = initializeDb();
  const app = await buildServer({ db, ...initializeOrms({ prisma: db, readonlyPrisma: db }) });
  const port = Number(opts?.port ?? 4000);
  await app.listen({ port, host: opts?.host });
  console.log(`Initializing API on ${opts?.host}:${port}/api`);
}
