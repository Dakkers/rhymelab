/**
 * Browser-test stand-in for `@tanstack/react-start/server`.
 *
 * `src/lib/orpc.ts` imports `getRequestHeaders` at the top level for the oRPC
 * link's SSR branch (it forwards the incoming request's cookie during server
 * rendering). That branch never executes in a browser integration test, but the
 * real module re-exports `@tanstack/start-server-core`, which pulls in Node
 * built-ins the browser bundle can't resolve. The Vitest config aliases the
 * subpath here so the import resolves to this no-op instead.
 */

/** Never called under test — the client link branch is the one that runs. */
export function getRequestHeaders(): Headers {
  return new Headers();
}
