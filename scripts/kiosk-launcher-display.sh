#!/usr/bin/env bash
# Display-only kiosk launcher. Reads DISPLAY_URL/BACKEND_URL from kiosk.conf,
# waits for the hub to respond, then launches Chromium pointed at the hub.
#
# This file used to be a heredoc inside install.sh, which meant every Pi
# froze its launcher at flash time — a Pi installed in March never gained a
# Chromium flag added in June. It is now a real repo file so the hub can
# serve it back to spokes through /api/display/kiosk-bundle (see
# scripts/kiosk-update.sh). Keep it self-contained: it is copied to
# ${APP_DIR}/scripts/ and runs with no repo checkout around it.
#
# NOTE ON THE FILENAME: this installs AS ${APP_DIR}/scripts/kiosk-launcher.sh,
# because that path is baked into the ~/.bash_profile autologin block on every
# Pi already in the field (see write_kiosk_block in lib/common.sh). The repo
# file carries the "-display" suffix only to distinguish it from the hub's
# launcher variant, which upgrade.sh generates at the same installed path.
#
# Boot-time strategy:
#   1. Try the hub immediately. If reachable, launch chromium with DISPLAY_URL.
#   2. Otherwise launch chromium with a local "Connecting…" splash and start a
#      background watcher. The watcher polls the hub; the moment it answers it
#      sends SIGTERM to chromium. labwc's autologin cycle then restarts the
#      whole stack and we re-enter this script — this time the immediate health
#      check succeeds and we open DISPLAY_URL directly.
#
# This pattern relies on the existing labwc-restart-on-exit cycle from the
# full install, so there is no DevTools fragility and no "exec foo &" confusion.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"

DISPLAY_URL=""
BACKEND_URL=""
DISPLAY_TRANSFORM=""
DISPLAY_MODE=""
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

if [ -z "${DISPLAY_URL}" ]; then
  echo "[kiosk-launcher] DISPLAY_URL not set in ${KIOSK_CONF}" >&2
  exit 1
fi

HEALTH_URL="${BACKEND_URL:-${DISPLAY_URL%/display/*}}/api/system/build-id"
SPLASH_URL="file://${APP_DIR}/share/connecting.html"

# Single immediate health check. We don't loop here because labwc's
# autologin-on-exit cycle re-runs this script every few seconds anyway,
# and we want the splash to render in the meantime.
HUB_UP="false"
curl -fsS --max-time 5 "${HEALTH_URL}" >/dev/null 2>&1 && HUB_UP="true"

# The update check runs BEFORE any of the boot side effects below, because it
# can end in `exec "$0"`. Anything started first would be started twice: the
# backgrounded wlr-randr/wtype subshells survive an exec, so a relaunching boot
# would fire two delayed rotations at the same output.
if [ "${HUB_UP}" = "true" ] && [ -z "${HS_KIOSK_RELAUNCHED:-}" ]; then
  # The hub answered, so this is the cheapest moment to pull the shell layer
  # forward: we are about to start Chromium anyway, so applying an update and
  # re-execing costs the user nothing. kiosk-update.sh exits 10 when it
  # actually swapped files in.
  #
  # HS_KIOSK_RELAUNCHED guards against an exec loop: if the freshly installed
  # launcher somehow reports "applied" again, the second pass skips the check
  # entirely and just starts Chromium.
  UPDATER="${APP_DIR}/scripts/kiosk-update.sh"
  if [ -x "${UPDATER}" ]; then
    UPDATE_RC=0
    "${UPDATER}" --timeout 20 || UPDATE_RC=$?
    if [ "${UPDATE_RC}" -eq 10 ]; then
      echo "[kiosk-launcher] display software updated — relaunching" >&2
      export HS_KIOSK_RELAUNCHED=1
      # "$0" rather than a literal name: the updater just replaced this file
      # by rename, so re-execing the same path picks up the new script.
      exec "$0" "$@"
    fi
  fi
fi

# Apply rotation/resolution in the background. Same flow as the full install.
if [ -n "${DISPLAY_TRANSFORM}" ] || [ -n "${DISPLAY_MODE}" ]; then
  OUTPUT=$(wlr-randr 2>/dev/null | head -1 | awk '{print $1}' || echo 'HDMI-A-1')
  [ -n "${DISPLAY_TRANSFORM}" ] && (sleep 1 && wlr-randr --output "${OUTPUT}" --transform "${DISPLAY_TRANSFORM}") &
  [ -n "${DISPLAY_MODE}" ] && \
    (sleep 2 && wlr-randr --output "${OUTPUT}" --mode "${DISPLAY_MODE}" 2>/dev/null \
      || wlr-randr --output "${OUTPUT}" --custom-mode "${DISPLAY_MODE}" 2>/dev/null \
      || true) &
fi

(sleep 2 && wtype -M logo -k h -m logo) &

CHROME_PREFS="${HOME}/.config/chromium/Default/Preferences"
if [ -f "${CHROME_PREFS}" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "${CHROME_PREFS}"
fi

# Purge session restore data so Chromium does not re-open the previous
# session's app window alongside the new --app window.  Without this, every
# reboot produces a duplicate tab that silently drains the command queue.
rm -rf "${HOME}/.config/chromium/Default/Sessions" 2>/dev/null || true

if [ "${HUB_UP}" = "true" ]; then
  TARGET_URL="${DISPLAY_URL}"
else
  TARGET_URL="${SPLASH_URL}"
  # Background watcher: when the hub comes online, kill chromium so labwc
  # exits and the bash_profile auto-launch picks the real URL on the next
  # cycle. Loop terminates with chromium so we don't leak the watcher.
  (
    while sleep 5; do
      if curl -fsS --max-time 3 "${HEALTH_URL}" >/dev/null 2>&1; then
        pkill -TERM chromium 2>/dev/null || true
        break
      fi
    done
  ) &
fi

# Flag list must stay in step with the hub launcher in upgrade.sh and with
# start-display.sh. --remote-debugging-port is what lets a deploy reload the
# page over CDP instead of killing and relaunching the browser.
exec chromium \
  --app="${TARGET_URL}" \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-translate \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --password-store=basic \
  --ozone-platform=wayland \
  --remote-debugging-port=9222 \
  --ignore-gpu-blocklist \
  --enable-zero-copy \
  --num-raster-threads=2 \
  --force-gpu-mem-available-mb=256
