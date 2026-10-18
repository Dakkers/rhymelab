# RhymeLab — working notes for Claude

## Code standards

- **`Pick` over `Omit` for narrowed row types.** When a type is "a DB row minus
  a couple of fields" (e.g. a `select`ed subset of a Prisma model), spell it as
  `Pick<Model, "a" | "b" | ...>`, not `Omit<Model, "userId">`. `Omit` silently
  widens to include any column added to the schema later; `Pick` makes a new
  column opt-in — it has to be added explicitly to both the type and the query
  before it starts flowing through, instead of leaking by default.
- **Mark methods `async` even when a bare `return somePromise` would typecheck.**
  The `async` keyword is a skimming aid — it should be visible at the point a
  reader decides whether a call needs `await`, not just inferable from the
  return type.

## Testing

**Test the code, not the ORM.** Assume Prisma (and any other dependency) already
works. A test earns its place only if it can fail because of _our_ logic — not
because a library we don't own behaves differently than assumed. If the only way
a test could go red is a bug inside Prisma/Fastify/Zod, delete it.

This draws the line between the two suites on `EntryController` (and should for
future controllers):

- **Unit (`*.test.ts`, mocked client, `pnpm test`)** owns _query construction and
  routing_ — the exact args the controller hands Prisma, that the user scope can't
  be widened, the `create` payload shape, base-vs-`tx` routing. Fast, no database.
- **Integration (`*.integration.test.ts`, real Postgres, `pnpm test:integration`)**
  owns only what a mock _cannot_ prove: real ordering, cross-user isolation with
  another user's rows physically in the table, DB-assigned defaults (uuid,
  timestamps, NULL columns), schema round-tripping, and transaction rollback.

Corollary — the two suites must not mirror each other test-for-test. Re-executing
a query the unit test already pins, just to watch Postgres run it, tests the ORM.
Keep an integration test only when a real database is what makes it able to fail.

## Sandbox

`./rhymelab-sandbox up` boots this worktree's own stack: a dedicated Postgres
database, the API, and the web app on free ports, seeded, with a planted session.
No real credentials are involved. `doctor` verifies it, `flow` drives real API
paths, and `down` stops it. Every command takes `--json` and exits non-zero on
failure. Run `./rhymelab-sandbox help` for the commands and `help <command>` for
options.

Each subsystem has a usage-only doc. Keep this section to one paragraph per
subsystem. Put details in the linked doc, and keep incident history out of both:
that belongs in PRs.

- **CLI and environment.** Lifecycle, exit codes, Postgres backends,
  ports/state, and how env overrides work without writing files.
  [docs/sandbox/cli.md](docs/sandbox/cli.md)
- **Data and credentials.** Seed profiles, the public-domain corpus and its
  markup, `state`/`sql`, and the planted session.
  [docs/sandbox/data.md](docs/sandbox/data.md)
- **Flows.** End-to-end scenarios with `--expect`, hop traces, `--last`
  chaining, and the adversarial flows. Add one whenever you add a route.
  [docs/sandbox/flows.md](docs/sandbox/flows.md)
- **Troubleshooting.** Failure modes, the diagnostic bundle to report a new one,
  and what's intentionally not implemented.
  [docs/sandbox/troubleshooting.md](docs/sandbox/troubleshooting.md)
