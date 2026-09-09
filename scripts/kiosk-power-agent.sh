#!/usr/bin/env bash
# Home Screens panel power agent.
#
# Sleep in Home Screens is a black layer the browser paints over the page; the
# HDMI signal stays live and an LCD backlight glows in a dark room. This agent
# is what actually cuts the panel's power. It runs inside the kiosk session
# (spawned by the kiosk launcher before Chromium starts, on hub Pis and
# display-only spokes alike), polls the hub's power-state endpoint, and drives
# the panel with wlopm, which speaks the wlr-output-power-management protocol
# labwc implements. Unlike `wlr-randr --off`, wlopm keeps the output in the
# layout, so the Chromium window, rotation and mode all survive.
#
# The hub decides, this script obeys. `GET /api/display/power-state` answers
# `off` only while the display has opted in (Sleep & dimming > "Switch the
# screen's power off too"), its browser reports asleep, and that heartbeat is
# fresh. Every ambiguity on either side resolves to ON: three failed polls in
# a row force the panel on, and the EXIT trap turns it on when this script
# dies, so a kiosk restart mid-sleep never strands the panel dark.
#
# Usage:
#   kiosk-power-agent.sh [<watch-pid>]
#
#   watch-pid   Exit (and restore power) once this pid is gone. The launcher
#               passes its own $$, which `exec chromium` preserves, so the
#               agent lives exactly as long as the browser.
#
# Configuration comes from data/kiosk.conf (BACKEND_URL, DISPLAY_ID). A hub Pi
# has neither: it asks as `main` at localhost on the port in data/port.conf.
#
# Test hooks (never set in production):
#   HS_POWER_STATE_URL      full URL to poll instead of the hub (curl handles file://)
#   HS_POWER_POLL_SECONDS   poll interval (default 3)
#   HS_POWER_RETRY_SECONDS  how often to look for a missing wlopm (default 60)
#
# Keep this self-contained: it ships to spokes through the kiosk bundle and
# runs with no repo checkout around it.
set -u

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"
WATCH_PID="${1:-}"
POLL_SECONDS="${HS_POWER_POLL_SECONDS:-3}"
RETRY_SECONDS="${HS_POWER_RETRY_SECONDS:-60}"
# Consecutive failed polls before the panel is forced on. At the default
# cadence that is nine seconds of hub silence — long enough to ride out a
# restart of the hub service, short enough that a dead hub never leaves a
# dark panel for long.
MAX_FAILURES=3

log() {
  logger -t home-screens-power "$*" 2>/dev/null || true
}

# A spoke can receive this script through the bundle before the apt package
# lands (the archive was unreachable, say); the nightly update retries the
# package without restarting Chromium. So a missing wlopm is a wait, not an
# exit: keep watching the browser and start the moment the command appears.
# Until then the black overlay covers sleep, exactly as before.
if ! command -v wlopm >/dev/null 2>&1; then
  log "wlopm is not installed; waiting for it before controlling panel power"
  while ! command -v wlopm >/dev/null 2>&1; do
    if [ -n "${WATCH_PID}" ] && ! kill -0 "${WATCH_PID}" 2>/dev/null; then
      exit 0
    fi
    sleep "${RETRY_SECONDS}"
  done
  log "wlopm is now installed; panel power control starting"
fi

BACKEND_URL=""
DISPLAY_ID=""
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

if [ -z "${DISPLAY_ID}" ]; then
  DISPLAY_ID="main"
fi
if [ -z "${BACKEND_URL}" ]; then
  PORT=3000
  if [ -f "${APP_DIR}/data/port.conf" ]; then
    _p=$(tr -d '[:space:]' < "${APP_DIR}/data/port.conf")
    [[ "${_p}" =~ ^[0-9]+$ ]] && PORT="${_p}"
  fi
  BACKEND_URL="http://localhost:${PORT}"
fi

if [ -n "${HS_POWER_STATE_URL:-}" ]; then
  URL="${HS_POWER_STATE_URL}"
  # A test URL is taken verbatim: no query parameters are appended to it.
  REPORT_APPLIED="false"
else
  URL="${BACKEND_URL}/api/display/power-state?display=${DISPLAY_ID}"
  REPORT_APPLIED="true"
fi

# The state this agent last set. Boot state is always on: labwc enables
# outputs when it starts, and we assert it below so a previous agent that
# died without its trap cannot leave a stale off behind.
APPLIED="on"
FAILURES=0

set_power() {
  # $1 is "on" or "off". Records what was applied only on success, so a
  # failed wlopm call is retried on the next tick rather than assumed.
  if wlopm "--$1" '*' 2>/dev/null; then
    if [ "${APPLIED}" != "$1" ]; then
      log "panel $1"
    fi
    APPLIED="$1"
  else
    log "wlopm --$1 failed"
  fi
}

# Any output the compositor currently reports as on. Used while the desired
# state is off: some monitors run input detection after losing signal and
# briefly present as reconnected, which labwc auto-enables, so a single
# `--off` is not enough. Empty output (or an unparseable listing) is treated
# as "nothing to re-assert" rather than as a reason to hammer wlopm.
any_output_on() {
  wlopm 2>/dev/null | grep -Eq '[[:space:]]on$'
}

restore_on_exit() {
  wlopm --on '*' 2>/dev/null || true
}
trap restore_on_exit EXIT
# A signal must end the loop, not just interrupt one sleep: a handler that
# returned would resume polling and could switch the panel straight back off.
# Exiting here runs the EXIT trap above, which is where power is restored.
trap 'exit 143' INT TERM

set_power on

while :; do
  if [ -n "${WATCH_PID}" ] && ! kill -0 "${WATCH_PID}" 2>/dev/null; then
    break
  fi

  poll_url="${URL}"
  if [ "${REPORT_APPLIED}" = "true" ]; then
    poll_url="${URL}&applied=${APPLIED}"
  fi

  if body=$(curl -fsS --max-time 3 "${poll_url}" 2>/dev/null); then
    FAILURES=0
    if printf '%s' "${body}" | grep -Eq '"power"[[:space:]]*:[[:space:]]*"off"'; then
      desired="off"
    else
      desired="on"
    fi
  else
    FAILURES=$((FAILURES + 1))
    if [ "${FAILURES}" -ge "${MAX_FAILURES}" ]; then
      desired="on"
    else
      desired="${APPLIED}"
    fi
  fi

  if [ "${desired}" != "${APPLIED}" ]; then
    set_power "${desired}"
  elif [ "${desired}" = "off" ] && any_output_on; then
    set_power off
  fi

  sleep "${POLL_SECONDS}"
done
