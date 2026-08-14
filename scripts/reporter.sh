#!/usr/bin/env bash
# Home Screens per-Pi hardware reporter.
#
# Runs under a systemd timer (home-screens-reporter.timer, ticks every 30s).
# Reads hardware snapshots from /sys, /proc, vcgencmd, free, df, assembles a
# JSON payload, and curls it to the hub's POST /api/display/hw-stats endpoint.
#
# Fields are OMITTED (jq null) when the underlying source isn't readable —
# that keeps the script safe on dev macOS and non-Pi Linux hosts without
# special-casing the platform. Any missing value is reported as null, not
# removed from the payload.
#
# Configuration (via /etc/default/home-screens-reporter or env):
#   HOME_SCREENS_DISPLAY_ID         — display slug (e.g. "kitchen")
#   HOME_SCREENS_HUB_URL            — hub base URL (e.g. "http://192.168.1.2:3000")
#
# Authorization:
#   The hub's /api/display/hw-stats endpoint is gated only by adoption — the
#   displayId must appear in config.displays (or be 'main' in legacy single-
#   display mode). No bearer token is required. The LAN is the trust
#   boundary, same as the display-page SSR the browser already relies on.
#
#   Before adoption: hub returns 403 (harmless; reporter retries next tick).
#   After adoption:  posts succeed and hwStats flow to the Stats page.
#
# Dev-loop flags:
#   REPORTER_DRY_RUN=1              — print payload to stdout, don't POST
set -euo pipefail

# --- Config -----------------------------------------------------------------
CONF=/etc/default/home-screens-reporter
# shellcheck disable=SC1090
[ -r "${CONF}" ] && . "${CONF}"

DISPLAY_ID="${HOME_SCREENS_DISPLAY_ID:-}"
HUB_URL="${HOME_SCREENS_HUB_URL:-}"

if [ -z "${DISPLAY_ID}" ] || [ -z "${HUB_URL}" ]; then
  logger -t home-screens-reporter "missing DISPLAY_ID or HUB_URL — skipping tick" 2>/dev/null || true
  exit 0
fi

# --- Helpers ----------------------------------------------------------------
read_or_null() {
  # stdout: value, or blank (jq will interpret empty --arg as "")
  local f="$1"
  [ -r "${f}" ] && cat "${f}" || echo ""
}

# --- Pi model ---------------------------------------------------------------
PI_MODEL=$(read_or_null /sys/firmware/devicetree/base/model | tr -d '\0')

# --- CPU --------------------------------------------------------------------
CPU_MODEL=""
if [ -r /proc/cpuinfo ]; then
  CPU_MODEL=$(grep -m1 -E '^(Model|model name)' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//' || echo "")
fi
CPU_CORES=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)

# --- Thermal ----------------------------------------------------------------
# LC_ALL=C pins awk's printf decimal separator to "." — otherwise a Pi set to
# a comma-locale (de_DE, fr_FR) would emit "44,25" which jq's `tonumber` then
# rejects, and the whole reporter tick fails silently.
CPU_TEMP_MILLI=$(read_or_null /sys/class/thermal/thermal_zone0/temp)
if [ -n "${CPU_TEMP_MILLI}" ] && [ "${CPU_TEMP_MILLI}" -ge 0 ] 2>/dev/null; then
  CPU_TEMP_C=$(LC_ALL=C awk "BEGIN { printf \"%.2f\", ${CPU_TEMP_MILLI} / 1000 }")
else
  CPU_TEMP_C=""
fi

# --- Load -------------------------------------------------------------------
if [ -r /proc/loadavg ]; then
  read -r LOAD1 LOAD5 LOAD15 _ < /proc/loadavg
else
  LOAD1=0; LOAD5=0; LOAD15=0
fi

# --- Throttled (Pi-only) ----------------------------------------------------
THROTTLED_JSON="null"
if command -v vcgencmd >/dev/null 2>&1; then
  RAW=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2 || echo "")
  if [ -n "${RAW}" ]; then
    # See https://www.raspberrypi.com/documentation/computers/os.html#get_throttled
    DEC=$((RAW))
    ACTIVE=$(( (DEC & 0x7) != 0 ))          # bits 0-2: currently throttling/under-volt/freq-capped
    UNDERVOLT=$(( (DEC & 0x1) != 0 ))
    PREV=$(( (DEC & 0x70000) != 0 ))         # bits 16-18: has-occurred flags
    THROTTLED_JSON=$(jq -n \
      --arg raw "${RAW}" \
      --argjson active "${ACTIVE}" \
      --argjson underVoltage "${UNDERVOLT}" \
      --argjson previouslyThrottled "${PREV}" \
      '{raw: $raw, active: ($active==1), underVoltage: ($underVoltage==1), previouslyThrottled: ($previouslyThrottled==1)}')
  fi
fi

# --- Memory -----------------------------------------------------------------
# LC_ALL=C keeps `free`'s header row in English ("Mem:") so the awk pattern
# match doesn't break on localized output, and forces integer formatting on
# the $7+$4 sum so jq's --argjson accepts it.
MEM_TOTAL=0; MEM_FREE=0
if command -v free >/dev/null 2>&1; then
  read -r MEM_TOTAL MEM_FREE < <(LC_ALL=C free -b 2>/dev/null | awk '/^Mem:/ {print $2, $7+$4}' || echo "0 0")
fi
MEM_TOTAL=${MEM_TOTAL:-0}
MEM_FREE=${MEM_FREE:-0}

# --- Disk -------------------------------------------------------------------
DISK_TOTAL=0; DISK_FREE=0
if command -v df >/dev/null 2>&1; then
  read -r DISK_TOTAL DISK_FREE < <(LC_ALL=C df -B1 / 2>/dev/null | awk 'NR==2 {print $2, $4}' || echo "0 0")
fi
DISK_TOTAL=${DISK_TOTAL:-0}
DISK_FREE=${DISK_FREE:-0}

# --- Display software (spoke shell layer) -----------------------------------
# Two separate facts, because they answer two different questions in the
# editor. `kioskUpdater` says whether this Pi is on the self-updating path at
# all — a Pi flashed before self-update existed reports false (as does an old
# reporter, which simply omits both fields) and the editor offers the
# one-line bootstrap command. `kioskVersion` is the applied bundle version,
# null until the first update lands, which is the normal state for a Pi
# installed minutes ago.
# The probe needs BOTH the updater script and a hub in kiosk.conf. The updater
# alone is not enough: the release tarball ships the whole scripts/ tree, so a
# full (hub) install has that file too, and reporting "updates installed" there
# would leave the editor waiting forever for a check that no timer will run.
# BACKEND_URL is the same marker kiosk-update.sh uses as its own hub guard, so
# the two can't disagree about what counts as a managed display.
#
# grep, not source: this runs as root under systemd and kiosk.conf is writable
# by the kiosk user, so sourcing it would execute user-writable content as root.
APP_DIR="${HOME_SCREENS_APP_DIR:-/opt/home-screens/current}"
KIOSK_UPDATER="false"
KIOSK_VERSION=""
if [ -x "${APP_DIR}/scripts/kiosk-update.sh" ] \
   && grep -q '^BACKEND_URL=' "${APP_DIR}/data/kiosk.conf" 2>/dev/null; then
  KIOSK_UPDATER="true"
  if [ -r "${APP_DIR}/data/kiosk-bundle.version" ]; then
    KIOSK_VERSION=$(head -c 128 "${APP_DIR}/data/kiosk-bundle.version" | tr -d '[:space:]')
  fi
fi

# --- Assemble payload -------------------------------------------------------
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

HW_JSON=$(jq -n \
  --arg piModel "${PI_MODEL}" \
  --arg cpuModel "${CPU_MODEL}" \
  --argjson cpuCores "${CPU_CORES}" \
  --arg cpuTempC "${CPU_TEMP_C}" \
  --argjson load1 "${LOAD1}" --argjson load5 "${LOAD5}" --argjson load15 "${LOAD15}" \
  --argjson throttled "${THROTTLED_JSON}" \
  --argjson memoryTotal "${MEM_TOTAL}" --argjson memoryFree "${MEM_FREE}" \
  --argjson diskTotal "${DISK_TOTAL}" --argjson diskFree "${DISK_FREE}" \
  --arg kioskVersion "${KIOSK_VERSION}" \
  --argjson kioskUpdater "${KIOSK_UPDATER}" \
  --arg reportedAt "${NOW_ISO}" \
  '{
     piModel:    (if $piModel  == "" then null else $piModel  end),
     cpuModel:   (if $cpuModel == "" then null else $cpuModel end),
     cpuCores:   $cpuCores,
     cpuTempC:   (if $cpuTempC == "" then null else ($cpuTempC | tonumber) end),
     load1: $load1, load5: $load5, load15: $load15,
     throttled: $throttled,
     memoryTotal: $memoryTotal, memoryFree: $memoryFree,
     diskTotal: $diskTotal, diskFree: $diskFree,
     kioskUpdater: $kioskUpdater,
     kioskVersion: (if $kioskVersion == "" then null else $kioskVersion end),
     reportedAt: $reportedAt
   }')

# /api/display/hw-stats accepts just { displayId, hwStats } — no stub
# DisplayStatus fields, no bearer token. The adoption gate on the server
# replaces withDisplayAuth for this path.
BODY=$(jq -n \
  --arg displayId "${DISPLAY_ID}" \
  --argjson hwStats "${HW_JSON}" \
  '{ displayId: $displayId, hwStats: $hwStats }')

if [ "${REPORTER_DRY_RUN:-0}" = "1" ]; then
  echo "${BODY}"
  exit 0
fi

# --- POST -------------------------------------------------------------------
HTTP=$(curl -fsS --max-time 10 \
  -o /tmp/home-screens-reporter-resp.$$ \
  -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "${BODY}" \
  "${HUB_URL}/api/display/hw-stats" || echo "000")
rm -f /tmp/home-screens-reporter-resp.$$

if [ "${HTTP}" != "200" ]; then
  logger -t home-screens-reporter "POST /api/display/hw-stats failed (HTTP ${HTTP})" 2>/dev/null || true
fi
