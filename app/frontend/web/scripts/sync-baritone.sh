#!/usr/bin/env bash
#
# Rebuild the local Baritone design system and sync it into this app.
#
# pnpm installs `@saintly-software/baritone` as a `file:` dependency, which it
# COPIES into its content-addressed store at install time. Rebuilding Baritone's
# `dist/` does NOT update that copy — and `pnpm install --force` won't either,
# because pnpm keys the cache off the dependency path, not its contents. On top
# of that, Vite pre-bundles the dep into `node_modules/.vite` and won't
# re-optimize just because `node_modules` changed. So this script:
#   1. rebuilds Baritone's dist,
#   2. copies the fresh dist over pnpm's store copy,
#   3. clears Vite's pre-bundle cache.
# After it finishes, restart `pnpm dev` to load the rebuilt Baritone.
#
# Override the Baritone location with BARITONE_DIR=/path/to/repo if it doesn't
# sit at ../baritone-design-system next to this app.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BARITONE_DIR="${BARITONE_DIR:-$APP_DIR/../../../../baritone-design-system}"
PKG="@saintly-software/baritone"

if [ ! -d "$BARITONE_DIR" ]; then
  echo "error: Baritone source not found at $BARITONE_DIR" >&2
  echo "       set BARITONE_DIR=/path/to/baritone-design-system to override." >&2
  exit 1
fi

echo "==> Building Baritone ($BARITONE_DIR)"
( cd "$BARITONE_DIR" && pnpm build )

# Resolve the real (copied) location of the package inside pnpm's store. The
# entry in node_modules is a symlink into node_modules/.pnpm/...; realpath
# follows it to the actual directory we need to overwrite.
LINK="$APP_DIR/node_modules/$PKG"
if [ ! -e "$LINK" ]; then
  echo "error: $PKG is not installed under $APP_DIR/node_modules — run 'pnpm install' first." >&2
  exit 1
fi
STORE="$(node -e "process.stdout.write(require('fs').realpathSync(process.argv[1]))" "$LINK")"

echo "==> Syncing dist into pnpm store copy"
echo "    $STORE/dist"
rm -rf "$STORE/dist"
cp -R "$BARITONE_DIR/dist" "$STORE/dist"

echo "==> Clearing Vite dep cache"
rm -rf "$APP_DIR/node_modules/.vite"

echo
echo "Done. Restart your dev server (Ctrl-C, then 'pnpm dev') to load the rebuilt Baritone."
