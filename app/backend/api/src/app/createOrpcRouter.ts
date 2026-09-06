import { implement, ORPCError, type Implementer } from "@orpc/server";
import type { FastifyReply } from "fastify";
import { contract } from "@rhymelab/api-contract";
import type { LyricEntryController } from "../resources/lyricEntry/LyricEntry.Controller";
import { createLyricEntryHandlers } from "../resources/lyricEntry/LyricEntry.handlers";
import { createAuthHandlers } from "../resources/auth/Auth.handlers";

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

export type Session = { authed: true };

export interface OrpcContext {
  session: Session | null;
  reply: FastifyReply;
  LyricEntryController: LyricEntryController;
}

export type ContractImplementer = Implementer<typeof contract, OrpcContext, OrpcContext>;
