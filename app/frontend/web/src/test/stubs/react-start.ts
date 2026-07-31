/**
 * Browser-test stand-in for the `@tanstack/react-start` main entry.
 *
 * `src/lib/orpc.ts` needs only `createIsomorphicFn` from this package, but the
 * real entry's module graph instantiates a Node `AsyncLocalStorage` at load
 * time (via `@tanstack/start-storage-context`), which throws in a browser
 * bundle. The Vitest config aliases the entry here.
 *
 * This reimplements `createIsomorphicFn` (a pure builder, no runtime deps) so
 * that the *client* branch wins when both are defined — matching what the
 * TanStack Start Vite plugin emits for a client build, which is the environment
 * a browser test stands in for.
 */

type AnyFn = (...args: unknown[]) => unknown;

interface IsomorphicBuilder extends AnyFn {
  client: (impl: AnyFn) => IsomorphicBuilder;
  server: (impl: AnyFn) => IsomorphicBuilder;
}

function build(clientImpl?: AnyFn, serverImpl?: AnyFn): IsomorphicBuilder {
  const fn = ((...args: unknown[]) => (clientImpl ?? serverImpl)?.(...args)) as IsomorphicBuilder;
  fn.client = (impl) => build(impl, serverImpl);
  fn.server = (impl) => build(clientImpl, impl);
  return fn;
}

export function createIsomorphicFn(): IsomorphicBuilder {
  return build();
}
