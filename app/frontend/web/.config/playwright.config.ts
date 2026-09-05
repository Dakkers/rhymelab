import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const fromWebRoot = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

const isCI = !!process.env.CI;

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const STORAGE_STATE = fromWebRoot("e2e/.auth/state.json");

export default defineConfig({
  testDir: fromWebRoot("e2e"),
  outputDir: fromWebRoot("test-results"),
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [["html", { outputFolder: fromWebRoot("playwright-report"), open: "never" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },

    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts$/,
    },
  ],

  webServer: {
    command: "pnpm dev:web",
    cwd: repoRoot,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
