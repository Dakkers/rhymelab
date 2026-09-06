import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@rhymelab/database";
import { loadEnv } from "./loadEnv";

loadEnv();

export const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL ?? "",
        options: "-c TimeZone=UTC",
    })
});

const { buildServer } = await import("./server");

const app = await buildServer();
const port = Number(process.env.PORT ?? 4000);

await app.listen({ port, host: "127.0.0.1" });
console.log(`API listening on http://localhost:${port}/api`);
