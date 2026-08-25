/**
 * The mock API: a real server-side `OpenAPIHandler`, built by `implement`-ing the
 * shared contract and backed by the in-memory `db`. Sharing the contract means the
 * mock speaks the exact wire protocol the real API does — the same
 * `.route()`-annotated REST paths and serialisation — so it can't drift from
 * production.
 *
 * `dispatchMock` runs a request through that handler. It is transport-agnostic on
 * purpose: the browser worker (`./handlers`, via MSW) and the SSR link
 * (`#/lib/orpc`, in-process) both call it, so a fetch is answered the same way
 * whether it was made in the page or during server rendering. This module never
 * imports `msw` or any browser-only API, so it is also safe to load in the
 * Cloudflare Worker SSR runtime.
 */
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { implement, ORPCError } from "@orpc/server";
import {
  contract,
  deriveEntrySummaryFields,
  initStructure,
  splitSections,
  type EntryDetail,
  type SectionType,
} from "@rhymelab/api-contract";
import { db, type MockEntry } from "./db";

/** Where the oRPC client sends requests — kept in step with `#/lib/orpc`. */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

/**
 * The path the REST API hangs off, derived from the URL so the two stay in step.
 * `URL.pathname` always starts with `/`, which is the shape oRPC's `prefix`
 * option demands.
 */
const API_PREFIX = new URL(API_URL).pathname as `/${string}`;

const os = implement(contract);

/**
 * Look a stored entry up by id, or 404 the way the real API does — which also
 * 404s a piece owned by another user, so "not yours" and "doesn't exist" look
 * identical to the caller. Shared by every by-id procedure (`get`, the updates,
 * `delete`).
 */
function entryOr404(id: string): MockEntry {
  const entry = db.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new ORPCError("NOT_FOUND");
  return entry;
}

/**
 * Project a stored row onto the detail shape: drop the list-view-only derived
 * fields (`excerpt`/`lineCount`/`wordCount`) and attach the `structure` the
 * detail view renders. The stored row always carries a real `body`, so the
 * result is a complete `EntryDetail`.
 */
function toDetail(entry: MockEntry, structure: SectionType[]): EntryDetail {
  const { excerpt: _excerpt, lineCount: _lineCount, wordCount: _wordCount, ...detail } = entry;
  return { ...detail, structure };
}

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
      // The optional scalar (`album`) collapses to "" on the wire shape, matching
      // the real API (it stores it nullable and maps NULL to "" on read). The list
      // fields `author`/`artist` are already defaulted to `[]` by the contract, so
      // they pass straight through.
      const base = {
        id: crypto.randomUUID(),
        title: input.title,
        author: input.author,
        year: input.year,
        body: input.body,
        ...deriveEntrySummaryFields(input.body),
        createdAt: now,
        updatedAt: now,
      };
      const entry =
        input.kind === "lyrics"
          ? {
              ...base,
              kind: "lyrics" as const,
              artist: input.artist,
              album: input.album ?? "",
            }
          : { ...base, kind: "poem" as const };
      // Prepend so the new row is newest-edited — where the Library shows it.
      db.entries = [entry, ...db.entries];
      return entry;
    }),
    get: os.entries.get.handler(({ input }) => {
      // Fixtures carry no labels, so stand in a section-count-correct default
      // `structure` — what the real API returns for a never-labelled entry.
      const entry = entryOr404(input.id);
      return toDetail(entry, initStructure(entry.body));
    }),
    updateBody: os.entries.updateBody.handler(({ input }) => {
      const entry = entryOr404(input.id);
      // The real API re-derives the list fields from the new text and lets the
      // database bump `updatedAt`; mirror both so the Library sees what it would
      // after a real edit.
      const updated = {
        ...entry,
        body: input.body,
        ...deriveEntrySummaryFields(input.body),
        updatedAt: new Date().toISOString(),
      };
      db.entries = db.entries.map((candidate) => (candidate.id === input.id ? updated : candidate));
      // The real API re-syncs `structure` to the new sections; the mock has no
      // stored labels to carry, so an all-default array of the right length stands
      // in — enough to keep the detail shape valid.
      return toDetail(updated, initStructure(updated.body));
    }),
    updateStructure: os.entries.updateStructure.handler(({ input }) => {
      const entry = entryOr404(input.id);
      // Mirror the real handler's guard: the array must be one label per section.
      if (input.structure.length !== splitSections(entry.body).length) {
        throw new ORPCError("BAD_REQUEST");
      }
      return toDetail(entry, input.structure);
    }),
    delete: os.entries.delete.handler(({ input }) => {
      entryOr404(input.id); // 404 first, so deleting a missing piece isn't a silent no-op.
      // The real delete is soft, but the tombstone is invisible over the wire — a
      // deleted piece is simply gone from every response, so dropping it from the
      // store is a faithful mock of what a client can observe.
      db.entries = db.entries.filter((candidate) => candidate.id !== input.id);
      return { ok: true } as const;
    }),
  },
};

const apiHandler = new OpenAPIHandler(router);

/**
 * Answer one request with the mock API. Returns the `Response` when the request
 * targets a known REST route, or `null` when it doesn't — letting the caller fall
 * back (pass through to the network, or 404).
 */
export async function dispatchMock(request: Request): Promise<Response | null> {
  const { matched, response } = await apiHandler.handle(request, { prefix: API_PREFIX });
  return matched ? response : null;
}
