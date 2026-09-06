import { buildServer } from "./buildServer";

export async function initializeServer(opts?: {
    host: string;
    port?: number | string;
}) {
    const app = await buildServer();
    const port = Number(opts?.port ?? 4000);
    await app.listen({ port, host: opts?.host });
    console.log(`Initializing API on ${opts?.host}:${port}/api`);
}