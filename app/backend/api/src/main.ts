/**
 * Entry point. Loads env first, then dynamically imports the server so that
 * `db.ts` (which reads DATABASE_URL at module load) sees a populated environment.
 */
import { loadEnv } from "./load-env";

loadEnv();

const { buildServer } = await import("./server");

const app = await buildServer();
const port = Number(process.env.PORT ?? 4000);
// Bind all interfaces in containers (Render's router and health checks can't
// reach a loopback bind); default to loopback for local dev. The deployed
// environment sets HOST=0.0.0.0 — the API Dockerfile does this.
const host = process.env.HOST ?? "127.0.0.1";

await app.listen({ port, host });
console.log(`API listening on http://${host}:${port}/api`);
