# Sandbox troubleshooting

Start with `./rhymelab-sandbox doctor`. Each failed check prints the command
that fixes it.

| Symptom                                | Cause and fix                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `node … can't run TypeScript natively` | Node is older than 22.18. Run `nvm install` (reads `.nvmrc`).                                                 |
| `No Postgres backend`                  | Docker isn't running and no native Postgres was found. Start Docker/OrbStack, or install Postgres.            |
| `Native Postgres can't run as root`    | `initdb` refuses root. Run as a regular user, or use Docker.                                                  |
| `The api server exited during startup` | The error includes the log tail. Usually a type or import error in the API.                                   |
| `Servers weren't healthy within 180s`  | Usually the web server stuck compiling. Check `./rhymelab-sandbox logs web`.                                  |
| `doctor`: `cors` fails                 | The API was started with a different web origin. Run `down`, then `up`.                                       |
| `doctor`: `api`/`web` "stale state"    | A server died (for example, a crash or `kill -9`). `up` clears the state and restarts both.                   |
| `doctor`: `dependencies` stale         | `pnpm-lock.yaml` changed since the last install. `up` or `migrate` reinstalls.                                |
| `refusing to … without confirmation`   | `reset`/`drop` with no terminal attached. Pass `--yes`.                                                       |
| `down` exits 2 mentioning `drop`       | `down` used to drop the database. It now only stops servers. Use `drop --yes`.                                |
| Port 5433 taken by something else      | Both backends need it. Stop the other Postgres, or force the backend that owns it with `RHYMELAB_SANDBOX_PG`. |

## Reporting a new failure

If `up`, `doctor`, or `sandbox:e2e` fails in a way this table doesn't cover,
gather a diagnostic bundle. It contains no credentials:

```bash
./rhymelab-sandbox doctor --json > sandbox-report.json
./rhymelab-sandbox status --json >> sandbox-report.json
./rhymelab-sandbox logs --lines 80 --json >> sandbox-report.json
uname -a >> sandbox-report.json; df -h . >> sandbox-report.json
```

Send it to the maintainer, or open an issue, so the fix lands for the next
person. Then keep unblocking yourself. `reset --hard --yes` and a fresh `up`
clear most carried-over state.

## Not implemented, on purpose

- **One user only.** Every session is the same user. `foreign-entry` creates the
  second user it needs with SQL.
- **No per-branch VMs.** One database and port pair per worktree already isolates
  branches. Nothing here needs OS-level isolation.
- **The shared Postgres keeps running.** `down` leaves `rhymelab-postgres` (or
  the native cluster) up, because other worktrees use it. Stop it with
  `docker stop rhymelab-postgres`.
