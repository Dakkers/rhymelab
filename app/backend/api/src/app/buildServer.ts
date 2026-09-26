/**
 * Build the Fastify API server, serving the oRPC contract as REST under `/api`.
 */
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { OpenAPIHandler } from "@orpc/openapi/fastify";
import { onError } from "@orpc/server";
import Fastify from "fastify";
import { createOrpcRouter, type Session } from "./createOrpcRouter";
import { COOKIE_NAME, COOKIE_VALUE, sessionSecret, TEMP_USER_ID } from "./session";
import { instantiateControllers } from "./instantiateControllers";
import { initializeOrms, PrismaClient } from "@rhymelab/database";

export async function buildServer({ db }: { db: PrismaClient }) {
  const orms = initializeOrms({ prisma: db, readonlyPrisma: db });
  const handler = new OpenAPIHandler(createOrpcRouter(), {
    interceptors: [onError((error) => console.error(error))],
  });

  const app = Fastify({ logger: true });

  await app.register(cookie, { secret: sessionSecret() });

  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.addContentTypeParser("*", (_req, _payload, done) => done(null, undefined));

  app.all("/api/*", async (req, reply) => {
    const raw = req.cookies[COOKIE_NAME];
    const unsigned = raw ? req.unsignCookie(raw) : { valid: false as const, value: null };
    const session: Session | null =
      unsigned.valid && unsigned.value === COOKIE_VALUE
        ? { authed: true, userId: TEMP_USER_ID }
        : null;

    const { matched } = await handler.handle(req, reply, {
      prefix: "/api",
      context: {
        session,
        reply,
        db,
        ...instantiateControllers({ db, ...orms }),
        userId: session?.userId ?? "-1",
      },
    });

    if (!matched) {
      reply.status(404).send("Not found");
    }
  });

  return app;
}
