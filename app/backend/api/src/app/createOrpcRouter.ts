import { implement, ORPCError, type Implementer } from "@orpc/server";
import type { FastifyReply } from "fastify";
import { contract } from "@rhymelab/api-contract";
import type { LyricEntryController } from "../resources/lyricEntry/LyricEntry.Controller";
import { createLyricEntryHandlers } from "../resources/lyricEntry/LyricEntry.handlers";
import { createAuthHandlers } from "../resources/auth/Auth.handlers";
import type { PrismaClient } from "@rhymelab/database";

export function createOrpcRouter() {
  const os = implement(contract).$context<OrpcContext>();

  const requireAuth = os.middleware(async ({ context, path, next }) => {
    if (path[0] === "auth") {
      return next();
    }
    if (!context.session) {
      throw new ORPCError("UNAUTHORIZED");
    }
    return next({ context: { session: context.session } });
  });

  return os.use(requireAuth).router({
    auth: createAuthHandlers(os),
    lyricEntries: createLyricEntryHandlers(os),
  });
}

export type Session = { authed: true; userId: string };

export interface OrpcContext {
  db: PrismaClient;
  userId: string;
  session: Session | null;
  reply: FastifyReply;
  LyricEntryController: LyricEntryController;
}

export type ContractImplementer = Implementer<typeof contract, OrpcContext, OrpcContext>;
