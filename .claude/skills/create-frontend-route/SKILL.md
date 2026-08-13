---
name: create-frontend-route
description: >-
  Scaffold a new empty frontend route (page) in the @rhymelab/web app. Use when
  the user wants to add a new page, screen, route, or URL to the web frontend —
  e.g. "add a /settings page", "create a new route for X", "scaffold an empty
  page" — and needs the TanStack Router file, correct auth placement, and house
  boilerplate wired up.
---

# Create a frontend route

The web app uses **TanStack Router with file-based routing**. A route is a
folder under `app/frontend/web/src/routes/` containing an `index.tsx`. There is
**no manual registration** — `src/routeTree.gen.ts` is generated from the file
tree (by the dev server, or `pnpm --filter @rhymelab/web generate-routes`).
Never hand-edit `routeTree.gen.ts`.

Goal here is an *empty* route: correct placement, correct boilerplate, nothing
more. Don't invent product content.

## 1. Decide placement (this determines the path prefix)

**Default to a signed-in route under `_authenticated/`.** Almost every page in
this app lives behind the login gate, so unless the user says the page must be
reachable without logging in, put it there. Two buckets:

- **Signed-in page (the default)** → under `_authenticated/`. Inherits the auth
  gate + nav bar from `src/routes/_authenticated/route.tsx`; no per-page auth
  code needed. Existing examples: `_authenticated/home/`, `_authenticated/library/`.
- **Public page** (only when the user explicitly wants no login required) →
  directly under `routes/`. Existing examples: `index.tsx` (landing),
  `auth/login/`, `auth/logout/`.

The folder path maps straight to the URL. `_authenticated` is a *pathless*
layout segment — it does **not** appear in the URL. So
`_authenticated/settings/index.tsx` serves `/settings`.

## 2. Create the file

Make `src/routes/<path>/index.tsx`. The string passed to `createFileRoute` is
the **full route id including `_authenticated` and a trailing slash** — match
the folder path exactly (the generator will correct it, but get it right so
typecheck passes first time).

### Signed-in empty page

`src/routes/_authenticated/settings/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@saintly-software/baritone";
import { Page } from "#/components/Page";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <Page title="Settings">
      <Text saliency="low">Nothing here yet.</Text>
    </Page>
  );
}
```

`Page` (`src/components/Page`) is the standard signed-in content wrapper — it
renders the `<h1>` and layout. Use it for consistency.

### Public empty page

`src/routes/marketing/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Flex, Heading, Text } from "@saintly-software/baritone";

export const Route = createFileRoute("/marketing/")({
  component: MarketingPage,
});

function MarketingPage() {
  return (
    <Flex render={<main />} direction="column" gap="3" p="6" style={{ maxWidth: "40rem" }}>
      <Heading level={1} size="3xl">
        Marketing
      </Heading>
      <Text saliency="low">Nothing here yet.</Text>
    </Flex>
  );
}
```

Public pages own their `<main>` (there's no shared layout); signed-in pages get
theirs from `Page`.

## Conventions to hold to

- **Path alias**: import from `#/...` (maps to `src/*`), as in `route.tsx`.
  Relative imports also appear in the tree — either works; prefer `#/` for
  anything outside the route's own folder.
- **UI primitives** come from `@saintly-software/baritone` (`Flex`, `Text`,
  `Heading`, `Card`, `Button`, …). Don't hand-roll styled divs.
- **Data loading**, when the route later needs it, goes in a `loader` calling
  the oRPC client (`import { client } from "#/lib/orpc"`) and is read with
  `Route.useLoaderData()` — see `_authenticated/library/index.tsx`. An empty
  route has no loader.
- **Dynamic segments** use `$param` folders (e.g. `entries/$entryId/`); read
  them with `Route.useParams()`. Only if the user asked for a parameterized URL.

## 3. Link to it (only if asked / obvious)

Nothing links a new route automatically. If it should be reachable from the nav,
add a `RouterLink` in `src/components/NavBar/index.tsx`. Don't add nav entries
unprompted for a throwaway/empty page.

## 4. Verify

Regenerate the route tree and typecheck:

```bash
pnpm --filter @rhymelab/web generate-routes
pnpm --filter @rhymelab/web typecheck
```

Then confirm the new id appears in `src/routeTree.gen.ts` and, if the dev server
is running, that the URL renders (see the `run` skill or `pnpm dev:web`). Format
and lint before finishing — the pre-commit hook runs `oxfmt` + `oxlint`:

```bash
pnpm --filter @rhymelab/web fmt
pnpm --filter @rhymelab/web lint
```
