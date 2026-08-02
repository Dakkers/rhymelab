import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

// Configs live in `.config/` but Vite's `root` stays the project root (cwd), so
// paths below are written relative to the package root.
const fromRoot = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// CI (GitHub Actions, GitLab, …) sets `CI`. On a dev machine it's unset, so the
// tests open a real browser window you can watch; on CI they run headless.
const isCI = !!process.env.CI;

// This is a test-only config, deliberately separate from `.config/vite.config.ts`:
// the app build wires in the Cloudflare/TanStack-Start plugins that run the code
// inside a Worker, which browser-mode tests neither need nor can use. Here we
// keep just React Fast Refresh + path resolution.
export default defineConfig({
  define: {
    // Surface the debug flag to the browser-side setup file. Read from the shell
    // env at config load (Node), baked into the bundle. When set (see the
    // `test:debug` script), the last test's rendered DOM is left mounted so you
    // can inspect it in the headed browser instead of it being unmounted.
    "import.meta.env.VITE_KEEP_DOM": JSON.stringify(process.env.VITEST_KEEP_DOM ?? ""),
  },
  resolve: {
    // Vite 8 native `paths` resolution — provides the `#/*` alias from tsconfig.
    tsconfigPaths: true,
    alias: [
      // The oRPC link imports `createIsomorphicFn` from the main entry and
      // `getRequestHeaders` from the `/server` entry. Both real modules drag Node
      // built-ins (`AsyncLocalStorage`) into the browser bundle; the Start Vite
      // plugin normally strips them, but this config omits that plugin. The
      // stubs supply just those two symbols with browser-safe implementations.
      // Order matters: the `/server` subpath must be matched before the bare
      // entry so the more specific pattern wins.
      {
        find: /^@tanstack\/react-start\/server$/,
        replacement: fromRoot("src/test/stubs/react-start-server.ts"),
      },
      {
        find: /^@tanstack\/react-start$/,
        replacement: fromRoot("src/test/stubs/react-start.ts"),
      },
    ],
  },
  plugins: [viteReact()],
  test: {
    // One project per test kind. `integration` runs in a real browser; a `unit`
    // project (jsdom/node) can be added alongside it later.
    projects: [
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            // Render at a small-desktop size so the workbench lays out with its
            // two-column (main + inspector) layout rather than the ≤900px stacked
            // one — the workbench tests assert against the desktop layout.
            viewport: { width: 1366, height: 768 },
            // Headless on CI; headed (visible browser) on a desktop dev machine.
            headless: isCI,
            // Test failures are reported in the terminal; skip screenshot files.
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
