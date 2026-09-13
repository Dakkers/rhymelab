/**
 * Entry point. Loads env first, then dynamically imports the server so that
 * `db.ts` (which reads DATABASE_URL at module load) sees a populated environment.
 */
import { loadEnv } from "./load-env";

loadEnv();

const { initializeHttpServer } = await import("./app/initializeHttpServer");
await initializeHttpServer({
  host: "127.0.0.1",
  port: process.env.PORT,
});

console.log(`API initialized.`);
