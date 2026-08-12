/**
 * MSW request handlers for the oRPC API.
 *
 * Rather than hand-craft oRPC's wire envelope, we mount a real server-side
 * `RPCHandler` — built by `implement`-ing the shared contract — and let it speak
 * the protocol. MSW intercepts the browser's fetch to the RPC endpoint and hands
 * the request to that handler, so serialisation and routing match production
 * exactly.
 *
 * `auth.me` and `entries.list` are mocked. Add procedures here as the new
 * surface — and the tests that exercise it — take shape.
 */
import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { http, passthrough } from "msw";
import { contract, type EntrySummary } from "@rhymelab/api-contract";

/** Base URL the oRPC client targets (see `src/lib/orpc.ts`). */
export const RPC_URL = "http://localhost:4000/rpc";

/**
 * Fixture entries the mocked `entries.list` returns — a small, stable set the
 * Library test asserts against. Deliberately in edited-newest-first order so a
 * test can check the handler is trusted to sort.
 */
const ENTRIES: EntrySummary[] = [
  {
    kind: "lyrics",
    id: "midnight-static",
    title: "Midnight Static",
    author: "Nora Vance",
    artist: "Nora Vance",
    album: "Neon Liturgy",
    year: 2023,
    excerpt: "City lights bleed through the blinds / I trace the cracks in tired minds",
    lineCount: 42,
    wordCount: 287,
    createdAt: 1,
    updatedAt: 5,
  },
  {
    kind: "poem",
    id: "paper-boats",
    title: "Paper Boats",
    author: "Elena Marsh",
    year: 2019,
    excerpt: "We folded the years into paper boats / and set them loose on the gutter's flood",
    lineCount: 18,
    wordCount: 121,
    createdAt: 1,
    updatedAt: 4,
  },
  {
    kind: "lyrics",
    id: "concrete-orchard",
    title: "Concrete Orchard",
    author: "Dominic Reyes",
    artist: "The Gutter Choir",
    album: "Corner Boys",
    year: 2021,
    excerpt: "Nothing grows here but the noise / a chorus of the corner boys",
    lineCount: 56,
    wordCount: 372,
    createdAt: 1,
    updatedAt: 3,
  },
  {
    kind: "poem",
    id: "low-tide-letters",
    title: "Low Tide Letters",
    author: "Halima Okonkwo",
    year: 2020,
    excerpt: "The sea returns what it can't keep — / salt-blurred ink and someone's sleep",
    lineCount: 24,
    wordCount: 156,
    createdAt: 1,
    updatedAt: 2,
  },
  {
    kind: "lyrics",
    id: "borrowed-weather",
    title: "Borrowed Weather",
    author: "Saffron Bell",
    artist: "Saffron & the Tide",
    album: "Second Coat",
    year: 2018,
    excerpt: "I wore your storm like a second coat / kept your thunder lodged in my throat",
    lineCount: 38,
    wordCount: 249,
    createdAt: 1,
    updatedAt: 1,
  },
];

/** Backing state the mocked procedures read from. */
export const store = {
  /** What `auth.me` reports — flip to exercise the redirect guard. */
  authed: true,
  /** What `entries.list` returns. */
  entries: ENTRIES as EntrySummary[],
};

/** Wipe the store back to defaults. Called from `afterEach` in the setup file. */
export function resetStore(): void {
  store.authed = true;
  store.entries = ENTRIES;
}

const os = implement(contract);

const router = {
  auth: {
    me: os.auth.me.handler(() => ({ authed: store.authed })),
  },
  entries: {
    list: os.entries.list.handler(() =>
      [...store.entries].sort((a, b) => b.updatedAt - a.updatedAt),
    ),
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
