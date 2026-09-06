import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { OpenAPIHandler } from "@orpc/openapi/fastify";
import { onError } from "@orpc/server";
import Fastify from "fastify";
import { router } from "../router";
import type { Session } from "../orpc";
import { COOKIE_NAME, COOKIE_VALUE, sessionSecret } from "./session";
import type { PrismaClient } from "@rhymelab/database";

export async function buildServer(factory: {
  db: PrismaClient
}) {
  const handler = new OpenAPIHandler(router, {
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
      unsigned.valid && unsigned.value === COOKIE_VALUE ? { authed: true } : null;

    const { matched } = await handler.handle(req, reply, {
      prefix: "/api",
      context: {
        db: factory.db,
        session,
        reply
      },
    });

    if (!matched) {
      reply.status(404).send("Not found");
    }
  });

  return app;
}
