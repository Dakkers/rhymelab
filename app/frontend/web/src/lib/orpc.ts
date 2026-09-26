/**
 * The oRPC client and TanStack Query utils for the API.
 *
 * During SSR the Worker has no cookie jar, so the incoming request's `Cookie`
 * header is forwarded.
 *
 * Mock mode (dev only): add `?__mock` to any URL to answer API calls from
 * `#/mocks` instead of the backend. The mock imports MUST stay behind
 * `import.meta.env.DEV` so production builds drop them.
 */
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient, JsonifiedValue } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import {
  contract,
  type LyricEntryListItem,
  type ReadLyricEntryDetail,
} from "@rhymelab/api-contract";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const MOCK_PARAM = "__mock";

function serverMockEnabled(): boolean {
  try {
    return getRequestUrl().searchParams.has(MOCK_PARAM);
  } catch {
    return false;
  }
}

const getLink = createIsomorphicFn()
  .client(() => {
    const mockEnabled =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has(MOCK_PARAM);

    return new OpenAPILink(contract, {
      url: API_URL,
      fetch: async (request, init) => {
        if (import.meta.env.DEV && mockEnabled) {
          const { startMockWorker } = await import("#/mocks/browser");
          await startMockWorker();
        }
        return globalThis.fetch(request, { ...init, credentials: "include" });
      },
    });
  })
  .server(
    () =>
      new OpenAPILink(contract, {
        url: API_URL,
        headers: () => {
          const cookie = getRequestHeaders().get("cookie");
          return cookie ? { cookie } : {};
        },
        fetch: async (request, init) => {
          if (import.meta.env.DEV && serverMockEnabled()) {
            const { dispatchMock } = await import("#/mocks/router");
            const response = await dispatchMock(
              request instanceof Request ? request : new Request(request, init),
            );
            if (response) return response;
          }
          return globalThis.fetch(request, init);
        },
      }),
  );

export const client: JsonifiedClient<ContractRouterClient<typeof contract>> =
  createORPCClient(getLink());

export const orpc = createTanstackQueryUtils(client);

/** A lyric entry detail as the client receives it. Timestamps are ISO strings. */
export type ReadLyricEntryDetailJson = JsonifiedValue<ReadLyricEntryDetail>;

/** A library list item as the client receives it. Timestamps are ISO strings. */
export type LyricEntryListItemJson = JsonifiedValue<LyricEntryListItem>;
