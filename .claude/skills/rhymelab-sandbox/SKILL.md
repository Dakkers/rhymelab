---
name: rhymelab-sandbox
description: >-
  Operate this worktree's isolated sandbox stack from a free-form request — the
  repo-root `./rhymelab-sandbox` script gives each worktree its own dedicated Postgres
  database (`rhymelab_<slug>`) plus API + web on free ports. Use when the user
  wants to start/boot/spin up the sandbox or full stack with an isolated DB,
  check its status/ports/database name, migrate/reset/wipe or drop the worktree's
  database, run `./rhymelab-sandbox`, or query/seed/inspect data in the isolated database.
  Parse whatever they ask into the right sandbox action.
---

# Run the worktree's sandbox

`./rhymelab-sandbox` (a script at the repo root) spins up a **full stack scoped to the
current worktree**: a dedicated Postgres database inside the one shared
container, plus the API and web servers on free, per-worktree ports. It exists so
worktrees stop sharing the single `rhymelab` dev database and stepping on each
other's data. (Contrast `boot-frontend-worktree`, which boots web + API but
*shares* the DB. Prefer this skill whenever data isolation matters.)

Your job: the user hands you an **arbitrary, free-form request** ("spin it up",
"wipe my data", "how many entries are in here?", "what's my db called?", "nuke
it"). Read the sandbox's current state, then translate that request into the
right action(s) below. Don't make the user learn subcommands — you map intent.

## 0. Prerequisites (check once, fix or report)

- **From the worktree root.** `cd` to `git rev-parse --show-toplevel` first; the
  script and every path below are relative to it.
- **The script must exist.** If `./rhymelab-sandbox` isn't at the repo root, it hasn't
  been committed to this checkout — say so and stop (it can't be run from thin
  air). Everything else assumes it's present and executable.
- **Docker/OrbStack must be running.** The script fails loudly if not; if you hit
  that, tell the user to start their engine rather than retrying.

## 1. Always orient first

Before acting, run:

```bash
./rhymelab-sandbox status
```

This is "the context of the worktree's sandbox" — it prints the slug, the
isolated **database name**, the **web/API ports**, whether Postgres is up, and
whether the DB exists and the ports are listening. Parse it, then interpret the
request against it. Capture the database name and ports from here; downstream
commands need them and they're derived per-worktree, never hardcoded.

## 2. Map the request to an action

`./rhymelab-sandbox` accepts these subcommands — this is your vocabulary:

| Subcommand         | Does                                                        |
| ------------------ | ---------------------------------------------------------- |
| `./rhymelab-sandbox status` | slug, database, ports, up/down state                       |
| `./rhymelab-sandbox migrate`| ensure the DB exists + apply migrations (no servers)       |
| `./rhymelab-sandbox reset`  | drop + recreate + migrate — **wipes** this worktree's data |
| `./rhymelab-sandbox down`   | **drop** this worktree's database                          |
| `./rhymelab-sandbox up`     | provision + migrate, then run API + web (**blocks**)       |
| `./rhymelab-sandbox psql`   | interactive psql shell (for humans, not you — see §4)      |

Run `status`, `migrate`, `reset`, `down` directly with the Bash tool — they're
fast and non-blocking. `reset`/`down` take `-y` to skip their prompt.

**"Start / boot / spin up / run the app (or full stack)"** is the one case you do
**not** run with Bash — see §3.

## 3. Starting the servers (never `./rhymelab-sandbox up` in Bash)

`./rhymelab-sandbox up` runs both dev servers in the **foreground** and blocks until
Ctrl-C. Running it with the Bash tool would hang the turn, and dev servers must
go through the Browser pane regardless. So boot it there:

1. Read the preferred `WEB_PORT` (and `API_PORT`) from `./rhymelab-sandbox status`. That's
   the port `up` will bind **unless** something already holds it — status flags an
   occupied base as `busy (other process)`, in which case `up` scans to the next
   free port and the real one shows in the banner (step 4), not here.
2. On a **fresh worktree**, run `./rhymelab-sandbox migrate` first (it runs `pnpm install`
   if `node_modules` is missing, then provisions the DB) so the pane's port-wait
   doesn't time out on a cold install.
3. Add a config to `.claude/launch.json` (substitute the real port and the
   worktree's absolute path), then `preview_start` it by name:

   ```json
   {
     "name": "sandbox",
     "runtimeExecutable": "<absolute path to the worktree>/rhymelab-sandbox",
     "runtimeArgs": ["up"],
     "port": <WEB_PORT>
   }
   ```

4. Verify you're looking at *this* sandbox, not another worktree's server:
   - `preview_logs` — the banner prints the **actual** ports; expect `API
     listening on http://localhost:<API_PORT>` and the Prisma line `Datasource
     "db": … database "rhymelab_<slug>"`, plus Vite's `Local:
     http://localhost:<WEB_PORT>`. If `up` shifted off an occupied base, these are
     the true ports — re-point the launch config's `port` and restart preview if
     the pane was still waiting on the step-1 guess. (Once running, `./rhymelab-sandbox
     status` also reports the real bound ports.)
   - `read_network_requests` — the app's `/api/*` calls hit `:<API_PORT>` and
     return 2xx (a CORS failure means the ports/origin don't line up).
   - `read_page` + a `screenshot` as proof.
5. **To stop:** `preview_stop`. That SIGTERMs the script, whose trap kills both
   servers (verify the ports are free). The database persists.

`.claude/launch.json` is tracked, so this dirties the worktree. The port is
worktree-specific, so `git checkout -- .claude/launch.json` to restore it once
you're done unless the user wants to keep the config.

## 4. Reading or seeding data in the isolated DB

For "how many entries?", "show me the rows", "insert a test entry", etc., run
SQL **non-interactively** against the isolated database — do not use
`./rhymelab-sandbox psql` (it opens an interactive shell that will hang the Bash tool).
Use the container by name with the database from §1:

```bash
docker exec -i rhymelab-postgres psql -U rhymelab -d <DB_NAME> -c "SELECT count(*) FROM entries;"
```

`<DB_NAME>` is the `database` value from `./rhymelab-sandbox status` (e.g.
`rhymelab_annotation_types_b62dee`). This is the *only* place you name the DB by
hand — everything else derives it. Never point these at the shared `rhymelab`
database unless the user explicitly asks about shared/dev data.

## 5. Destructive requests

`reset` and `down` destroy this worktree's data. If the request is unambiguous
("wipe it", "reset my sandbox", "drop the db"), proceed with `-y`. If it's vague
("clean this up"), confirm which you mean first. The script itself refuses to
`reset`/`down` the shared default `rhymelab` database, so a slip in the primary
checkout is caught — but that's a backstop, not a reason to skip judgment.

## 6. Report back

Close with the concrete result the request was about: the resolved database name
and ports, row counts, the running URLs, or "dropped `rhymelab_<slug>`" — the
answer, not a narration of which subcommand you ran.
