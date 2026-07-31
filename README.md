# RhymeLab

A private workbench for **annotating songs and poems** — rhyme scheme, rhyme
types, sound devices, themes, literary devices, and free-form notes, laid
directly over the words. Built for a single user (alpha), hosted on **Cloudflare
Workers** with a **D1 (SQLite)** database.

Alpha target: <https://rhymelab.dakota-stlaurent.com>

## The idea

Lyrics are stored as **plain text** — that text is the source of truth. Everything
layered on top anchors to **character offsets** into it:

- **Sections** are auto-detected from blank lines (a verse, chorus, stanza…). Their
  _type_ and _label_ are editable and persist across lyric edits.
- **Annotations** are `[start, end)` ranges — usually one word, sometimes a phrase.
  Each carries a **mode** (rhyme-scheme / rhyme-type / sound / theme / device /
  note), so a single word can hold several at once. Each annotation snapshots the
  exact text it covers (`quote`) so it can be re-found after the lyrics are edited.

The workbench (`/entries/:id`) is a reading view with a **mode bar**; the hero mode,
**Rhyme scheme**, assigns colour-coded groups (A–F, X) with per-section counts,
shared word colours, and line-end scheme badges.

## Tech stack

| Concern           | Choice                                                   |
| ----------------- | -------------------------------------------------------- |
| Framework / SSR   | TanStack Start + TanStack Router (file-based)            |
| Runtime / hosting | Cloudflare Workers (`@cloudflare/vite-plugin`, Wrangler) |
| Database          | Cloudflare D1 (SQLite) via **Drizzle ORM** + drizzle-kit |
| Data fetching     | TanStack Query, hydrated through the SSR stream          |
| Design system     | `@saintly-software/baritone` (+ `@base-ui/react`)        |
| Validation        | `zod`                                                    |
| Auth              | single shared-password cookie session                    |
| Lint / format     | `oxlint` / `oxfmt`                                       |

> **Postgres later.** The schema deliberately avoids SQLite-only tricks (integer
> millisecond timestamps, no exotic column types) so a future move to Postgres is a
> schema rewrite, not a data-model rethink.

## Getting started

Requires the Node version in [`.nvmrc`](.nvmrc) (`nvm use`) and pnpm.

```bash
pnpm install
pnpm db:migrate:local   # create + migrate the local dev database (once)
pnpm dev                # http://localhost:3000
```

The demo password is `password` (set `APP_PASSWORD` to change it — see
[Secrets](#secrets)).

> **Local D1 lives in `.wrangler/state`.** `pnpm dev` (the Vite Cloudflare plugin)
> and `pnpm db:migrate:local` are both pointed there via `--persist-to .wrangler/state`,
> so migrations you apply locally are the ones the dev server sees. After changing
> `src/db/schema.ts`, run `pnpm db:generate` then `pnpm db:migrate:local`.

## Layout

```
src/
├── routes/
│   ├── index.tsx                       # "/" landing (redirects signed-in users)
│   ├── auth/{login,logout}/            # cookie-session auth
│   └── _authenticated/                 # the auth gate (pathless layout)
│       ├── library/                    # "/library" — the entry list
│       └── entries/
│           ├── new/                    # "/entries/new" — create + paste lyrics
│           └── $entryId/
│               ├── index.tsx           # "/entries/:id" — the analysis workbench
│               └── edit/               # "/entries/:id/edit" — metadata + lyrics
├── components/
│   ├── TopBar/                         # the black app bar
│   ├── EntryForm/                      # shared metadata fields + tag input
│   └── Workbench/                      # the analysis UI (mode bar, section cards,
│                                       #   word tokens, line-end badges, inspector)
├── server/                            # server functions (auth, entries) — server-only
│   ├── session.ts / auth.ts / authed.ts
│   └── entries.ts                     # all entry/section/annotation reads + writes
├── db/                                # Drizzle schema + client (`cloudflare:workers` env)
├── lib/                               # pure helpers: lyrics tokenisation, section
│                                      #   detection, re-anchoring, constants, queries
└── styles/                            # reset + Baritone CSS + app.css (the workbench look)

drizzle/                               # generated SQL migrations (committed)
.config/wrangler.jsonc                 # Cloudflare Workers config (D1 binding, routes)
drizzle.config.ts                      # drizzle-kit generation config
```

## Scripts

| Script                   | What it does                                         |
| ------------------------ | ---------------------------------------------------- |
| `pnpm dev`               | Dev server at http://localhost:3000                  |
| `pnpm build`             | Production build                                     |
| `pnpm preview`           | Build, then preview the built Worker locally         |
| `pnpm deploy`            | Build + `wrangler deploy`                            |
| `pnpm db:generate`       | Generate a migration from `src/db/schema.ts`         |
| `pnpm db:migrate:local`  | Apply migrations to the local dev D1                 |
| `pnpm db:migrate:remote` | Apply migrations to the production D1                |
| `pnpm db:backup`         | Export the production D1 to `backups/`               |
| `pnpm cf-typegen`        | Regenerate `worker-configuration.d.ts` from bindings |
| `pnpm typecheck`         | `tsc --noEmit`                                       |
| `pnpm lint` / `:check`   | `oxlint` (with / without `--fix`)                    |
| `pnpm fmt` / `:check`    | `oxfmt` (write / check)                              |

## Deploy (Cloudflare Workers + D1)

You need a Cloudflare account and `wrangler login`. One-time setup:

1. **Create the D1 database** and copy the printed `database_id` into the
   `d1_databases[0].database_id` field of [`.config/wrangler.jsonc`](.config/wrangler.jsonc):

   ```bash
   wrangler d1 create rhymelab-db --config .config/wrangler.jsonc
   ```

2. **Apply migrations** to the remote database:

   ```bash
   pnpm db:migrate:remote
   ```

3. **Set secrets** (see below):

   ```bash
   wrangler secret put SESSION_SECRET --config .config/wrangler.jsonc
   wrangler secret put APP_PASSWORD --config .config/wrangler.jsonc
   ```

4. **Deploy:**

   ```bash
   pnpm deploy
   ```

### Custom domain

[`.config/wrangler.jsonc`](.config/wrangler.jsonc) routes the Worker to
`rhymelab.dakota-stlaurent.com` via a `custom_domain` route. That requires the zone
`dakota-stlaurent.com` to be on the same Cloudflare account — `wrangler deploy` then
provisions the hostname and its certificate. To deploy to the default
`*.workers.dev` subdomain instead, remove the `routes` block.

### Secrets

Read from the environment (surfaced on `process.env` under `nodejs_compat`):

- `SESSION_SECRET` — signs the session cookie (use ≥ 32 random chars).
- `APP_PASSWORD` — the password that unlocks the site (defaults to `password`).

Locally, copy `.config/.dev.vars.example` → `.config/.dev.vars` and fill them in
(the app also runs without them, using insecure dev defaults).

## Notes & known alpha limits

- **Single user.** One shared password; no accounts. Every server function still
  re-checks auth (`authedFn` / `authedPostFn` middleware).
- **Editing lyrics re-anchors annotations** by searching for each annotation's saved
  `quote` nearest its old position. Annotations whose text no longer exists are kept
  but marked _detached_ (hidden from the reading view); the editor reports how many.
- **Phrase selection:** click a word to select it; **Shift-click** another word in the
  same section to select the span between them.
- Rhyme-group letters (A–F, X) and their counts are scoped **per section**.
