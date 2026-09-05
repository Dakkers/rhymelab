import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

const fromRoot = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const isCI = !!process.env.CI;

export default defineConfig({
  define: {
    "import.meta.env.VITE_KEEP_DOM": JSON.stringify(process.env.VITEST_KEEP_DOM ?? ""),
  },
  resolve: {
    tsconfigPaths: true,
    alias: [
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
            viewport: { width: 1366, height: 768 },
            headless: isCI,
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
