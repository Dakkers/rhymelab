---
name: boot-frontend-worktree
description: >-
  Set up and boot the @rhymelab/web frontend dev server (localhost:3000) inside a
  git worktree — copy the gitignored secret env overrides that a fresh checkout
  doesn't carry, install node_modules, then launch the dev server. Use when the
  user wants to run/start/boot the web app or frontend in a worktree, spin up a
  freshly-created worktree to preview the web app, or fix a worktree where the
  frontend won't start because deps or env are missing.
---

# Boot the frontend in a worktree

A git worktree is a **fresh checkout** sharing the main repo's history. Every
committed file comes along automatically — including all the `.config/.env*`
files, which hold **non-secret dev defaults**. The app runs on those defaults
with zero env setup, so most worktrees need nothing copied.

Two things are gitignored and therefore do **not** carry into a new worktree:

1. `node_modules/` — must be reinstalled (`pnpm install`).
2. Any secret env overrides (`*.local`, `.config/.dev.vars`) — copy them from the
   main checkout **if they exist**. They usually don't; the committed defaults are
   enough to boot.

Do the three steps below in order from the worktree root.

## 1. Copy gitignored secret env files from the main checkout

The committed `.env` files are already present. This only rescues secret
overrides the main worktree happens to have. It's a no-op (and safe) when there
are none.

```bash
SRC="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
DST="$(git rev-parse --show-toplevel)"
for f in \
  app/backend/api/.env.local \
  app/frontend/web/.config/.env.local \
  app/frontend/web/.config/.env.development.local \
  app/frontend/web/.config/.dev.vars; do
  if [ "$SRC" != "$DST" ] && [ -f "$SRC/$f" ] && [ ! -f "$DST/$f" ]; then
    mkdir -p "$DST/$(dirname "$f")" && cp "$SRC/$f" "$DST/$f" && echo "copied $f"
  fi
done
```

If nothing is copied, that's expected — proceed. The committed `.config/.env`
(`VITE_API_URL=http://localhost:4000/rpc`) and `.env.development` are all the web
server needs to start.

## 2. Install dependencies

pnpm hardlinks from the shared global store, so this is fast even though it's a
separate `node_modules`. Run from the worktree root — it installs every workspace
(web included):

```bash
pnpm install
```

## 3. Boot the web dev server

Use the Browser pane, not Bash — never run the dev server with Bash. The `web`
config in `.claude/launch.json` runs `pnpm run dev:web` on port 3000:

- `preview_start` with `{ name: "web" }`.
- Then verify per the standard workflow: check `read_console_messages` /
  `preview_logs` for startup errors, `read_page` for rendered content, and a
  `screenshot` as proof.

## Live data needs the API stack too

The web server renders on its own, but all data and auth go to the oRPC API at
`http://localhost:4000/rpc`. For a frontend that actually loads entries / lets you
sign in, that stack must also be up (a single shared Postgres container serves
every worktree):

- Postgres — `docker compose up -d` (host `:5433`)
- API — `pnpm dev:api` (`:4000`)

See the `record-e2e` skill's preflight for the full three-service setup and the
signed-in session details. If the user only asked to see the frontend UI, step 3
alone is enough; mention the API dependency rather than starting the database for
them unprompted.
