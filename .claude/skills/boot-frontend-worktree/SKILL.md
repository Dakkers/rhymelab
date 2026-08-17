---
name: boot-frontend-worktree
description: >-
  Set up and boot a worktree's own @rhymelab/web + @rhymelab/api dev servers on
  free ports — copy the gitignored secret env overrides that a fresh checkout
  doesn't carry, install node_modules, pin ports/CORS, then launch both. Use when
  the user wants to run/start/boot the web app or frontend in a worktree, spin up
  a freshly-created worktree to preview the web app, or fix a worktree where the
  frontend won't start because deps or env are missing.
---

# Boot a worktree's own web + API stack

**Default: this worktree gets its own web server *and* its own API server, on
ports nobody else holds.** Worktrees are meant to run side by side, so something
is usually already listening on 3000 and 4000 — but that something is *another
worktree's source code*. A page that loads at :3000 or an API that answers at
:4000 proves nothing about the checkout you're working in. Never treat "the port
is busy, so it's already running" as success: it is the exact failure this skill
exists to prevent. Always start fresh processes from *this* worktree root and
verify they're the ones you're looking at.

Boot only the web server (skipping the API) when the user explicitly asks for
just the frontend, or when the change is purely visual and needs no data or auth.
Say so when you do — an app without its API can't sign in or load entries.

A git worktree is a fresh checkout sharing the main repo's history, so every
committed file comes along — including both apps' `.config/.env*` files of
non-secret dev defaults. Three things are gitignored and do **not** carry
over:

1. `node_modules/` — reinstall with `pnpm install`.
2. `worker-configuration.d.ts` — generated Worker binding types; regenerate with
   `pnpm cf-typegen`. The dev server boots without it (Vite doesn't typecheck), but
   `pnpm typecheck` and the editor error until it exists. `src/routeTree.gen.ts` is
   *tracked*, so it does carry over — don't confuse the two.
3. Secret env overrides (`*.local`, `.config/.dev.vars`) — copy from the main
   checkout **if they exist**. They usually don't.

Work through the steps below in order, from the worktree root.

## 1. Copy gitignored secret env files from the main checkout

The committed `.env` files are already present. This only rescues secret
overrides the main worktree happens to have; it's a safe no-op when there are
none.

```bash
SRC="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
DST="$(git rev-parse --show-toplevel)"
for f in \
  app/backend/api/.config/.env.development.local \
  app/frontend/web/.config/.env.local \
  app/frontend/web/.config/.env.development.local \
  app/frontend/web/.config/.dev.vars; do
  if [ "$SRC" != "$DST" ] && [ -f "$SRC/$f" ] && [ ! -f "$DST/$f" ]; then
    mkdir -p "$DST/$(dirname "$f")" && cp "$SRC/$f" "$DST/$f" && echo "copied $f"
  fi
done
```

Nothing copied is the normal case — proceed.

## 2. Install dependencies

pnpm hardlinks from the shared global store, so this is fast despite being a
separate `node_modules`. From the worktree root (installs every workspace):

```bash
pnpm install
```

Then regenerate the gitignored Worker binding types. Skip only if you won't run
`pnpm typecheck` — otherwise it fails on a missing `worker-configuration.d.ts`:

```bash
pnpm cf-typegen
```

## 3. Pick a free port for each server

Never reuse a listening port. Scan up from the defaults (web 3000, API 4000):

```bash
free_port() { p=$1; while lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; do p=$((p + 1)); done; echo "$p"; }
WEB_PORT=$(free_port 3000)
API_PORT=$(free_port 4000)
echo "web=$WEB_PORT api=$API_PORT"
```

Don't rely on Vite auto-incrementing — `strictPort` isn't set, so it would drift
to another port silently while the launch config still points the browser at the
original, and you'd open a dead tab (or worse, another worktree's tab).

## 4. Wire the two servers to each other

Both sides need to agree on the ports, and the API's CORS allowlist is an exact
origin (credentialed requests can't use `*`). Write the gitignored `.local`
overrides — they beat the committed defaults and never dirty the worktree:

```bash
printf 'PORT=%s\nFRONTEND_ORIGIN=http://localhost:%s\n' "$API_PORT" "$WEB_PORT" \
  >> app/backend/api/.config/.env.development.local
printf 'VITE_API_URL=http://localhost:%s/rpc\n' "$API_PORT" \
  >> app/frontend/web/.config/.env.development.local
```

`.env.development.local` is the highest-priority file Vite loads in dev mode, so
it wins over the `VITE_API_URL=http://localhost:4000/rpc` in the committed
`.config/.env`. Skip the web-side write only when `API_PORT` is 4000 *and* that
4000 is the API you just started from this worktree.

If step 1 copied an existing `app/backend/api/.config/.env.development.local`,
check it for an
earlier `PORT`/`FRONTEND_ORIGIN` and edit those lines instead of appending a
second copy.

## 5. Start Postgres (shared)

One Postgres container serves every worktree — this is the single piece of the
stack you should *not* duplicate:

```bash
docker compose up -d
```

It listens on host `:5433`. If it's already up, leave it.

## 6. Boot both servers

Use the Browser pane — never run a dev server with Bash. Add a per-worktree
config for each server to `.claude/launch.json`, substituting the real ports, then
`preview_start` each by name. Name them after the ports so two worktrees' configs
can't collide, and leave the shared `web` config alone:

```json
{
  "name": "web-3001",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": [
    "--filter", "@rhymelab/web", "exec",
    "vite", "dev", "--config", ".config/vite.config.ts",
    "--port", "3001", "--strictPort"
  ],
  "port": 3001
},
{
  "name": "api-4001",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["run", "dev:api"],
  "port": 4001
}
```

The API reads its port from `PORT` in the `.env.development.local` you wrote in
step 4; the
`port` field just tells the pane where the server lives. Start the API first, then
the web server. Editing `launch.json` dirties only this worktree's copy — it's
reversible.

## 7. Verify you're looking at *this* worktree

A rendered page is not proof. Confirm both processes are yours:

- `preview_logs` for each server — the web log should print the `WEB_PORT` you
  chose, and the API log the `API_PORT`.
- `read_console_messages` for startup errors, and `read_network_requests` to
  confirm the app's calls go to `http://localhost:<API_PORT>/rpc` and come back
  2xx, not CORS-rejected. A CORS failure means `FRONTEND_ORIGIN` doesn't match the
  web port.
- `read_page` for rendered content, then a `screenshot` as proof.

If anything points at a port you didn't pick, you're on another worktree's server
— stop it or move yours, don't report success.

For the signed-in-session details of a full three-service run, see the
`record-e2e` skill's preflight.
