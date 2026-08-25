/**
 * The MSW browser worker and its one-time starter.
 *
 * `worker` registers the Service Worker (`public/mockServiceWorker.js`, generated
 * by `msw init`) that intercepts every fetch the page makes — including the
 * cross-origin call to the oRPC endpoint. In the app it's started on demand by
 * the oRPC link when `?__mock` is set; the Vitest setup starts it directly for
 * every integration test.
 */
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

let starting: Promise<unknown> | undefined;

/**
 * Start the worker once and reuse that start for every later call, so the first
 * mock-mode fetch registers the Service Worker and the rest just await it.
 * Idempotent — safe to call before every fetch.
 */
export function startMockWorker(): Promise<unknown> {
  starting ??= worker.start({
    quiet: true,
    // A mocked page makes lots of non-API requests (HMR, assets, the worker
    // script itself); only the oRPC calls are ours to answer, so let everything
    // else through silently rather than warning per request.
    onUnhandledRequest: "bypass",
  });
  return starting;
}
