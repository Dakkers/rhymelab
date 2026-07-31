---
name: playwright-to-vitest
description: >-
  Convert a Playwright test, codegen output, or loose page.* commands into a
  Vitest browser-mode integration test in this repo's house style
  (renderRoute + Testing Library + MSW). Use when the user wants to convert,
  port, translate, or rewrite Playwright/E2E into Vitest, turn a recorded spec
  into a component/integration test, or move a flow off the live stack onto the
  mocked test setup.
---

# Convert Playwright → Vitest

This is **not a 1:1 transpile**, and you should not pretend it is. The two test
kinds do fundamentally different things:

- **Playwright (E2E)** drives the *real running stack* — live web + API +
  Postgres, real auth cookie, navigating across pages like a user.
- **Vitest here (integration)** mounts *one route in isolation* with the network
  mocked by MSW reading an in-memory store, no server, no real auth.

So conversion is a **re-authoring**: keep the intent (what the user does, what
should be true), re-express it against the mocked setup, and be explicit about
what can't come across. Your job is a faithful integration test, not a
line-by-line translation that happens to compile.

## Target shape (the house style)

Match [`src/routes/_authenticated/entries/$entryId/index.integration.test.tsx`](../../../app/frontend/web/src/routes/_authenticated/entries/$entryId/index.integration.test.tsx).
Every converted test looks like:

```ts
import { expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "./index"; // the route under test
import { renderRoute } from "#/test/render-route";
import { makeLongIslandEntry } from "#/test/mocks/fixtures";
import { seedEntry, observeSetAnnotation } from "#/test/mocks/handlers";

test("does the thing the E2E did", async () => {
  seedEntry(makeLongIslandEntry());                 // data the flow assumed exists
  renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/1"] });
  const user = userEvent.setup();

  await screen.findByRole("heading", { level: 1, name: "Long Island" });
  await user.click(screen.getByText("ending"));
  expect(await screen.findByLabelText("Rhyme group A")).toHaveTextContent("A");
});
```

Save co-located next to the route as `<name>.integration.test.tsx` (the
`integration` project only picks up `src/**/*.integration.test.{ts,tsx}`).

## Workflow

1. **Read the source** — a `.spec.ts` path, codegen output, or pasted `page.*`
   lines. List the routes it touches and the data it assumes exists.
2. **Split by route.** `renderRoute` mounts *one* route and does not follow
   in-app navigation. A journey that spans pages becomes one test per route,
   each rendering its own `Route` and seeding its own data. Map each
   `page.goto('/entries/1')` (or a link-click that navigates) to the matching
   route file under `src/routes/` and a `renderRoute(...)` call.
3. **Seed the data.** Whatever the E2E relied on the DB holding → seed it with a
   fixture: `seedEntry(makeLongIslandEntry())`, or `makeEntryDetail({ id, ... })`.
   Match the entry id to the URL (`/entries/1` ⇒ id `1`). Fixtures:
   `makeEntryDetail`, `makeLongIslandEntry`, `makeSection`, `makeAnnotation` in
   [`src/test/mocks/fixtures.ts`](../../../app/frontend/web/src/test/mocks/fixtures.ts).
4. **Mock any missing procedures.** Only `auth.me`, `entries.list`,
   `entries.get`, and `entries.setAnnotation` are implemented in
   [`src/test/mocks/handlers.ts`](../../../app/frontend/web/src/test/mocks/handlers.ts).
   If the flow creates / edits / deletes, add that procedure to the `router`
   there first (follow the `setAnnotation` example) — otherwise the request 404s
   as an unhandled error.
5. **Translate** actions and assertions with the table below.
6. **Verify.** `pnpm --filter @rhymelab/web test`. Iterate to green, then tell
   the user plainly what did *not* convert (see Gaps).

## Mapping

| Playwright | Vitest + Testing Library |
| --- | --- |
| `import { test, expect } from "@playwright/test"` | `import { expect, test, vi } from "vitest"` + TL + repo helpers |
| `test("n", async ({ page }) => {…})` | `test("n", async () => { const user = userEvent.setup(); … })` |
| `page.goto("/entries/1")` | `renderRoute(Route, { path: "/entries/$entryId", initialEntries: ["/entries/1"] })` |
| `page.getByRole("button", { name })` | `screen.getByRole("button", { name })` |
| `getByText` / `getByLabel` / `getByPlaceholder` / `getByTestId` | `getByText` / `getByLabelText` / `getByPlaceholderText` / `getByTestId` |
| `page.locator("css")` | a role/text query if at all possible; else `container.querySelector(...)` or `el.closest(...)` (`renderRoute` returns `container`) |
| `await loc.click()` | `await user.click(el)` |
| `await loc.fill(v)` | `await user.clear(el); await user.type(el, v)` |
| `await loc.selectOption(v)` | `await user.selectOptions(el, v)` |
| `await loc.check()` / `.press("Enter")` | `await user.click(el)` / `await user.keyboard("{Enter}")` |
| `await expect(loc).toBeVisible()` | appears async → `expect(await screen.findBy…(…)).toBeInTheDocument()`; already present → `expect(el).toBeVisible()` |
| `toHaveText` / `toHaveValue` / `toHaveCount(n)` | `toHaveTextContent` / `toHaveValue` / `expect(screen.getAllBy…).toHaveLength(n)` |
| `waitForSelector` / auto-wait | `findBy…` (async, retries) or `await waitFor(() => expect(…))` |
| `page.waitForResponse(...)` / network assert | `observeSetAnnotation(vi.fn())` then assert the payload, and/or assert the resulting UI |

## Gaps — call these out, don't paper over them

- **One route per render.** No cross-page navigation. Split journeys; if a step
  only makes sense mid-journey on the real app, say so.
- **Auth is a flag, not a cookie.** `store.authed` defaults to `true`, so
  `_authenticated` routes render without login. Drop `storageState`/login steps.
  To test the guard's redirect, set `store.authed = false` (import `store`).
- **`toHaveURL` has no home.** There's no address bar. Assert rendered content
  instead, or read `router.state.location.pathname` from `renderRoute`'s return.
- **Screenshots, traces, video, downloads, multiple tabs, real timing** — no
  equivalent. Drop them and note it.
- **Some flows shouldn't be converted.** If a test's whole value is real auth, a
  real DB, or a real multi-page path, a mocked single-route version tests
  something weaker — tell the user that rather than shipping a hollow test. The
  companion `record-e2e` skill is where those belong.

## Notes

- Runner: `pnpm --filter @rhymelab/web test` (or `test:watch`).
- Keep the repo's heavily-commented style — explain *why* a step or assertion
  matters, deriving offsets/counts from seeded data rather than hard-coding.
