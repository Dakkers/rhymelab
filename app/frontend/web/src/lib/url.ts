/**
 * Wire contracts for the URL itself: dynamic path segments and search params.
 * `./schemas` covers what the client *sends* to a server function; this covers
 * what the router reads out of the address bar. Both are zod, so a route's
 * params and search are typed end to end — loaders and components receive real
 * values (`entryId` is a `number`) and never re-parse a string.
 *
 * Two deliberate behaviours:
 *
 * - **Segments fail closed.** `parse` returning `false` tells the router the
 *   route doesn't match, so `/entries/abc` renders the app's 404 rather than a
 *   page that has to guard a malformed id on every render.
 * - **Search fails open.** A hand-edited `?view=nonsense` falls back to the
 *   default via `.catch()` instead of throwing an error boundary at someone who
 *   only mistyped a query string.
 */
import { z } from "zod";
import { RHYME_VIEWS, type RhymeView } from "@rhymelab/core";

/* ------------------------------------------------------------------ */
/* Path segments                                                       */
/* ------------------------------------------------------------------ */

/** `/entries/:entryId` — digits only, and within the safe-integer range. */
const entryIdSegment = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.int().positive());

/**
 * `params` options for every route under `/entries/$entryId`. `parse` runs
 * during matching (a bad id means "no match"); `stringify` is the inverse, so
 * links pass the id as a number: `params={{ entryId: entry.id }}`.
 */
export const entryIdParams = {
  parse: (raw: { entryId: string }): { entryId: number } | false => {
    const result = entryIdSegment.safeParse(raw.entryId);
    return result.success ? { entryId: result.data } : false;
  },
  stringify: (params: { entryId: number }) => ({ entryId: String(params.entryId) }),
};

/* ------------------------------------------------------------------ */
/* Search params                                                       */
/* ------------------------------------------------------------------ */

/** The workbench draws rhyme groups in colour by default. */
export const WORKBENCH_SEARCH_DEFAULTS = {
  view: "colours",
} satisfies { view: RhymeView };

/**
 * `/entries/:entryId?view=` — how rhyme groups are drawn (tinted lines vs A/B/C
 * letters). In the URL so a view is linkable and survives a reload; the key is
 * stripped when it holds its default (see the route's `search.middlewares`),
 * keeping a plain `/entries/12` clean.
 */
export const workbenchSearch = z.object({
  // `.default` fills in a key that isn't there (and keeps it optional for
  // `<Link>`); `.catch` absorbs one that is there but nonsense.
  view: z
    .enum(RHYME_VIEWS)
    .default(WORKBENCH_SEARCH_DEFAULTS.view)
    .catch(WORKBENCH_SEARCH_DEFAULTS.view),
});

export type WorkbenchSearch = z.infer<typeof workbenchSearch>;
