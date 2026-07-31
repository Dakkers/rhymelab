/**
 * MSW request handlers for the oRPC API.
 *
 * Rather than hand-craft oRPC's wire envelope, we mount a real server-side
 * `RPCHandler` — built by `implement`-ing the shared contract — and let it speak
 * the protocol. MSW intercepts the browser's fetch to the RPC endpoint and hands
 * the request to that handler, so serialisation and routing match production
 * exactly. The procedures read from an in-memory `store` that tests seed.
 */
import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { http, passthrough } from "msw";
import { contract, type EntryDetail, type EntrySummary } from "@rhymelab/api-contract";

/** Base URL the oRPC client targets (see `src/lib/orpc.ts`). */
export const RPC_URL = "http://localhost:4000/rpc";

/** Backing data the mocked procedures read from. Tests seed it via `seedEntry`. */
export const store = {
  entries: new Map<number, EntryDetail>(),
  /** What `auth.me` reports — flip to exercise the redirect guard. */
  authed: true,
};

/** Put an entry in the store so `entries.get`/`entries.list` return it. */
export function seedEntry(entry: EntryDetail): EntryDetail {
  store.entries.set(entry.id, entry);
  return entry;
}

/** Wipe the store back to defaults. Called from `afterEach` in the setup file. */
export function resetStore(): void {
  store.entries.clear();
  store.authed = true;
}

function toSummary(entry: EntryDetail): EntrySummary {
  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    artist: entry.artist,
    collection: entry.collection,
    year: entry.year,
    tags: entry.tags,
    annotationCount: entry.annotations.length,
    hasLyrics: entry.lyrics.trim().length > 0,
    updatedAt: entry.updatedAt,
  };
}

const os = implement(contract);

/**
 * Only the reads a page render performs are implemented. Add mutations here as
 * tests need them — an un-implemented procedure simply won't match, and the MSW
 * handler below turns that into a loud unhandled-request error.
 */
const router = {
  auth: {
    me: os.auth.me.handler(() => ({ authed: store.authed })),
  },
  entries: {
    list: os.entries.list.handler(() => [...store.entries.values()].map(toSummary)),
    get: os.entries.get.handler(({ input }) => store.entries.get(input.id) ?? null),
  },
};

const rpcHandler = new RPCHandler(router);

export const handlers = [
  http.all(`${RPC_URL}/*`, async ({ request }) => {
    // MSW's `StrictRequest` is a real Fetch `Request` at runtime; the cast only
    // sheds the Cloudflare `cf` property this package's global `Request` carries.
    const { matched, response } = await rpcHandler.handle(request as unknown as Request, {
      prefix: "/rpc",
    });
    if (matched) return response;
    return passthrough();
  }),
];
