/**
 * MSW request handlers for the oRPC API.
 *
 * Rather than hand-craft oRPC's wire envelope, we mount a real server-side
 * `RPCHandler` — built by `implement`-ing the shared contract — and let it speak
 * the protocol. MSW intercepts the browser's fetch to the RPC endpoint and hands
 * the request to that handler, so serialisation and routing match production
 * exactly. The procedures read from an in-memory `store` that tests seed.
 *
 * The annotation + reconciler logic is NOT re-implemented here: the mock applies
 * the same pure plans (`planSetLineGroups`/`planClearLines`, and `reconcile` →
 * `resolvePlan` for lyrics saves) the backend does (D-22), so a passing test
 * exercises the real replace-at-line / X-exclusivity / duplicate lifecycle.
 */
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { http, passthrough } from "msw";
import {
  InvalidLineAddressError,
  defaultSectionLabel,
  makeWriteContext,
  parseLines,
  planClearLines,
  planSetLineGroups,
  reconcile,
  resolvePlan,
  type ExistingAnnotation,
  type ReconcileAnnotation,
  type ReconcileSection,
  type ReconcilePlan,
  type WriteSection,
} from "@rhymelab/core";
import {
  contract,
  type AnnotationDTO,
  type ClearLinesInput,
  type EntryDetail,
  type EntrySummary,
  type SectionDTO,
  type SetLineGroupsInput,
} from "@rhymelab/api-contract";

/** Base URL the oRPC client targets (see `src/lib/orpc.ts`). */
export const RPC_URL = "http://localhost:4000/rpc";

/** Backing data the mocked procedures read from. Tests seed it via `seedEntry`. */
export const store = {
  entries: new Map<number, EntryDetail>(),
  /** Monotonic id sources (never reused, like the DB sequences). */
  annotationSeq: 0,
  sectionSeq: 0,
  /** What `auth.me` reports — flip to exercise the redirect guard. */
  authed: true,
};

/** Put an entry in the store so `entries.get`/`entries.list` return it. */
export function seedEntry(entry: EntryDetail): EntryDetail {
  store.entries.set(entry.id, entry);
  for (const a of entry.annotations) store.annotationSeq = Math.max(store.annotationSeq, a.id);
  for (const s of entry.sections) store.sectionSeq = Math.max(store.sectionSeq, s.id);
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
  store.sectionSeq = 0;
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

/** Run a core plan fn, mapping its address-validation error to a 400 like the backend. */
function planOr400<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof InvalidLineAddressError) {
      throw new ORPCError("BAD_REQUEST", { message: "Each selection must be a whole line" });
    }
    throw err;
  }
}

/* --- store <-> reconciler mapping (kept in lockstep with the backend DTOs) --- */

const toWriteSections = (entry: EntryDetail): WriteSection[] =>
  entry.sections.map((s) => ({
    id: s.id,
    startOffset: s.startOffset,
    endOffset: s.endOffset,
    canonicalSectionId: s.canonicalSectionId,
  }));

const toExisting = (entry: EntryDetail): ExistingAnnotation[] =>
  entry.annotations.map((a) => ({
    id: a.id,
    sectionId: a.sectionId,
    lineInSection: a.lineInSection,
    startChar: a.startChar,
    endChar: a.endChar,
    value: a.value,
    detached: a.detached,
  }));

/** A section's non-blank line texts (for recomputing an unlinked copy's quote). */
function sectionLineTexts(lyrics: string, startOffset: number, endOffset: number): string[] {
  return parseLines(lyrics)
    .filter((l) => !l.blank && l.start >= startOffset && l.end <= endOffset)
    .map((l) => l.text);
}

/** Apply a reconcile plan to the store entry (mirrors the backend's applyPlan). */
function applyPlanToEntry(entry: EntryDetail, plan: ReconcilePlan): number {
  const { sections, annotations } = resolvePlan(
    plan,
    () => (store.sectionSeq += 1),
    () => (store.annotationSeq += 1),
  );
  const wasAttached = new Map(entry.annotations.map((a) => [a.id, !a.detached]));
  let detached = 0;
  for (const a of plan.annotations) {
    if (a.id !== null && a.detached && wasAttached.get(a.id)) detached++;
  }

  entry.lyrics = plan.newLyrics;
  entry.sections = sections
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(
      (s): SectionDTO => ({
        id: s.id,
        orderIndex: s.orderIndex,
        label: defaultSectionLabel(s.orderIndex + 1),
        startOffset: s.startOffset,
        endOffset: s.endOffset,
        canonicalSectionId: s.canonicalSectionId,
        manualUnlink: s.manualUnlink,
      }),
    );
  entry.annotations = annotations
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(
      (a): AnnotationDTO => ({
        id: a.id,
        sectionId: a.sectionId,
        lineInSection: a.lineInSection,
        startChar: a.startChar,
        endChar: a.endChar,
        quote: a.quote,
        value: a.value as AnnotationDTO["value"],
        detached: a.detached,
      }),
    );
  return detached;
}

/**
 * Only the procedures a page render or its exercised interactions perform are
 * implemented. Add mutations here as tests need them — an un-implemented procedure
 * won't match, and the MSW handler below turns that into a loud unhandled-request
 * error.
 */
const router = {
  auth: {
    me: os.auth.me.handler(() => ({ authed: store.authed })),
  },
  entries: {
    list: os.entries.list.handler(() => [...store.entries.values()].map(toSummary)),
    get: os.entries.get.handler(({ input }) => store.entries.get(input.id) ?? null),

    // REPLACE-at-line assign, applying the shared core plan (with the duplicate
    // write-redirect) to the stored entry in place.
    setLineGroups: os.entries.setLineGroups.handler(({ input }) => {
      onSetLineGroups?.(input);
      const entry = requireEntry(input.entryId);
      checkVersion(entry, input.version);
      const ctx = makeWriteContext(entry.lyrics, toWriteSections(entry));
      const plan = planOr400(() => planSetLineGroups(ctx, toExisting(entry), input.items));
      const del = new Set(plan.deleteIds);
      entry.annotations = entry.annotations.filter((a) => !del.has(a.id));
      for (const ins of plan.inserts) {
        store.annotationSeq += 1;
        entry.annotations.push({
          id: store.annotationSeq,
          sectionId: ins.sectionId,
          lineInSection: ins.lineInSection,
          startChar: ins.startChar,
          endChar: ins.endChar,
          quote: ins.quote,
          value: ins.value,
          detached: false,
        });
      }
      return { ok: true as const };
    }),

    // Hard-delete the whole-line rows at the given line addresses.
    clearLines: os.entries.clearLines.handler(({ input }) => {
      onClearLines?.(input);
      const entry = requireEntry(input.entryId);
      checkVersion(entry, input.version);
      const ctx = makeWriteContext(entry.lyrics, toWriteSections(entry));
      const plan = planOr400(() => planClearLines(ctx, toExisting(entry), input.items));
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

    // Save lyrics: run the SAME reconciler the backend does and apply its plan.
    saveLyrics: os.entries.saveLyrics.handler(({ input }) => {
      const entry = requireEntry(input.id);
      checkVersion(entry, input.version);
      const oldSections: ReconcileSection[] = entry.sections.map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
        canonicalSectionId: s.canonicalSectionId,
        manualUnlink: s.manualUnlink,
      }));
      const oldAnnotations: ReconcileAnnotation[] = entry.annotations.map((a) => ({
        id: a.id,
        sectionId: a.sectionId,
        lineInSection: a.lineInSection,
        startChar: a.startChar,
        endChar: a.endChar,
        quote: a.quote,
        value: a.value,
        detached: a.detached,
      }));
      const plan = reconcile(entry.lyrics, oldSections, oldAnnotations, input.lyrics);
      const detached = applyPlanToEntry(entry, plan);
      entry.version += 1;
      entry.updatedAt += 1;
      return { ok: true as const, detached, version: entry.version };
    }),

    // Unlink a duplicate: copy the canonical's rows down, stand the section alone.
    unlinkSection: os.entries.unlinkSection.handler(({ input }) => {
      const entry = requireEntry(input.entryId);
      checkVersion(entry, input.version);
      const section = entry.sections.find((s) => s.id === input.sectionId);
      if (!section) throw new ORPCError("NOT_FOUND", { message: "Section not found" });
      if (section.canonicalSectionId === null) return { ok: true as const };

      const lines = sectionLineTexts(entry.lyrics, section.startOffset, section.endOffset);
      const canonRows = entry.annotations.filter(
        (a) =>
          a.sectionId === section.canonicalSectionId && !a.detached && a.lineInSection !== null,
      );
      for (const r of canonRows) {
        store.annotationSeq += 1;
        const line = lines[r.lineInSection!] ?? "";
        entry.annotations.push({
          id: store.annotationSeq,
          sectionId: section.id,
          lineInSection: r.lineInSection,
          startChar: r.startChar,
          endChar: r.endChar,
          quote: r.startChar === null ? line : line.slice(r.startChar, r.endChar ?? undefined),
          value: r.value,
          detached: false,
        });
      }
      section.canonicalSectionId = null;
      section.manualUnlink = true;
      return { ok: true as const };
    }),

    // Relink a section to its group: delete its own rows, re-share the canonical's.
    relinkSection: os.entries.relinkSection.handler(({ input }) => {
      const entry = requireEntry(input.entryId);
      checkVersion(entry, input.version);
      const section = entry.sections.find((s) => s.id === input.sectionId);
      if (!section) throw new ORPCError("NOT_FOUND", { message: "Section not found" });
      const text = entry.lyrics.slice(section.startOffset, section.endOffset);
      const canonical = entry.sections.find(
        (s) =>
          s.id !== section.id &&
          s.canonicalSectionId === null &&
          !s.manualUnlink &&
          entry.lyrics.slice(s.startOffset, s.endOffset) === text,
      );
      if (canonical) {
        entry.annotations = entry.annotations.filter((a) => a.sectionId !== section.id);
        section.canonicalSectionId = canonical.id;
        section.manualUnlink = false;
      } else {
        section.manualUnlink = false;
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
