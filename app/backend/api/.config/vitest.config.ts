import { defineConfig } from "vitest/config";

// Configs live in `.config/` but Vitest's `root` stays the project root (cwd),
// so the `include`/`exclude` globs below are written relative to the package
// root (matching the web package's convention).
//
// Two projects keep the fast unit run completely DB-free:
//
//   - `unit`        — the mocked, database-free tests. It explicitly *excludes*
//                     `*.integration.test.ts`, so `pnpm test` never needs Postgres.
//   - `integration` — the DB-backed tests that hit the real local Postgres. Env
//                     loading, the DB ping, and cleanup/disconnect live in the
//                     shared `setupFiles` handler, so the test files hold
//                     assertions only.
//
// `pnpm test` filters to `--project unit`; `pnpm test:integration` filters to
// `--project integration`. Running `vitest` with no filter runs both (and thus
// needs a database), which is why the scripts always pass `--project`.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          // Global before/after hooks (env, DB ping, cleanup, disconnect) shared
          // by every integration test file.
          setupFiles: ["src/test-support/integration-setup.ts"],
          // These talk to a real database; give the connect/ping room to breathe
          // on a cold Postgres.
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
    ],
  },
});
