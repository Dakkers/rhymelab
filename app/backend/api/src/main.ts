/**
 * Entry point. Loads env first, then dynamically imports the server so that
 * `db.ts` (which reads DATABASE_URL at module load) sees a populated environment.
 */
import { loadEnv } from "./load-env";

loadEnv();

const { buildServer } = await import("./server");

const app = await buildServer();
const port = Number(process.env.PORT ?? 4000);

await app.listen({ port, host: "127.0.0.1" });
console.log(`API listening on http://localhost:${port}/api`);
