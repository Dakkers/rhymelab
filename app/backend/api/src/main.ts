/**
 * Entry point. Loads env first, then dynamically imports the server so that
 * `db.ts` (which reads DATABASE_URL at module load) sees a populated environment.
 */
import { loadEnv } from "./load-env";

loadEnv();

const { initializeServer } = await import("./app/initializeServer");
await initializeServer({
    host: '127.0.0.1',
    port: process.env.PORT,
})

console.log(`API initialized.`);
