# Sandbox CLI

`./rhymelab-sandbox` (also `pnpm sandbox`) boots this worktree's own stack: a
dedicated Postgres database, the API, and the web app on free ports, wired
together, with no real credentials anywhere.

`./rhymelab-sandbox help` lists every command. `./rhymelab-sandbox help <command>`
lists that command's options and defaults. Those are the source of truth; this
page explains the model, not the flags.

## The contract

- **`--json` on every command.** One JSON object on stdout, always with `ok` and
  `command`. Progress goes to stderr.
- **Exit codes are assertions.** `0` ok. `1` failed: a critical `doctor` check, a
  flow error, or an `--expect` mismatch. `2` usage error: unknown command, flag,
  profile, flow, or an `--expect` the flow can never report.
- **Idempotent.** `up` on a running stack reports it and exits 0. `down` on a
  stopped one says "Already down" and exits 0. `seed` never duplicates.

## Typical session

```bash
./rhymelab-sandbox up        # install, Postgres, migrate, seed, run API + web, plant creds
./rhymelab-sandbox doctor    # every check green → exit 0
./rhymelab-sandbox creds     # session cookie + curl examples
./rhymelab-sandbox flow browse --expect ok
./rhymelab-sandbox down      # stop servers; the database is kept
```

`up` detaches: the servers outlive the command and log to the state directory
(`./rhymelab-sandbox logs`). `up --fg` stays attached instead, and Ctrl-C stops
both servers. Use `--fg` from a launch config.

`down` only stops servers. `drop` destroys the database. `reset` empties every
table and reseeds; `reset --hard` drops, re-migrates, and reseeds. `drop` and
`reset` refuse the primary checkout's shared `rhymelab` database, and refuse to
run without `--yes` when there is no terminal to confirm in.

## What's real

| Dependency | Treatment                                                         |
| ---------- | ----------------------------------------------------------------- |
| Postgres   | Real. Docker container `rhymelab-postgres`, or a native cluster.  |
| API        | Real. `tsx watch`, so edits reload.                               |
| Web        | Real. `vite dev` with SSR.                                        |
| Auth       | Real. One shared password; the session comes from the real login. |

Nothing else is external, so nothing is mocked.

**Postgres backends.** Docker wins when its daemon answers. Otherwise the CLI
runs a native cluster with the host's own `initdb`/`pg_ctl`, kept in
`~/.local/state/rhymelab-sandbox/pgdata`. Set `RHYMELAB_SANDBOX_PG=docker` or
`native` to force one. Both listen on `localhost:5433` and hold one database per
worktree. Native mode can't run as root.

## Identity, ports, and state

The worktree's directory name decides its slug, its database
(`rhymelab_<slug>`), and its preferred ports (web `3000+n`, API `4000+n`). `up`
takes the next free port when a preferred one is busy. `status` shows the ports
actually bound.

Runtime state (PIDs, ports, logs, the last flow's entry) lives in
`$TMPDIR/rhymelab-sandbox/<slug>/`, outside the worktree. The planted session
goes to `.sandbox-credentials.json` at the worktree root, which is gitignored.

## Environment

The sandbox writes no `.env` file. It reads the committed
`app/backend/api/.config/.env` and `app/frontend/web/.config/.env`, overrides
`DATABASE_URL`, `PORT`, `FRONTEND_ORIGIN`, and `VITE_API_URL` for this worktree,
sets `RHYMELAB_SANDBOX=1`, and exports the result to the servers. dotenv and Vite
never override an already-set variable, so these beat every committed and
gitignored `.env*` file.

`verify-env` fails CI if a committed `.env*` file holds a secret-shaped value, or
if the code reads a variable the committed defaults don't declare.

## Scripts that build on it

- `pnpm sandbox:e2e`: the sandbox's own regression suite. It boots, drives every
  flow, kills the API to prove `doctor` notices and `up` heals it, then tears
  down. CI runs it from a checkout with no `pnpm install`.
- `pnpm --filter @rhymelab/sandbox test`: unit tests for the CLI.

## Adding a command

Add an entry to `COMMANDS` in `tools/sandbox/cli.mts`. The registry drives both
dispatch and help, so a command can't exist without documentation. Return a
`Result` and let `main` handle printing and exit codes. Throw `SandboxError`
with a `fix` for failures the user can act on.

The CLI is plain `.mts` that Node runs natively. It MUST NOT import workspace
packages: their extensionless imports don't resolve under Node, and the CLI has
to run before `pnpm install`.
