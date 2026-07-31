import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Configs live in `.config/`, but paths below are anchored to the package root
// (the same convention as `vitest.config.ts`). `webRoot` is `app/frontend/web/`;
// `repoRoot` is the monorepo root where the `dev:web` script lives.
const fromWebRoot = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

// CI (GitHub Actions, …) sets `CI`. On a dev machine it's unset, so runs are
// headed and reuse whatever dev stack you already have up; CI runs headless and
// insists on its own fresh server. Mirrors the `isCI` split in `vitest.config.ts`.
const isCI = !!process.env.CI;

// Where the app is served. Override for staging/preview with PLAYWRIGHT_BASE_URL.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Saved session cookie produced by `e2e/auth.setup.ts`. Every real spec reuses
// it so tests start already signed in instead of logging in each time.
const STORAGE_STATE = fromWebRoot("e2e/.auth/state.json");

export default defineConfig({
  testDir: fromWebRoot("e2e"),
  // Recorder output and traces are local artifacts (git-ignored).
  outputDir: fromWebRoot("test-results"),
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [["html", { outputFolder: fromWebRoot("playwright-report"), open: "never" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    // A trace is a full record of a failed run (DOM, network, console) you can
    // replay with `pnpm --filter @rhymelab/web e2e:report`. Kept only on retry
    // to avoid the overhead on the happy path.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // 1. Mint the auth state once. Everything else depends on this.
    { name: "setup", testMatch: /auth\.setup\.ts$/ },

    // 2. The real specs, running signed-in from the saved storage state.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts$/,
    },
  ],

  // Attaches to your already-running `pnpm dev:web` when there is one (the usual
  // case while recording); otherwise starts it. The API (:4000) and its Postgres
  // are prerequisites you bring up yourself — see `e2e/README.md` — because a
  // test runner shouldn't own a stateful database's lifecycle.
  webServer: {
    command: "pnpm dev:web",
    cwd: repoRoot,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
