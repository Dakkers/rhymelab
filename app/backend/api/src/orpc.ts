/**
 * oRPC base: the contract implementer, the per-request context type, and the
 * auth middleware. Handlers in `router.ts` attach to `authed.*` (protected) or
 * bare `os.*` (public auth procedures).
 */
import { implement, ORPCError } from "@orpc/server";
import type { FastifyReply } from "fastify";
import { contract } from "@rhymelab/api-contract";

/** Marker for an authenticated request. Null when signed out. */
export type Session = { authed: true };

export interface ORPCContext {
  /** Parsed from the signed session cookie in the Fastify `/api/*` route. */
  session: Session | null;
  /** So auth procedures can set/clear the session cookie. */
  reply: FastifyReply;
}

export const os = implement(contract).$context<ORPCContext>();

/**
 * The route guard protects navigations; each procedure is its own public
 * endpoint and must re-check. Throwing `UNAUTHORIZED` maps to HTTP 401, which the
 * frontend detects and redirects to the login page.
 */
export const requireAuth = os.middleware(async ({ context, next }) => {
  if (!context.session) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({ context: { session: context.session } });
});

/** Base implementer for authenticated procedures. */
export const authed = os.use(requireAuth);
