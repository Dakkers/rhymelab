/**
 * MSW request handlers for the oRPC API.
 *
 * Rather than hand-craft oRPC's wire envelope, we mount a real server-side
 * `RPCHandler` — built by `implement`-ing the shared contract — and let it speak
 * the protocol. MSW intercepts the browser's fetch to the RPC endpoint and hands
 * the request to that handler, so serialisation and routing match production
 * exactly. The procedures read from an in-memory `store` that tests seed.
 */
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { http, passthrough } from "msw";
import { themeColor } from "@rhymelab/core";
import {
  contract,
  type EntryDetail,
  type EntrySummary,
  type SetAnnotationInput,
} from "@rhymelab/api-contract";

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

/**
 * Optional observer fired with each `setAnnotation` input, in call order. Tests
 * attach a spy (`observeSetAnnotation(vi.fn())`) to assert the exact payload the
 * component sends; unset by default so it's zero-cost otherwise.
 */
let onSetAnnotation: ((input: SetAnnotationInput) => void) | null = null;

/** Attach (or clear, with `null`) the `setAnnotation` observer for a test. */
export function observeSetAnnotation(fn: ((input: SetAnnotationInput) => void) | null): void {
  onSetAnnotation = fn;
}

/** Wipe the store back to defaults. Called from `afterEach` in the setup file. */
export function resetStore(): void {
  store.entries.clear();
  store.authed = true;
  onSetAnnotation = null;
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

/** Next free annotation id for an entry (ids are unique within an entry here). */
function nextAnnotationId(entry: EntryDetail): number {
  return entry.annotations.reduce((max, a) => Math.max(max, a.id), 0) + 1;
}

/**
 * Only the procedures a page render or its exercised interactions perform are
 * implemented. Add mutations here as tests need them — an un-implemented
 * procedure simply won't match, and the MSW handler below turns that into a loud
 * unhandled-request error.
 */
const router = {
  auth: {
    me: os.auth.me.handler(() => ({ authed: store.authed })),
  },
  entries: {
    list: os.entries.list.handler(() => [...store.entries.values()].map(toSummary)),
    get: os.entries.get.handler(({ input }) => store.entries.get(input.id) ?? null),

    // Upsert-or-clear one annotation for a (mode, span), mutating the stored
    // entry in place so the client's post-write `entries.get` invalidation reads
    // it back. A faithful-but-minimal port of the backend `setAnnotation`.
    setAnnotation: os.entries.setAnnotation.handler(({ input }) => {
      onSetAnnotation?.(input);
      const entry = store.entries.get(input.entryId);
      if (!entry) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });

      const quote = entry.lyrics.slice(input.startOffset, input.endOffset);
      const existing = entry.annotations.findIndex(
        (a) =>
          !a.detached &&
          a.mode === input.mode &&
          a.startOffset === input.startOffset &&
          a.endOffset === input.endOffset,
      );

      // Both value and body null → clear whatever is at this exact span+mode.
      if (input.value === null && input.body === null) {
        if (existing >= 0) entry.annotations.splice(existing, 1);
        return { ok: true as const, cleared: true, id: null };
      }

      const color = input.mode === "theme" && input.value ? themeColor(input.value) : null;

      if (existing >= 0) {
        const keep = entry.annotations[existing]!;
        Object.assign(keep, { value: input.value, body: input.body, quote, color, detached: false });
        return { ok: true as const, cleared: false, id: keep.id };
      }

      const id = nextAnnotationId(entry);
      entry.annotations.push({
        id,
        mode: input.mode,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        quote,
        value: input.value,
        body: input.body,
        color,
        detached: false,
      });
      return { ok: true as const, cleared: false, id };
    }),
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
