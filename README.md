# RhymeLab

A private workbench for **annotating the rhyme scheme of songs and poems**, line
by line. It's built for a single user and is in alpha.

## The idea

Lyrics are stored as **plain text**, and that text is the source of truth.

- **Sections** are blank-line-separated blocks. Each entry carries a `structure`
  array that labels them (verse, chorus, bridge, stanza, …). Editing the text
  keeps the labels in sync.
- **Line annotations** sit on top of individual lines. A line can belong to a
  song-wide **rhyme group**, be marked deliberately **unrhymed** (`X`), and be
  marked **enjambed**. Each annotation keeps a snapshot of its line's text.
- The entry page shows each section with **rhyme letters scoped to that
  section** (A, B, C…), derived from the song-wide groups.

## Quick start

Requires Node from [`.nvmrc`](.nvmrc) (`nvm install`), plus Docker/OrbStack or a
local Postgres install. Nothing else, and no credentials:

```bash
./rhymelab-sandbox up       # install, start Postgres, migrate, seed, run API + web
./rhymelab-sandbox doctor   # all green → exit 0
./rhymelab-sandbox creds    # the URLs, the password, a session cookie, curl examples
./rhymelab-sandbox down     # stop the servers (data is kept)
```

Every worktree gets its own database and ports, so checkouts never step on each
other. The seed is a hand-annotated public-domain corpus (Shakespeare, Blake,
Frost, two hymns). The demo password is the committed default, `password`.

Read more in [docs/sandbox/](docs/sandbox/): the [CLI](docs/sandbox/cli.md),
[data and credentials](docs/sandbox/data.md), [flows](docs/sandbox/flows.md)
(scripted end-to-end checks through the real API), and
[troubleshooting](docs/sandbox/troubleshooting.md).

### Without the sandbox

To run against the shared dev database (`rhymelab` on `localhost:5433`):

```bash
pnpm install
docker compose up -d          # Postgres on :5433
export DATABASE_URL=postgresql://rhymelab:rhymelab@localhost:5433/rhymelab
pnpm db:migrate               # prisma migrate dev
pnpm dev:seed                 # --profile baseline | default | demo
pnpm dev:api                  # http://localhost:4000/api
pnpm dev:web                  # http://localhost:3000
```

The Prisma CLI reads `DATABASE_URL` only from the environment. The API and the
seed script load it from `app/backend/api/.config/.env` themselves.

## Layout

```
app/
├── frontend/web/        # @rhymelab/web — TanStack Start + Router, SSR on Cloudflare Workers
└── backend/api/         # @rhymelab/api — Fastify serving the oRPC contract as REST under /api
packages/
├── database/            # @rhymelab/database — Prisma schema, migrations, generated client, ORMs
├── api-contract/        # @rhymelab/api-contract — oRPC contract, Zod schemas, section building
├── fixtures/            # @rhymelab/fixtures — fake entries, the annotated-markup parser, the corpus
├── core/                # @rhymelab/core — framework-free lyrics and annotation helpers
└── utils/               # @rhymelab/utils — shared error types
tools/
└── sandbox/             # @rhymelab/sandbox — the ./rhymelab-sandbox CLI (Node runs it natively)
docs/                    # style guide and sandbox docs
```

The web app makes no database calls of its own. All data and auth go through the
API over HTTP, at `VITE_API_URL`.

## Tech stack

| Concern       | Choice                                                   |
| ------------- | -------------------------------------------------------- |
| Web framework | TanStack Start + TanStack Router (file-based), React     |
| Web hosting   | Cloudflare Workers (`@cloudflare/vite-plugin`, Wrangler) |
| API           | Fastify + oRPC (OpenAPI/REST), contract shared with web  |
| Database      | Postgres via Prisma (`@prisma/adapter-pg`)               |
| Validation    | Zod                                                      |
| Design system | `@saintly-software/baritone` (+ `@base-ui/react`)        |
| Auth          | One shared password, issuing a signed cookie session     |
| Tests         | Vitest (unit, integration, browser mode), Playwright E2E |
| Lint / format | `oxlint` / `oxfmt`                                       |

## Scripts

| Script                  | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm sandbox`          | The sandbox CLI (same as `./rhymelab-sandbox`)                |
| `pnpm sandbox:e2e`      | The sandbox's own end-to-end suite                            |
| `pnpm dev:web`          | Web dev server on :3000                                       |
| `pnpm dev:api`          | API dev server on :4000 (`tsx watch`)                         |
| `pnpm dev:seed`         | Seed the database named by `DATABASE_URL`                     |
| `pnpm db:generate`      | Regenerate the Prisma client                                  |
| `pnpm db:migrate`       | `prisma migrate dev`                                          |
| `pnpm db:studio`        | Prisma Studio                                                 |
| `pnpm build:web`        | Production build of the web app                               |
| `pnpm cf-typegen`       | Regenerate `worker-configuration.d.ts` (needed for typecheck) |
| `pnpm typecheck`        | `tsc` across every package                                    |
| `pnpm test:unit`        | Unit tests (no database)                                      |
| `pnpm test:integration` | API integration tests in a throwaway Postgres database        |
| `pnpm test:smoke`       | Web smoke tests (Vitest browser mode)                         |
| `pnpm lint` / `:check`  | `oxlint` (with / without `--fix`)                             |
| `pnpm fmt` / `:check`   | `oxfmt` (write / check)                                       |

How the two test suites split their work is covered in
[`CLAUDE.md`](CLAUDE.md#testing). File conventions are in the
[style guide](docs/style-guide.md).

## Configuration

Both apps keep committed, non-secret defaults in `.config/.env*`. Real secrets
go in the gitignored `.env.<mode>.local`, or in the host's secret store when
deployed. Each package's `.config/.env.example` explains its load order. CI
fails if a committed env file contains anything that looks like a real secret
(`./rhymelab-sandbox verify-env`).

| Variable          | Read by | Purpose                                             |
| ----------------- | ------- | --------------------------------------------------- |
| `DATABASE_URL`    | API     | Postgres connection                                 |
| `PORT`            | API     | Listen port                                         |
| `FRONTEND_ORIGIN` | API     | Exact web origin allowed by CORS (with credentials) |
| `SESSION_SECRET`  | API     | Signs the session cookie (≥ 32 chars in production) |
| `APP_PASSWORD`    | API     | The shared password that unlocks the app            |
| `VITE_API_URL`    | Web     | Base URL of the API (build-time, public)            |

## Alpha limits

- **Single user.** Every session maps to one fixed user, and every request is
  re-checked by the API's auth middleware.
- **One shared password.** There are no accounts.
