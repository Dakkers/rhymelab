# RhymeLab — working notes for Claude

## Testing

**Test the code, not the ORM.** Assume Prisma (and any other dependency) already
works. A test earns its place only if it can fail because of *our* logic — not
because a library we don't own behaves differently than assumed. If the only way
a test could go red is a bug inside Prisma/Fastify/Zod, delete it.

This draws the line between the two suites on `EntryController` (and should for
future controllers):

- **Unit (`*.test.ts`, mocked client, `pnpm test`)** owns *query construction and
  routing* — the exact args the controller hands Prisma, that the user scope can't
  be widened, the `create` payload shape, base-vs-`tx` routing. Fast, no database.
- **Integration (`*.integration.test.ts`, real Postgres, `pnpm test:integration`)**
  owns only what a mock *cannot* prove: real ordering, cross-user isolation with
  another user's rows physically in the table, DB-assigned defaults (uuid,
  timestamps, NULL columns), schema round-tripping, and transaction rollback.

Corollary — the two suites must not mirror each other test-for-test. Re-executing
a query the unit test already pins, just to watch Postgres run it, tests the ORM.
Keep an integration test only when a real database is what makes it able to fail.
