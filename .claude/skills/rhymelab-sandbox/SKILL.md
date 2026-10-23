---
name: rhymelab-sandbox
description: >-
  Operate this worktree's credential-free sandbox from a free-form request. The
  repo-root `./rhymelab-sandbox` CLI gives each worktree its own Postgres database
  (`rhymelab_<slug>`), seeded data, a planted session, and API + web on free
  ports. Use when the user wants to start/boot/stop the sandbox or full stack,
  check its health/ports/database, migrate/seed/reset/drop the worktree's data,
  log in or get a session cookie, drive an end-to-end flow (create/edit/delete an
  entry, auth checks), inspect or query data, or debug a sandbox that won't boot.
  Map whatever they ask to the right commands.
---

# Run the worktree's sandbox

`./rhymelab-sandbox` boots a full stack scoped to the current worktree, with no
real credentials. Every command takes `--json` (one object on stdout) and exits
non-zero on failure, so read the JSON and the exit code. Don't scrape the text.

The user gives you a free-form request ("spin it up", "wipe my data", "does
delete work?", "what's my db called?"). Orient, map the request to commands, and
report the answer.

Details live in [docs/sandbox/](../../../docs/sandbox/): `cli.md`, `data.md`,
`flows.md`, `troubleshooting.md`. Read the one you need. For options, run
`./rhymelab-sandbox help <command>`, which is generated from the same registry
that dispatches commands.

## 1. Orient

Run these from the worktree root (`git rev-parse --show-toplevel`):

```bash
./rhymelab-sandbox status --json
./rhymelab-sandbox doctor --json   # exit 0 = healthy; each failed check carries a `fix`
```

`status` gives the slug, database, backend, the ports actually bound, and
whether the servers run. Take names and ports from here. Never hardcode them.

## 2. Map the request

| Request                               | Command                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| start / boot / spin up                | `up` (detaches and returns once healthy). See §3 to show it in the Browser pane.     |
| stop                                  | `down`. Servers stop; data is kept.                                                  |
| is it working? / why is it broken?    | `doctor --json`, then `logs api` / `logs web`                                        |
| apply migrations                      | `migrate`                                                                            |
| add demo data / my DEMO files         | `seed --profile demo` (`default` = the public-domain corpus)                         |
| wipe my data                          | `reset --yes` (truncate + reseed), or `reset --hard --yes` (drop + migrate + reseed) |
| delete the database                   | `drop --yes`                                                                         |
| how many entries / show rows          | `state --json`, or `sql "<select>" --json`                                           |
| log me in / give me a token / curl it | `creds --json`: cookie, password, curl examples                                      |
| does X work end to end?               | `flow list`, then `flow <name> --expect <outcome>`. See `flows.md`.                  |

Destructive commands: proceed with `--yes` when the request is unambiguous ("wipe
it", "drop the db"). When it's vague ("clean this up"), ask first. The CLI
refuses to `reset` or `drop` the primary checkout's shared `rhymelab` database.

Never run `psql` with the Bash tool: it's interactive and will hang. Use `sql`.

## 3. Showing the app in the Browser pane

`up` in Bash is fine for flows, curl, and `doctor`. To preview the UI, run the
stack through a launch config so the pane owns the process:

1. Run `./rhymelab-sandbox migrate`, so a cold install doesn't time out the
   pane's port wait. Then take the web port from `status --json`.
2. Add this to `.claude/launch.json` and `preview_start` it by name:
   ```json
   {
     "name": "sandbox",
     "runtimeExecutable": "<worktree>/rhymelab-sandbox",
     "runtimeArgs": ["up", "--fg"],
     "port": <web port>
   }
   ```
3. Check `preview_logs` for the `up` JSON with the real ports. If the port moved
   because the preferred one was busy, update `port` and restart. Log in with the
   password from `creds`.
4. `preview_stop` stops both servers. Then restore `.claude/launch.json` with
   `git checkout -- .claude/launch.json`, because the port is worktree-specific.

## 4. When something breaks that the docs don't cover

Follow the report loop in `docs/sandbox/troubleshooting.md`. Collect the
credential-free bundle (`doctor`, `status`, and `logs` as JSON, plus OS and disk
info). Ask the user before sending it to the maintainer. Then keep unblocking
them: `reset --hard --yes` and a fresh `up` clear most carried-over state.

## 5. Report back

Lead with the result the request was about: URLs and ports, the database name,
row counts, the flow outcome with its failing hop, or "dropped `rhymelab_<slug>`".
Don't narrate which commands you ran.
