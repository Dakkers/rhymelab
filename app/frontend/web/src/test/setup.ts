/**
 * Global setup for the `integration` Vitest project (browser mode).
 *
 * - Extends `expect` with jest-dom matchers (`toBeInTheDocument`, …).
 * - Starts the MSW worker once, then resets handlers + store and unmounts the
 *   React tree between tests so each one is fully isolated.
 */
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { worker } from "./mocks/browser";
import { RPC_URL, resetStore } from "./mocks/handlers";

// Set by the `test:debug` script (VITEST_KEEP_DOM=1) and baked in via the config.
// When on, the last test's rendered DOM is left mounted so you can inspect it in
// the headed browser rather than having it unmount the moment the test finishes.
const keepDom = Boolean(import.meta.env.VITE_KEEP_DOM);

beforeAll(async () => {
  await worker.start({
    quiet: true,
    // Vitest serves its own modules/assets through the page, so only complain
    // about API calls we forgot to mock — let everything else pass through.
    onUnhandledRequest(request, print) {
      if (request.url.startsWith(RPC_URL)) print.error();
    },
  });
});

// In keep-DOM mode, isolate tests by unmounting the *previous* render before each
// test instead of after — so a test still starts clean, but the final render is
// left on screen for inspection.
if (keepDom) {
  beforeEach(() => cleanup());
}

afterEach(() => {
  if (!keepDom) cleanup();
  worker.resetHandlers();
  resetStore();
});

afterAll(() => {
  worker.stop();
});
