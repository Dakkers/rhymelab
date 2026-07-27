/**
 * Every read in the app as a `queryOptions`, so a route loader can prefetch it
 * (`ensureQueryData`) and a component can subscribe to the same cache entry
 * (`useSuspenseQuery`). Keys are hierarchical: `['entries']` covers both the
 * list and every detail page.
 */
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { getEntry, listEntries } from "#/server/entries";

export const q = {
  entries: {
    /** Prefix that invalidates the list *and* every detail page. */
    all: () => ["entries"] as const,
    list: () =>
      queryOptions({
        queryKey: ["entries", "list"] as const,
        queryFn: () => listEntries(),
      }),
    detail: (id: number) =>
      queryOptions({
        queryKey: ["entries", "detail", id] as const,
        queryFn: () => getEntry({ data: { id } }),
      }),
  },
} as const;

/** Refetch the library list (a create/delete/meta change alters cards). */
export function invalidateEntries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["entries", "list"] });
}

/** Refetch one entry's detail plus the list (titles/counts on cards can move). */
export function invalidateEntry(queryClient: QueryClient, id: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["entries", "detail", id] }),
    queryClient.invalidateQueries({ queryKey: ["entries", "list"] }),
  ]);
}
