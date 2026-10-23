import { implement, ORPCError, type Implementer } from "@orpc/server";
import type { FastifyReply } from "fastify";
import { contract } from "@rhymelab/api-contract";
import type { LyricEntryController } from "../resources/lyricEntry/LyricEntry.Controller";
import { createLyricEntryHandlers } from "../resources/lyricEntry/LyricEntry.handlers";
import { createAuthHandlers } from "../resources/auth/Auth.handlers";
import type { PrismaClient } from "@rhymelab/database";
import { BaseError } from "@rhymelab/utils";

export function createOrpcRouter() {
  const os = implement(contract).$context<OrpcContext>();

  const surfaceStatus = os.middleware(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (!(error instanceof BaseError)) throw error;
      throw new ORPCError(ORPC_CODES[error.statusCode] ?? "INTERNAL_SERVER_ERROR", {
        status: error.statusCode,
        message: error.message,
        cause: error,
      });
    }
  });

  const requireAuth = os.middleware(async ({ context, path, next }) => {
    if (path[0] === "auth") {
      return next();
    }
    if (!context.session) {
      throw new ORPCError("UNAUTHORIZED");
    }
    return next({ context: { session: context.session } });
  });

  return os
    .use(surfaceStatus)
    .use(requireAuth)
    .router({
      auth: createAuthHandlers(os),
      lyricEntries: createLyricEntryHandlers(os),
    });
}

const ORPC_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_CONTENT",
};

export type Session = { authed: true; userId: string };

export interface OrpcContext {
  db: PrismaClient;
  userId: string;
  session: Session | null;
  reply: FastifyReply;
  LyricEntryController: LyricEntryController;
}

export type ContractImplementer = Implementer<typeof contract, OrpcContext, OrpcContext>;
