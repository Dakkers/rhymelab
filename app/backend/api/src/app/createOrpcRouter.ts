import { login, logout, me } from "../handlers/auth";
import {
  create as entriesCreate,
  get as entriesGet,
  list as entriesList,
  remove as entriesRemove,
  updateBody as entriesUpdateBody,
  updateStructure as entriesUpdateStructure,
} from "../handlers/entries";
import { implement, ORPCError } from "@orpc/server";
import type { FastifyReply } from "fastify";
import { contract } from "@rhymelab/api-contract";

export function createOrpcRouter() {

  const os = implement(contract).$context<ORPCContext>();

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
    auth: { login, logout, me },
    entries: {
      list: entriesList,
      create: entriesCreate,
      get: entriesGet,
      updateBody: entriesUpdateBody,
      updateStructure: entriesUpdateStructure,
      delete: entriesRemove,
    },
  });
}

export type Session = { authed: true };

export interface ORPCContext {
  session: Session | null;
  reply: FastifyReply;
}
