/**
 * Every read in the app as `queryOptions`, so a route loader can prefetch it
 * (`ensureQueryData`) and a component can subscribe to the same cache entry
 * (`useSuspenseQuery`). Built on the oRPC TanStack Query utils (`orpc`), which
 * own the query keys.
 */
import { type QueryClient } from "@tanstack/react-query";
import { orpc } from "./orpc";

export const q = {
  entries: {
    list: () => orpc.entries.list.queryOptions(),
    detail: (id: number) => orpc.entries.get.queryOptions({ input: { id } }),
  },
} as const;

/** Refetch the library list (a create/delete/meta change alters cards). */
export function invalidateEntries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: orpc.entries.list.key() });
}

/** Refetch one entry's detail plus the list (titles/counts on cards can move). */
export function invalidateEntry(queryClient: QueryClient, id: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.entries.get.key({ input: { id } }) }),
    queryClient.invalidateQueries({ queryKey: orpc.entries.list.key() }),
  ]);
}
