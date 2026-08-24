# End-to-end tests (Playwright)

Full-stack browser tests that drive the real app the way a person does — as
opposed to the component/integration tests under `src/**` (Vitest browser mode,
mocked network). These hit a running web app, a running API, and a real Postgres.

Most of these are **recorded**: you click through the app, Playwright's codegen
captures the actions, and Claude cleans the raw output into a real test. See the
`record-e2e` skill (`/record-e2e`) — or just ask Claude to "record an e2e test".

## Prerequisites (bring the stack up yourself)

The test runner deliberately does **not** own the database. Start the stack the
same way you do for normal dev:

```bash
docker compose up -d           # Postgres on :5433
pnpm db:migrate                # once, or after schema changes
pnpm dev:api                   # API on :4000
pnpm dev:web                   # web on :3000
```

Set the app password so the auth step can sign in (same value as `PASSWORD` in
`app/backend/api/.config/.env`):

```bash
export E2E_APP_PASSWORD='your-app-password'
```

## Running

```bash
pnpm --filter @rhymelab/web e2e            # run all specs (headless)
pnpm --filter @rhymelab/web e2e:ui         # interactive UI mode
pnpm --filter @rhymelab/web e2e:report     # open the last HTML report
```

The first run executes `auth.setup.ts`, which logs in over the API and writes
`e2e/.auth/state.json` (git-ignored). Every spec then starts already signed in.
Delete that file to force a fresh login.

## Recording a new flow

```bash
pnpm --filter @rhymelab/web e2e:record     # opens codegen at localhost:3000
```

To record a signed-in flow, load the saved session first so you don't hit the
auth wall:

```bash
pnpm --filter @rhymelab/web exec playwright codegen \
  --target playwright-test \
  --load-storage app/frontend/web/e2e/.auth/state.json \
  http://localhost:3000/home
```

Click through the app, then copy the generated code out. Raw codegen output is
verbose and has no assertions — hand it to the `record-e2e` skill (or Claude) to
turn it into a maintainable spec: role/label locators, real `expect`s, a
meaningful name, dropped into this directory.

## Layout

- `auth.setup.ts` — logs in once, saves the session (the `setup` project).
- `*.spec.ts` — the tests, run signed-in from that saved session.
- `.auth/` — saved storage state (git-ignored).
- Config lives at `.config/playwright.config.ts`.
