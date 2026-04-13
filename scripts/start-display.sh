#!/usr/bin/env bash
set -euo pipefail

# Start Home Screens display manually
# Usage: ./start-display.sh [project-dir]

APP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"

# --- Shared functions ---
source "$(dirname "$0")/lib/common.sh"

SERVER_PID=""
BROWSER_PID=""

cleanup() {
  echo "Shutting down..."
  [ -n "${BROWSER_PID}" ] && kill "${BROWSER_PID}" 2>/dev/null || true
  [ -n "${SERVER_PID}" ] && kill "${SERVER_PID}" 2>/dev/null || true
  wait 2>/dev/null
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

cd "${APP_DIR}"

echo "Building project..."
npm run build

echo "Starting Next.js server on port ${PORT}..."
PORT="${PORT}" npm start &
SERVER_PID=$!

echo "Waiting for server to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:${PORT} > /dev/null 2>&1; then
    echo "Server is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Server failed to start within 30 seconds."
    cleanup
  fi
  sleep 1
done

# Clear crash state and session restore data to avoid duplicate app windows
CHROME_PREFS="${HOME}/.config/chromium/Default/Preferences"
if [ -f "${CHROME_PREFS}" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "${CHROME_PREFS}"
fi
rm -rf "${HOME}/.config/chromium/Default/Sessions" 2>/dev/null || true

echo "Launching Chromium in app mode..."
chromium \
  --app=http://localhost:${PORT}/display \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-translate \
  --remote-debugging-port=9222 \
  --ignore-gpu-blocklist \
  --enable-zero-copy \
  --num-raster-threads=2 \
  --force-gpu-mem-available-mb=256 &
BROWSER_PID=$!

echo "Display running. Press Ctrl+C to stop."
wait
