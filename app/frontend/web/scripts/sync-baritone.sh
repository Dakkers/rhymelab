#!/usr/bin/env bash
#
# Rebuild the local Baritone design system and sync it into this app.
# Restart `pnpm dev` afterward.
#
# pnpm copies a `file:` dependency into its store at install time and keys it
# by path, not contents, so neither a rebuild nor `pnpm install --force`
# refreshes it. Vite's pre-bundle cache is stale too, so it's cleared.
#
# BARITONE_DIR overrides the Baritone checkout location.
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
