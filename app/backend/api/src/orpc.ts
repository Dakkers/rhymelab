/**
 * oRPC base: the contract implementer, the per-request context type, and the
 * auth middleware. Handlers in `router.ts` attach to `authed.*` (protected) or
 * bare `os.*` (public auth procedures).
 */
import { implement, ORPCError } from "@orpc/server";
import type { FastifyReply } from "fastify";
import { contract } from "@rhymelab/api-contract";

export const os = implement(contract).$context<ORPCContext>();

export const requireAuth = os.middleware(async ({ context, next }) => {
  if (!context.session) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({ context: { session: context.session } });
});

export const authed = os.use(requireAuth);

export type Session = { authed: true };

export interface ORPCContext {
  /** Parsed from the signed session cookie in the Fastify `/api/*` route. */
  session: Session | null;
  /** So auth procedures can set/clear the session cookie. */
  reply: FastifyReply;
}
