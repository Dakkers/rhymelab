/**
 * Fastify app wiring the oRPC router in over the OpenAPI (REST) protocol.
 *
 * Procedures carry `.route({ method, path })` in the contract, so oRPC's
 * `OpenAPIHandler` serves each as a real HTTP verb + path under `/api` — e.g.
 * `GET /api/entries`, `POST /api/entries`, `DELETE /api/entries/{id}`.
 *
 * The session cookie is parsed here (before oRPC) and handed to handlers as
 * context; auth procedures set/clear it via `context.reply`. CORS runs in
 * credentials mode against the web app's exact origin so the browser attaches the
 * cookie on cross-port requests.
 */
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { OpenAPIHandler } from "@orpc/openapi/fastify";
import { onError } from "@orpc/server";
import Fastify from "fastify";
import { router } from "./router";
import type { Session } from "./orpc";
import { COOKIE_NAME, COOKIE_VALUE, sessionSecret } from "./session";

export async function buildServer() {
  const handler = new OpenAPIHandler(router, {
    interceptors: [onError((error) => console.error(error))],
  });

  const app = Fastify({ logger: true });

  await app.register(cookie, { secret: sessionSecret() });
  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    // Spelled out because `@fastify/cors` defaults to `GET,HEAD,POST` — enough
    // for the RPC protocol, where every call was a POST, but not for the REST
    // routes: a cross-origin `DELETE` or `PUT` sends a preflight first, and the
    // browser blocks the real request when the verb is missing from the
    // response's `Access-Control-Allow-Methods`.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // oRPC decodes the request body itself; without this catch-all parser Fastify
  // pre-parses it and oRPC's request decoding breaks.
  app.addContentTypeParser("*", (_req, _payload, done) => done(null, undefined));

  app.all("/api/*", async (req, reply) => {
    const raw = req.cookies[COOKIE_NAME];
    const unsigned = raw ? req.unsignCookie(raw) : { valid: false as const, value: null };
    const session: Session | null =
      unsigned.valid && unsigned.value === COOKIE_VALUE ? { authed: true } : null;

    const { matched } = await handler.handle(req, reply, {
      prefix: "/api",
      context: { session, reply },
    });

    if (!matched) {
      reply.status(404).send("Not found");
    }
  });

  return app;
}
