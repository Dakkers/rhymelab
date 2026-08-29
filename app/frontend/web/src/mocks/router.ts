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
import type { z } from "zod";
import { fakeAnnotations } from "@rhymelab/fixtures";
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
 * identical to the caller. Shared by every by-id procedure (`get`, the updates,
 * `delete`).
 */
function entryOr404(id: string): MockEntry {
  const entry = db.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new ORPCError("NOT_FOUND");
  return entry;
}

/**
 * A stable numeric seed derived from an entry's id, so each piece gets its own
 * reproducible annotation set — and marks never collide on `id` across entries.
 * A plain rolling hash; reproducibility, not cryptographic strength.
 */
function annotationSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Project a stored row onto the detail shape: drop the list-view-only derived
 * fields (`excerpt`/`lineCount`/`wordCount`) and attach the `structure` the
 * detail view renders. The stored row always carries a real `body`, so the
 * result is a complete `EntryDetail`.
 *
 * `annotations` are derived on read like `structure` is: nothing stores them yet
 * (see {@link AnnotationSchema}), so the mock stands in a seeded set anchored to
 * this body, stable across reads. The real API returns `[]`.
 */
function toDetail(entry: MockEntry, structure: SectionType[]): EntryDetail {
  const { excerpt: _excerpt, lineCount: _lineCount, wordCount: _wordCount, ...detail } = entry;
  return {
    ...detail,
    structure,
    annotations: fakeAnnotations(entry.body, { seed: annotationSeed(entry.id) }),
  };
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

const stubRouter = buildStubRouter(
  contract as unknown as Record<string, unknown>,
  os as unknown as Record<string, unknown>,
) as ConstructorParameters<typeof OpenAPIHandler>[0];
const stubHandler = new OpenAPIHandler(stubRouter);

/** The shape of an `os.*` leaf — the builder whose `.handler()` mounts a procedure. */
interface Implementer {
  handler(handler: () => unknown): unknown;
}
