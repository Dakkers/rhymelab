# Sandbox data and credentials

## Seed profiles

`up` seeds the `default` profile, and so do `seed` and `reset` unless you pass
`--profile`. Seeding is idempotent: entries are matched by title for the sandbox
user, so re-running skips what's already there.

| Profile    | Seeds                                                       |
| ---------- | ----------------------------------------------------------- |
| `baseline` | The sandbox user only                                       |
| `default`  | The user and the committed public-domain corpus (5 entries) |
| `demo`     | `default` plus the gitignored `.dummy/DEMO_*.txt` files     |

The seed script refuses any `DATABASE_URL` that isn't on localhost. Outside the
sandbox, `pnpm dev:seed --profile demo` seeds the shared dev database the same
way.

## The corpus

`packages/fixtures/src/corpus/` holds hand-annotated public-domain pieces as
TypeScript modules, in the same markup `parseAnnotatedBody` reads:

- `[Verse 1]`, `[Chorus]`, `[Stanza]`: a header labels the sections after it.
- `| A`: a rhyme group, scoped to its section.
- `| A @name`: joins that group with every other group tagged `@name`, across
  sections.
- `| X`: deliberately unrhymed. `| … >`: enjambed.

To add a piece, write a module that exports a `CorpusEntry` and add it to
`CORPUS` in `index.ts`. Only commit public-domain text. The fixtures test fails
if a title repeats or a line has no annotation.

## Inspecting the world

```bash
./rhymelab-sandbox state --json   # counts, entry ids, the last flow's entry
./rhymelab-sandbox sql "select title, cardinality(structure) from lyric_entries"
```

`state` only covers the sandbox login. `sql` runs one statement without a
prompt. A `SELECT` returns rows as JSON objects; anything else prints psql's
output. `psql` opens an interactive shell for humans.

## Credentials

Every session maps to one fixed user (`TEMP_USER_ID` in the API's
`session.ts`), and the password is the committed `APP_PASSWORD` default.

`up` and `creds` log in through the real `POST /api/auth/login` route and save
the signed cookie to `.sandbox-credentials.json`. `creds` also prints curl
examples:

```bash
./rhymelab-sandbox creds --json | jq -r .cookie
curl -s -b "$(jq -r .cookie .sandbox-credentials.json)" http://localhost:<api-port>/api/entries
```

To use the browser, open the web URL and log in with the password `creds`
prints.
