/**
 * The mock oRPC API: a real server-side `RPCHandler`, built by `implement`-ing the
 * shared contract and backed by the in-memory `db`. Sharing the contract means the
 * mock speaks the exact wire protocol the real API does — serialisation and
 * routing can't drift from production.
 *
 * `dispatchMock` runs a request through that handler. It is transport-agnostic on
 * purpose: the browser worker (`./handlers`, via MSW) and the SSR link
 * (`#/lib/orpc`, in-process) both call it, so a fetch is answered the same way
 * whether it was made in the page or during server rendering. This module never
 * imports `msw` or any browser-only API, so it is also safe to load in the
 * Cloudflare Worker SSR runtime.
 */
import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { contract, deriveEntrySummaryFields } from "@rhymelab/api-contract";
import { db } from "./db";

/** Where the oRPC client sends requests — kept in step with `#/lib/orpc`. */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/rpc";

/**
 * The path oRPC procedures hang off, derived from the URL so the two stay in
 * step. `URL.pathname` always starts with `/`, which is the shape oRPC's
 * `prefix` option demands.
 */
const RPC_PREFIX = new URL(API_URL).pathname as `/${string}`;

const os = implement(contract);

const router = {
  auth: {
    me: os.auth.me.handler(() => ({ authed: db.authed })),
    // The contract already guarantees a non-empty password; the mock doesn't
    // gatekeep on a specific one — any submission opens the session.
    login: os.auth.login.handler(() => {
      db.authed = true;
      return { ok: true };
    }),
    logout: os.auth.logout.handler(() => {
      db.authed = false;
      return { ok: true as const };
    }),
  },
  entries: {
    list: os.entries.list.handler(() =>
      [...db.entries].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    ),
    create: os.entries.create.handler(({ input }) => {
      const now = new Date().toISOString();
      // The optional input fields collapse to "" on the wire shape, matching how
      // the real API stores/returns them (author non-null; artist/album `?? ""`).
      const base = {
        id: crypto.randomUUID(),
        title: input.title,
        author: input.author ?? "",
        year: input.year,
        ...deriveEntrySummaryFields(input.body),
        createdAt: now,
        updatedAt: now,
      };
      const entry =
        input.kind === "lyrics"
          ? {
              ...base,
              kind: "lyrics" as const,
              artist: input.artist ?? "",
              album: input.album ?? "",
            }
          : { ...base, kind: "poem" as const };
      // Prepend so the new row is newest-edited — where the Library shows it.
      db.entries = [entry, ...db.entries];
      return entry;
    }),
  },
};

const rpcHandler = new RPCHandler(router);

/**
 * Answer one request with the mock API. Returns the oRPC `Response` when the
 * request targets a known procedure, or `null` when it doesn't — letting the
 * caller fall back (pass through to the network, or 404).
 */
export async function dispatchMock(request: Request): Promise<Response | null> {
  const { matched, response } = await rpcHandler.handle(request, { prefix: RPC_PREFIX });
  return matched ? response : null;
}
