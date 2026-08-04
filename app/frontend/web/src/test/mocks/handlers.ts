/**
 * MSW request handlers for the oRPC API.
 *
 * Rather than hand-craft oRPC's wire envelope, we mount a real server-side
 * `RPCHandler` — built by `implement`-ing the shared contract — and let it speak
 * the protocol. MSW intercepts the browser's fetch to the RPC endpoint and hands
 * the request to that handler, so serialisation and routing match production
 * exactly. The procedures read from an in-memory `store` that tests seed.
 *
 * The annotation write logic is NOT re-implemented here: the mock applies the same
 * pure plan (`planSetLineGroups` / `planClearLines`) the backend does (D-22), so a
 * passing test exercises the real replace-at-line / X-exclusivity / idempotence.
 */
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { http, passthrough } from "msw";
import {
  NotALineSpanError,
  planClearLines,
  planSetLineGroups,
  type ExistingAnnotation,
} from "@rhymelab/core";
import {
  contract,
  type ClearLinesInput,
  type EntryDetail,
  type EntrySummary,
  type SetLineGroupsInput,
} from "@rhymelab/api-contract";

/** Base URL the oRPC client targets (see `src/lib/orpc.ts`). */
export const RPC_URL = "http://localhost:4000/rpc";

/** Backing data the mocked procedures read from. Tests seed it via `seedEntry`. */
export const store = {
  entries: new Map<number, EntryDetail>(),
  /** Monotonic id source for inserted annotations (never reused, like the DB). */
  annotationSeq: 0,
  /** What `auth.me` reports — flip to exercise the redirect guard. */
  authed: true,
};

/** Put an entry in the store so `entries.get`/`entries.list` return it. */
export function seedEntry(entry: EntryDetail): EntryDetail {
  store.entries.set(entry.id, entry);
  for (const a of entry.annotations) store.annotationSeq = Math.max(store.annotationSeq, a.id);
  return entry;
}

/**
 * Optional observers fired with each write's input, in call order. Tests attach a
 * spy to assert the exact payload the component sends; unset by default.
 */
let onSetLineGroups: ((input: SetLineGroupsInput) => void) | null = null;
let onClearLines: ((input: ClearLinesInput) => void) | null = null;

/** Attach (or clear, with `null`) the `setLineGroups` observer for a test. */
export function observeSetLineGroups(fn: ((input: SetLineGroupsInput) => void) | null): void {
  onSetLineGroups = fn;
}

/** Attach (or clear, with `null`) the `clearLines` observer for a test. */
export function observeClearLines(fn: ((input: ClearLinesInput) => void) | null): void {
  onClearLines = fn;
}

/** Wipe the store back to defaults. Called from `afterEach` in the setup file. */
export function resetStore(): void {
  store.entries.clear();
  store.annotationSeq = 0;
  store.authed = true;
  onSetLineGroups = null;
  onClearLines = null;
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
    // The badge counts only annotations the user can see (parity with the backend).
    annotationCount: entry.annotations.filter((a) => !a.detached).length,
    hasLyrics: entry.lyrics.trim().length > 0,
    updatedAt: entry.updatedAt,
  };
}

const os = implement(contract);

/** The live entry, or a NOT_FOUND matching the backend. */
function requireEntry(id: number): EntryDetail {
  const entry = store.entries.get(id);
  if (!entry) throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
  return entry;
}

/** Assert the client's base version still matches (parity with the entry lock). */
function checkVersion(entry: EntryDetail, version: number): void {
  if (entry.version !== version) {
    throw new ORPCError("CONFLICT", { message: "Lyrics changed — reload and try again" });
  }
}

/** Run a core plan fn, mapping its line-span validation error to a 400 like the backend. */
function planOr400<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof NotALineSpanError) {
      throw new ORPCError("BAD_REQUEST", { message: "Each selection must be a whole line" });
    }
    throw err;
  }
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

    // REPLACE-at-line assign, applying the shared core plan to the stored entry in
    // place so the client's post-write `entries.get` invalidation reads it back.
    setLineGroups: os.entries.setLineGroups.handler(({ input }) => {
      onSetLineGroups?.(input);
      const entry = requireEntry(input.entryId);
      checkVersion(entry, input.version);
      const plan = planOr400(() =>
        planSetLineGroups(entry.lyrics, entry.annotations as ExistingAnnotation[], input.items),
      );
      const del = new Set(plan.deleteIds);
      entry.annotations = entry.annotations.filter((a) => !del.has(a.id));
      for (const ins of plan.inserts) {
        store.annotationSeq += 1;
        entry.annotations.push({
          id: store.annotationSeq,
          startOffset: ins.startOffset,
          endOffset: ins.endOffset,
          quote: ins.quote,
          value: ins.value,
          detached: false,
        });
      }
      return { ok: true as const };
    }),

    // Hard-delete the whole-line rows at the given line spans.
    clearLines: os.entries.clearLines.handler(({ input }) => {
      onClearLines?.(input);
      const entry = requireEntry(input.entryId);
      checkVersion(entry, input.version);
      const plan = planOr400(() =>
        planClearLines(entry.lyrics, entry.annotations as ExistingAnnotation[], input.items),
      );
      const del = new Set(plan.deleteIds);
      entry.annotations = entry.annotations.filter((a) => !del.has(a.id));
      return { ok: true as const };
    }),

    // Delete one annotation by id (idempotent, version-exempt).
    deleteAnnotation: os.entries.deleteAnnotation.handler(({ input }) => {
      for (const entry of store.entries.values()) {
        const before = entry.annotations.length;
        entry.annotations = entry.annotations.filter((a) => a.id !== input.id);
        if (entry.annotations.length !== before) break;
      }
      return { ok: true as const };
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
