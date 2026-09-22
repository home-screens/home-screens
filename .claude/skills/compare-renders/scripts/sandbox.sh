#!/usr/bin/env bash
# Run a production build of this repo from a data-isolated sandbox.
#
#   sandbox.sh start <repo-root> <sandbox-dir> <port> <config.json> [assets-dir]
#   sandbox.sh stop <port>
#
# start: mirrors <repo-root> into <sandbox-dir> with symlinks (everything
# except data/ and public/, which become private directories), seeds
# data/config.json, and starts `next start` with the sandbox as cwd so every
# data path resolves inside it. Requires `npm run build` to have run in
# <repo-root> first. Files in [assets-dir] are copied into the sandbox's
# public/backgrounds before the server starts (Next lists public/ once at
# boot, so anything added later 404s). Prints the base URL when the server
# answers.
#
# stop: kills whatever listens on <port>. pkill on the `next start` parent
# leaves the next-server child holding the port, so stop by port, not name.
set -euo pipefail

cmd=${1:-}
case "$cmd" in
  start)
    root=$(cd "$2" && pwd); sb=$3; port=$4; config=$5; assets=${6:-}
    [ -f "$root/.next/BUILD_ID" ] || { echo "no production build in $root (.next/BUILD_ID missing); run npm run build there first" >&2; exit 1; }
    [ -f "$config" ] || { echo "config not found: $config" >&2; exit 1; }
    rm -rf "$sb"; mkdir -p "$sb/data" "$sb/public/backgrounds"
    for entry in $(ls -A "$root"); do
      case "$entry" in data|public|.git) ;; *) ln -s "$root/$entry" "$sb/$entry" ;; esac
    done
    for entry in $(ls "$root/public"); do
      [ "$entry" = backgrounds ] || ln -s "$root/public/$entry" "$sb/public/$entry"
    done
    cp "$config" "$sb/data/config.json"
    if [ -n "$assets" ]; then cp "$assets"/* "$sb/public/backgrounds/"; fi
    # HS_DISABLE_AUTO_UPDATE: a sandbox is a production server outside git, so
    # a seeded config with automatic updates on would try to update this machine.
    (cd "$sb" && env -u HOME_SCREENS_DIR NODE_ENV=production HS_DISABLE_AUTO_UPDATE=1 "$root/node_modules/.bin/next" start -p "$port" -H 127.0.0.1 > "$sb/server.log" 2>&1 &)
    for _ in $(seq 1 60); do
      if curl -sf -o /dev/null "http://127.0.0.1:$port/login"; then echo "http://127.0.0.1:$port"; exit 0; fi
      sleep 0.5
    done
    echo "server on $port did not come up; see $sb/server.log" >&2; exit 1
    ;;
  stop)
    port=$2
    pids=$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN || true)
    [ -n "$pids" ] && kill $pids && echo "stopped $port" || echo "nothing listening on $port"
    ;;
  *)
    sed -n '2,15p' "$0"; exit 1 ;;
esac
