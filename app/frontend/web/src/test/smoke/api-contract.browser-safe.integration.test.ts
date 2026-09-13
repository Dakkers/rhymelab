/**
 * Browser-safety smoke test.
 *
 * The shared `@rhymelab/api-contract` is imported by browser code (`./orpc`, and
 * through it every route). It MUST NOT drag the Prisma **client runtime** into
 * the client bundle: `PrismaClient` is Node-only and throws on load in a browser
 * (`fileURLToPath is not a function`), which crashes client bootstrap before
 * React hydrates — leaving the page as inert SSR HTML where no menu, drawer, or
 * button responds.
 *
 * Runs in the real browser project so "loads in a browser" is what's actually
 * tested. It fails if the contract import throws, and if the Prisma client
 * runtime is ever fetched — the guard on the `@rhymelab/database` root-export
 * (client + schemas) vs its browser-safe `/schemas` subpath.
 */
import { expect, test } from "vitest";

/** The optimized-dep and source spellings of the Node-only Prisma client. */
const PRISMA_CLIENT_RUNTIME = /prisma.*client.*runtime|_generated\/prisma\/client/i;

test("importing @rhymelab/api-contract does not pull the Prisma client runtime", async () => {
  const contractModule = await import("@rhymelab/api-contract");
  expect(contractModule.contract).toBeDefined();

  const prismaClientResources = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => PRISMA_CLIENT_RUNTIME.test(name));

  expect(prismaClientResources).toEqual([]);
});
