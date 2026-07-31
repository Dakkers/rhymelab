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
 * - **Search fails open.** A hand-edited `?mode=nonsense` falls back to the
 *   default via `.catch()` instead of throwing an error boundary at someone who
 *   only mistyped a query string.
 */
import { z } from "zod";
import { RHYME_VIEWS, VIEW_MODES, type RhymeView, type ViewMode } from "@rhymelab/core";

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

/** The workbench opens on the rhyme layer, drawn in colour. */
export const WORKBENCH_SEARCH_DEFAULTS = {
  mode: "rhyme-structure",
  view: "colours",
} satisfies { mode: ViewMode; view: RhymeView };

/**
 * `/entries/:entryId?mode=&view=` — which annotation layer the workbench shows
 * and how rhyme groups are drawn. In the URL so a view is linkable and survives
 * a reload; both keys are stripped from the URL when they hold their default
 * (see the route's `search.middlewares`), keeping a plain `/entries/12` clean.
 */
export const workbenchSearch = z.object({
  // `.default` fills in a key that isn't there (and keeps it optional for
  // `<Link>`); `.catch` absorbs one that is there but nonsense.
  mode: z
    .enum(VIEW_MODES)
    .default(WORKBENCH_SEARCH_DEFAULTS.mode)
    .catch(WORKBENCH_SEARCH_DEFAULTS.mode),
  view: z
    .enum(RHYME_VIEWS)
    .default(WORKBENCH_SEARCH_DEFAULTS.view)
    .catch(WORKBENCH_SEARCH_DEFAULTS.view),
});

export type WorkbenchSearch = z.infer<typeof workbenchSearch>;
