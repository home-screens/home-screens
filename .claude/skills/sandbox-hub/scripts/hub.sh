#!/usr/bin/env bash
# Run a throwaway Home Screens hub with its own private data/, so a change can
# be tried in the real app without touching the real household.
#
#   hub.sh start <port> [--household] [--seed <data-dir>] [--config <file>]
#                       [--assets <dir>] [--root <tree>] [--dev]
#   hub.sh sync  <port>
#   hub.sh path  <port>
#   hub.sh stop  <port> [--keep]
#
# start  Builds a sandbox for <port> and starts a server in it. Prints the
#        base URL once the server answers.
#          --household    seed a made-up family of seven with chores, meals,
#                         lists, rewards and three screens (scripts/seed.mts)
#          --seed <dir>   copy every file in <dir> into the sandbox's data/
#                         (applied after --household, so it can override)
#          --config <file> use this one file as data/config.json (applied last)
#          --assets <dir> copy pictures into public/backgrounds before boot
#          --root <tree>  serve another checkout or worktree (default: the
#                         checkout this script lives in)
#          --dev          `next dev` on a copy of src/ instead of the
#                         production build; for /editor and /remote on work
#                         that is not built yet. /display needs the default.
#        Without --dev the tree needs a production build (`npm run build`).
#        TZ=<zone> in front of the command sets the hub's own time zone.
# sync   --dev only: copy the tree's src/ into the sandbox again after an edit.
# path   Print the sandbox directory (its data/ and server.log are inside).
# stop   Stop the server on <port> and delete its sandbox (--keep leaves it).
#
# The sandbox directory is always <tmp>/hs-sandbox-hub/<port>. It is never
# taken from the command line, so start and stop can only ever delete a
# directory this script made. stop refuses a port it did not start.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
default_root=$(cd "$here/../../../.." && pwd)
base="${TMPDIR:-/tmp}"; base="${base%/}/hs-sandbox-hub"
marker=.hs-sandbox-hub

die() { echo "hub.sh: $*" >&2; exit 1; }
usage() { sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

need_port() {
  case "${1:-}" in ''|*[!0-9]*) die "port must be a number, got '${1:-}'" ;; esac
  [ "$1" -ge 1024 ] && [ "$1" -le 65535 ] || die "port must be between 1024 and 65535"
}
listeners() { lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }
# Only a directory this script made carries the marker file.
owned() { [ -f "$1/$marker" ]; }
read_marker() { sed -n "s/^$2=//p" "$1/$marker"; }

link_public() {
  local root=$1 sb=$2 entry
  mkdir -p "$sb/public/backgrounds"
  # Uploads and deletes land in public/backgrounds, so it stays private; the
  # rest of public/ is read-only assets and is linked child by child.
  for entry in $(ls "$root/public"); do
    [ "$entry" = backgrounds ] || ln -s "$root/public/$entry" "$sb/public/$entry"
  done
  if [ -e "$root/public/backgrounds/default.svg" ]; then
    ln -s "$root/public/backgrounds/default.svg" "$sb/public/backgrounds/default.svg"
  fi
}

copy_src() {
  # --checksum without -t: only changed files are written, and each one gets
  # a fresh mtime. Keeping the edit's own mtime (rsync -a) lets the dev
  # watcher decide a file is already built and skip it without a word.
  rsync -rl --checksum --delete "$1/src/" "$2/src/"
}

cmd=${1:-}
case "$cmd" in
  start)
    port=${2:-}; need_port "$port"; shift 2
    root=$default_root; seed=; config=; assets=; household=0; mode=prod
    while [ $# -gt 0 ]; do
      case "$1" in
        --household) household=1; shift ;;
        --dev) mode=dev; shift ;;
        --seed) seed=${2:-}; shift 2 ;;
        --config) config=${2:-}; shift 2 ;;
        --assets) assets=${2:-}; shift 2 ;;
        --root) root=${2:-}; shift 2 ;;
        *) die "unknown option '$1'" ;;
      esac
    done
    [ -d "$root" ] || die "no such tree: $root"
    root=$(cd "$root" && pwd)
    [ -f "$root/src/lib/json-store.ts" ] || die "$root is not a Home Screens checkout"
    [ -x "$root/node_modules/.bin/next" ] || die "no node_modules in $root; run npm install there first"
    [ -z "$seed" ] || [ -d "$seed" ] || die "seed folder not found: $seed"
    [ -z "$config" ] || [ -f "$config" ] || die "config file not found: $config"
    [ -z "$assets" ] || [ -d "$assets" ] || die "assets folder not found: $assets"
    [ -z "$(listeners "$port")" ] || die "port $port is already in use; pick another, or run: hub.sh stop $port"
    if [ "$mode" = prod ] && [ ! -f "$root/.next/BUILD_ID" ]; then
      die "no production build in $root; run npm run build there first, or pass --dev"
    fi

    sb="$base/$port"
    if [ -e "$sb" ]; then
      owned "$sb" || die "$sb exists and was not made by this script; move it away first"
      rm -rf "$sb"
    fi
    mkdir -p "$sb/data"
    printf 'root=%s\nmode=%s\n' "$root" "$mode" > "$sb/$marker"

    if [ "$mode" = prod ]; then
      # Everything is read through links except data/ and public/, which are
      # private. Data paths resolve through the working directory, so starting
      # the server inside the sandbox is the whole isolation.
      for entry in $(ls -A "$root"); do
        case "$entry" in data|public|.git) ;; *) ln -s "$root/$entry" "$sb/$entry" ;; esac
      done
    else
      # The dev watcher does not follow a linked src/ (every route 404s), so
      # src/ is a real copy, kept current with `hub.sh sync`.
      mkdir -p "$sb/src" "$sb/.next"
      copy_src "$root" "$sb"
      for f in package.json next.config.mjs tsconfig.json postcss.config.mjs next-env.d.ts .env.local; do
        [ ! -f "$root/$f" ] || cp "$root/$f" "$sb/$f"
      done
      ln -s "$root/node_modules" "$sb/node_modules"
    fi
    link_public "$root" "$sb"

    if [ "$household" = 1 ]; then
      (cd "$root" && HS_SEED_ROOT="$root" node_modules/.bin/tsx "$here/seed.mts" "$sb/data")
    fi
    if [ -n "$seed" ]; then cp -R "$seed"/. "$sb/data/"; fi
    if [ -n "$config" ]; then cp "$config" "$sb/data/config.json"; fi
    if [ -n "$assets" ]; then cp -R "$assets"/. "$sb/public/backgrounds/"; fi

    # HS_DISABLE_AUTO_UPDATE: a seeded config with automatic updates on must
    # never update the machine the sandbox runs on.
    # HS_DISABLE_TELEMETRY: a fresh data/ has no install ID, so every sandbox
    # would otherwise count as a new install.
    # HOME_SCREENS_DIR is unset because the server prefers it over the working
    # directory, and a stray export would point the sandbox at the real data/.
    # `exec` so no shell lingers holding this script's output open: a caller
    # reading it through a pipe would otherwise wait for the server to exit.
    launch() {
      if [ "$mode" = prod ]; then
        (cd "$sb" && exec env -u HOME_SCREENS_DIR NODE_ENV=production HS_DISABLE_AUTO_UPDATE=1 HS_DISABLE_TELEMETRY=1 \
          "$root/node_modules/.bin/next" start -p "$port" -H 127.0.0.1 >> "$sb/server.log" 2>&1 < /dev/null) &
      else
        (cd "$sb" && exec env -u HOME_SCREENS_DIR -u NODE_ENV HS_DISABLE_AUTO_UPDATE=1 HS_DISABLE_TELEMETRY=1 \
          "$root/node_modules/.bin/next" dev --webpack -p "$port" -H 127.0.0.1 >> "$sb/server.log" 2>&1 < /dev/null) &
      fi
      server=$!
    }
    if [ "$mode" = prod ]; then tries=60; else tries=360; fi
    launch
    # When an AI coding tool starts it, `next dev` may stop once on first boot
    # to print an upgrade notice, and runs normally the second time. One
    # relaunch covers that; the notice stays in server.log.
    relaunches=1
    i=0
    while [ "$i" -lt "$tries" ]; do
      if curl -sf -o /dev/null "http://127.0.0.1:$port/login"; then
        # Dev answers /login a moment before a first-boot stop, so make sure
        # the server is still there before calling it up.
        sleep 2
        if kill -0 "$server" 2>/dev/null; then echo "http://127.0.0.1:$port"; exit 0; fi
      fi
      if ! kill -0 "$server" 2>/dev/null; then
        [ "$relaunches" -gt 0 ] || break
        relaunches=$((relaunches - 1)); launch
      fi
      sleep 0.5; i=$((i + 1))
    done
    die "the server on $port did not come up; see $sb/server.log"
    ;;

  sync)
    port=${2:-}; need_port "$port"; sb="$base/$port"
    owned "$sb" || die "no sandbox for port $port"
    [ "$(read_marker "$sb" mode)" = dev ] || die "sync is for --dev sandboxes; a production sandbox serves the tree's build (rebuild, then stop and start)"
    copy_src "$(read_marker "$sb" root)" "$sb"
    echo "synced src/ into $sb"
    ;;

  path)
    port=${2:-}; need_port "$port"; sb="$base/$port"
    owned "$sb" || die "no sandbox for port $port"
    echo "$sb"
    ;;

  stop)
    port=${2:-}; need_port "$port"; sb="$base/$port"
    # Without this a mistyped port would stop somebody's real server.
    owned "$sb" || die "no sandbox for port $port, so nothing was stopped"
    pids=$(listeners "$port")
    if [ -n "$pids" ]; then
      # By port, not by name: killing the `next start` parent leaves its
      # next-server child holding the port and serving the old build.
      kill $pids 2>/dev/null || true
      echo "stopped $port"
    else
      echo "nothing listening on $port"
    fi
    if [ "${3:-}" = --keep ]; then echo "kept $sb"; else rm -rf "$sb"; fi
    ;;

  *) usage ;;
esac
