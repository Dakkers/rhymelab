---
name: record-e2e
description: >-
  Record a Playwright end-to-end test by clicking through the running app, then
  refine the raw codegen output into a maintainable spec in app/frontend/web/e2e.
  Use when the user wants to record an E2E test, capture their clicks or
  navigation into a test file, use Playwright's recorder/codegen, or turn a
  manual walkthrough of the app into a test.
---

# Record an E2E test

The division of labor: **the user records** (they click through the real app),
**Playwright codegen captures** the raw actions, and **you refine** that raw
output into a real test. The refining is the point — codegen output is verbose
and has essentially no assertions. Do not try to "record" on the user's behalf;
you can't see their browser. Launch the recorder, wait, then clean up what it
produced.

Everything lives in the `@rhymelab/web` package: config at
`app/frontend/web/.config/playwright.config.ts`, specs in
`app/frontend/web/e2e/`. See `app/frontend/web/e2e/README.md` for the full setup.

## 1. Preflight

Confirm the stack the recording will run against is up. E2E needs all three:

- Postgres — `docker compose up -d` (host `:5433`)
- API — `pnpm dev:api` (`:4000`)
- Web — `pnpm dev:web` (`:3000`)

Quick check: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000`.
If it's not up, tell the user what to start rather than starting the database
for them.

For a **signed-in** recording (anything under `/library` or `/entries/*`), you
need the saved session at `app/frontend/web/e2e/.auth/state.json`. If it's
missing, mint it — this requires `E2E_APP_PASSWORD` in the env (same value as
`PASSWORD` in `app/backend/api/.env`; ask the user, never guess it):

```bash
pnpm --filter @rhymelab/web exec playwright test \
  --config .config/playwright.config.ts --project=setup
```

## 2. Record

Ask the user what flow to record and which URL to start at. Launch codegen in
the background so the window opens and you're notified when they close it.
Write the raw output to the scratchpad, not into the repo.

Signed-in (load the saved session so they don't hit the auth wall):

```bash
pnpm --filter @rhymelab/web exec playwright codegen \
  --target playwright-test \
  --load-storage app/frontend/web/e2e/.auth/state.json \
  --output <SCRATCHPAD>/recording.spec.ts \
  http://localhost:3000/<start-path>
```

Signed-out flows: drop `--load-storage`. Tell the user: **click through the
flow, then close the browser window** — closing it flushes the file.

## 3. Refine (the actual work)

Read the raw file and rewrite it into a proper spec. Match the existing house
style in `app/frontend/web/e2e/library.spec.ts` and the heavily-commented tests
under `src/**`:

- **Locators**: replace generated CSS/`nth-child`/`.locator("div > …")` with
  `getByRole` / `getByLabel` / `getByText`. Prefer accessible names.
- **Assertions**: add the ones codegen omits. After a navigation assert the URL
  and a visible landmark; after an action assert the resulting state (a value,
  a badge, a row count) — not just that the click happened.
- **Structure**: one `test(...)` with a behavioral name ("assigns a rhyme group
  to a line", not "test"). Split genuinely separate journeys into separate
  tests. Drop redundant waits and duplicate navigations.
- **Comments**: explain *why* a step matters, in the repo's voice.
- Save to `app/frontend/web/e2e/<feature>.spec.ts`.

## 4. Verify

Run it and iterate until green:

```bash
pnpm --filter @rhymelab/web e2e <feature>.spec.ts
```

On failure, open the trace with `pnpm --filter @rhymelab/web e2e:report` to see
what the run actually did, fix the spec (or flag a real app bug), and rerun.
Show the user the passing result and the final file.

## Notes

- Playwright + browsers are already installed; no `playwright install` needed.
- The session cookie file is git-ignored — never commit `e2e/.auth/`.
- Keep these separate from the Vitest browser tests in `src/**`: those mock the
  network (MSW) and render components; these drive the real running stack.
