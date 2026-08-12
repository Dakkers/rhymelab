/**
 * MSW request handlers for the oRPC API.
 *
 * Rather than hand-craft oRPC's wire envelope, we mount a real server-side
 * `RPCHandler` — built by `implement`-ing the shared contract — and let it speak
 * the protocol. MSW intercepts the browser's fetch to the RPC endpoint and hands
 * the request to that handler, so serialisation and routing match production
 * exactly.
 *
 * The product surface (entries / sections / annotations) was removed while the
 * UX is redesigned; only `auth.me` is mocked. Add procedures here as the new
 * surface — and the tests that exercise it — take shape.
 */
import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { http, passthrough } from "msw";
import { contract } from "@rhymelab/api-contract";

/** Base URL the oRPC client targets (see `src/lib/orpc.ts`). */
export const RPC_URL = "http://localhost:4000/rpc";

/** Backing state the mocked procedures read from. */
export const store = {
  /** What `auth.me` reports — flip to exercise the redirect guard. */
  authed: true,
};

/** Wipe the store back to defaults. Called from `afterEach` in the setup file. */
export function resetStore(): void {
  store.authed = true;
}

const os = implement(contract);

const router = {
  auth: {
    me: os.auth.me.handler(() => ({ authed: store.authed })),
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
