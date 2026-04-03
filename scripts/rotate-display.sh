#!/usr/bin/env bash
set -euo pipefail

# Rotate the display on Raspberry Pi (Wayland/labwc).
#
# Usage:
#   bash scripts/rotate-display.sh          # interactive
#   bash scripts/rotate-display.sh 90       # rotate 90° clockwise (portrait)
#   bash scripts/rotate-display.sh 270      # rotate 270° (portrait, other way)
#   bash scripts/rotate-display.sh 180      # inverted
#   bash scripts/rotate-display.sh 0        # landscape (no rotation)

# --- Shared functions ---
source "$(dirname "$0")/lib/common.sh"

# Detect the output name
OUTPUT=$(wlr-randr 2>/dev/null | head -1 | awk '{print $1}' || echo "HDMI-A-1")

if [ -n "${1:-}" ]; then
  ANGLE="$1"
else
  echo ""
  echo "  Current output: ${OUTPUT}"
  echo ""
  echo "  Select rotation:"
  echo "  0)   Landscape (no rotation)"
  echo "  90)  Portrait (90° clockwise)"
  echo "  180) Inverted (180°)"
  echo "  270) Portrait (90° counter-clockwise)"
  echo ""
  read -rp "  Rotation [0]: " ANGLE
  ANGLE="${ANGLE:-0}"
fi

if [ "${ANGLE}" = "0" ]; then
  wlr-randr --output "${OUTPUT}" --transform normal
  info "Display set to landscape (no rotation)."
else
  wlr-randr --output "${OUTPUT}" --transform "${ANGLE}"
  info "Display rotated ${ANGLE}°."
fi

# Persist in kiosk.conf (used by labwc kiosk launcher)
# Read-modify-write: preserve existing values (DISPLAY_MODE, PI_VARIANT, etc.)
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"

# Load existing values
DISPLAY_MODE=""
PI_VARIANT=""
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

# Write all values back with the updated transform
: > "${KIOSK_CONF}"
[ -n "${DISPLAY_MODE}" ] && echo "DISPLAY_MODE=\"${DISPLAY_MODE}\"" >> "${KIOSK_CONF}"
if [ "${ANGLE}" != "0" ]; then
  echo "DISPLAY_TRANSFORM=\"${ANGLE}\"" >> "${KIOSK_CONF}"
fi
[ -n "${PI_VARIANT}" ] && echo "PI_VARIANT=\"${PI_VARIANT}\"" >> "${KIOSK_CONF}"

info "Rotation persisted. Will take effect on next reboot."

# Also update labwc autostart if it exists (legacy support)
AUTOSTART="${HOME}/.config/labwc/autostart"
if [ -f "${AUTOSTART}" ]; then
  sed -i '/wlr-randr/d' "${AUTOSTART}"
  if [ "${ANGLE}" != "0" ]; then
    sed -i "/chromium/i (sleep 2 && wlr-randr --output \"${OUTPUT}\" --transform ${ANGLE}) &" "${AUTOSTART}"
  fi
fi
