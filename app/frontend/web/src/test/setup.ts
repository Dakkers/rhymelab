/**
 * Global setup for the `integration` Vitest project (browser mode).
 *
 * - Extends `expect` with jest-dom matchers (`toBeInTheDocument`, …).
 * - Starts the MSW worker once, then resets handlers + the mock DB and unmounts
 *   the React tree between tests so each one is fully isolated.
 */
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { worker } from "#/mocks/browser";
import { resetDb } from "#/mocks/db";
import { API_URL } from "#/mocks/router";

const keepDom = Boolean(import.meta.env.VITE_KEEP_DOM);

beforeAll(async () => {
  await worker.start({
    quiet: true,
    onUnhandledRequest(request, print) {
      if (request.url.startsWith(API_URL)) print.error();
    },
  });
});

if (keepDom) {
  beforeEach(() => cleanup());
}

afterEach(() => {
  if (!keepDom) cleanup();
  worker.resetHandlers();
  resetDb();
});

afterAll(() => {
  worker.stop();
});
