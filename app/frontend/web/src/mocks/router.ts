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
  resyncStructure,
  splitSections,
  type ReadLyricEntryDetail,
} from "@rhymelab/api-contract";
import type { z } from "zod";
import { db, type MockEntry } from "./db";
import { fakeSchema } from "./fake-schema";

/** Where the oRPC client sends requests — kept in step with `#/lib/orpc`. */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

/**
 * The path the REST API hangs off, derived from the URL so the two stay in step.
 * `URL.pathname` always starts with `/`, which is the shape oRPC's `prefix`
 * option demands.
 */
const API_PREFIX = new URL(API_URL).pathname as `/${string}`;

/**
 * Answer one request with the mock API. The hand-written handlers answer first;
 * a request they don't recognise but the contract still declares falls to the
 * stub handler. Returns `null` only when the request targets no contract route at
 * all — letting the caller pass through to the network.
 */
export async function dispatchMock(request: Request): Promise<Response | null> {
  const real = await apiHandler.handle(request, { prefix: API_PREFIX });
  if (real.matched) return real.response;
  const stub = await stubHandler.handle(request, { prefix: API_PREFIX });
  return stub.matched ? stub.response : null;
}

/**
 * Look a stored entry up by id, or 404 the way the real API does — which also
 * 404s a piece owned by another user, so "not yours" and "doesn't exist" look
 * identical to the caller. Shared by every by-id procedure (`getItem`, the
 * updates, `delete`).
 */
function entryOr404(id: string): MockEntry {
  const entry = db.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new ORPCError("NOT_FOUND");
  return entry;
}

/**
 * Project a stored row onto the detail shape: drop the list-view-only `excerpt`.
 * The row carries `structure`, `lineCount`, and `wordCount` already, so the rest
 * is a complete `ReadLyricEntryDetail`.
 */
function toDetail(entry: MockEntry): ReadLyricEntryDetail {
  const { excerpt: _excerpt, ...detail } = entry;
  return detail;
}

/**
 * Project a stored row onto the list-item shape: drop the detail-only
 * `structure`. `excerpt`/`lineCount`/`wordCount` stay; the contract's own
 * transform then dresses the credit-line fields on serialization.
 */
function toListItem(entry: MockEntry) {
  const { structure: _structure, ...item } = entry;
  return item;
}

/**
 * A parallel router that answers *every* contract procedure with a
 * `fakeSchema`-generated, schema-valid stub. It's consulted only as a fallback
 * (see `dispatchMock`), so a contract procedure not hand-written above keeps the
 * mock working — an obvious placeholder response — instead of 404-ing, until it's
 * given real stateful behaviour here. Walks the contract and `os` in lockstep.
 */
function buildStubRouter(
  contractNode: Record<string, unknown>,
  osNode: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(contractNode)) {
    const node = contractNode[key];
    if (isProcedure(node)) {
      const schema = node["~orpc"].outputSchema;
      out[key] = (osNode[key] as Implementer).handler(() =>
        schema ? fakeSchema(schema) : undefined,
      );
    } else {
      out[key] = buildStubRouter(
        node as Record<string, unknown>,
        osNode[key] as Record<string, unknown>,
      );
    }
  }
  return out;
}

/** A leaf contract node carries oRPC's `~orpc` definition; a namespace is a plain
 *  object of them. Used to walk the contract in parallel with `os`. */
function isProcedure(node: unknown): node is { "~orpc": { outputSchema?: z.ZodType } } {
  return typeof node === "object" && node !== null && "~orpc" in node;
}

const os = implement(contract);

const router = {
  auth: {
    me: os.auth.me.handler(() => ({ authed: db.authed })),
    login: os.auth.login.handler(() => {
      db.authed = true;
      return { ok: true };
    }),
    logout: os.auth.logout.handler(() => {
      db.authed = false;
      return { ok: true as const };
    }),
  },
  lyricEntries: {
    list: os.lyricEntries.list.handler(() =>
      [...db.entries].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(toListItem),
    ),
    create: os.lyricEntries.create.handler(({ input }) => {
      const now = new Date();
      const entry: MockEntry = {
        id: crypto.randomUUID(),
        kind: input.kind,
        title: input.title,
        body: input.body,
        structure: initStructure(input.body),
        authors: input.authors,
        year: input.year,
        artists: input.kind === "song" ? input.artists : [],
        album: input.kind === "song" ? (input.album ?? null) : null,
        ...deriveEntrySummaryFields(input.body),
        createdAt: now,
        updatedAt: now,
      };
      db.entries = [entry, ...db.entries];
      return toDetail(entry);
    }),
    getItem: os.lyricEntries.getItem.handler(({ input }) => toDetail(entryOr404(input.id))),
    updateBody: os.lyricEntries.updateBody.handler(({ input }) => {
      const entry = entryOr404(input.id);
      const updated: MockEntry = {
        ...entry,
        body: input.body,
        structure: resyncStructure(entry.body, entry.structure, input.body),
        ...deriveEntrySummaryFields(input.body),
        updatedAt: new Date(),
      };
      db.entries = db.entries.map((candidate) => (candidate.id === input.id ? updated : candidate));
    }),
    updateStructure: os.lyricEntries.updateStructure.handler(({ input }) => {
      const entry = entryOr404(input.id);
      if (input.structure.length !== splitSections(entry.body).length) {
        throw new ORPCError("BAD_REQUEST");
      }
      db.entries = db.entries.map((candidate) =>
        candidate.id === input.id ? { ...candidate, structure: input.structure } : candidate,
      );
    }),
    delete: os.lyricEntries.delete.handler(({ input }) => {
      entryOr404(input.id);
      db.entries = db.entries.filter((candidate) => candidate.id !== input.id);
    }),
  },
};

const apiHandler = new OpenAPIHandler(router);

const stubRouter = buildStubRouter(
  contract as unknown as Record<string, unknown>,
  os as unknown as Record<string, unknown>,
) as ConstructorParameters<typeof OpenAPIHandler>[0];
const stubHandler = new OpenAPIHandler(stubRouter);

/** The shape of an `os.*` leaf — the builder whose `.handler()` mounts a procedure. */
interface Implementer {
  handler(handler: () => unknown): unknown;
}
