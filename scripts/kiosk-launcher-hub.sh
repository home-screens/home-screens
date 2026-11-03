#!/usr/bin/env bash
# Launched as the labwc --session child: applies resolution, rotation, hides
# the cursor, then starts Chromium.  When this script (or Chromium) exits,
# labwc exits too, and the autologin cycle restarts everything.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load port (default 3000)
PORT=3000
if [ -f "${APP_DIR}/data/port.conf" ]; then
  _p=$(tr -d "[:space:]" < "${APP_DIR}/data/port.conf")
  [[ "${_p}" =~ ^[0-9]+$ ]] && PORT="${_p}"
fi

# Rotation and resolution, from kiosk.conf. kiosk-outputs.sh hands them to
# kanshi and starts it, and kanshi puts them back whenever a monitor
# reconnects; labwc itself forgets them. With autoEnableOutputs off in rc.xml
# (scripts/labwc-rc.sh) labwc leaves the screen off until kanshi switches it
# on, so this runs in the foreground: wait up to 2 s for labwc to list the
# screen, start kanshi, then wait up to 5 s for a lit screen before Chromium
# opens. On a setup without that line both waits end at once.
if [ -x "${APP_DIR}/scripts/kiosk-outputs.sh" ]; then
  for _i in $(seq 1 10); do
    wlr-randr 2>/dev/null | grep -q "^[^[:space:]]" && break
    sleep 0.2
  done
  "${APP_DIR}/scripts/kiosk-outputs.sh" start
  for _i in $(seq 1 25); do
    wlr-randr 2>/dev/null | grep -Eq "^[[:space:]]+Enabled: yes" && break
    sleep 0.2
  done
fi

# Hide cursor: triggers the HideCursor keybind defined in labwc rc.xml.
# The cursor reappears on mouse movement and stays hidden during touch.
(sleep 2 && wtype -M logo -k h -m logo) &

# Panel power agent: cuts the screen's power while the hub says this display
# is asleep (Sleep & dimming > "Switch the screen's power off too"). Watches
# our pid, which the exec below hands to Chromium, so it lives and dies with
# the browser.
if [ -x "${APP_DIR}/scripts/kiosk-power-agent.sh" ]; then
  "${APP_DIR}/scripts/kiosk-power-agent.sh" "$$" &
fi

# Clear Chromium crash state so kiosk mode is not overridden by a restore dialog.
CHROME_PREFS="${HOME}/.config/chromium/Default/Preferences"
if [ -f "${CHROME_PREFS}" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "${CHROME_PREFS}"
fi

# Purge session restore data so Chromium does not re-open the previous
# session's app window alongside the new --app window.  Without this, every
# reboot produces a duplicate tab that silently drains the command queue.
rm -rf "${HOME}/.config/chromium/Default/Sessions" 2>/dev/null || true

# Turn off Chromium's "Translate this page?" bubble. The page's <html lang>
# follows the configured locale, so a Danish display on an English-UI Chromium
# is offered a translation on every load. --disable-translate stopped doing
# anything years ago and no feature flag covers this: the offer is gated on the
# translate.enabled profile pref (what the TranslateEnabled policy sets), so
# seed it off before launch.
if [ -f "${CHROME_PREFS}" ]; then
  python3 -c 'import json,os,sys;p=sys.argv[1];d=json.load(open(p));d.setdefault("translate",{})["enabled"]=False;t=p+".tmp";f=open(t,"w");json.dump(d,f,separators=(",",":"));f.close();os.replace(t,p)' "${CHROME_PREFS}" 2>/dev/null || true
else
  mkdir -p "$(dirname "${CHROME_PREFS}")"
  echo '{"translate":{"enabled":false}}' > "${CHROME_PREFS}"
fi

# Wait for the Next.js server before launching Chromium (defense in depth:
# on first boot the server may be delayed by firstboot tasks).
for _i in $(seq 1 120); do
  (echo > /dev/tcp/localhost/${PORT}) 2>/dev/null && break
  sleep 1
done

# Chromium's --kiosk flag requests fullscreen itself. labwc configs written
# before that flag fired ToggleFullscreen on every new window, which flipped
# Chromium's fullscreen straight back off and left its app title strip on
# screen. labwc has no non-toggle fullscreen action, so the rule has to go:
# strip it from an older rc.xml and reload labwc before Chromium maps.
LABWC_RC="${HOME}/.config/labwc/rc.xml"
if [ -f "${LABWC_RC}" ] && grep -q 'ToggleFullscreen' "${LABWC_RC}"; then
  sed -i '/ToggleFullscreen/d' "${LABWC_RC}"
  pkill -HUP -x labwc 2>/dev/null || true
fi

# Launch Chromium in app mode. --kiosk makes it fullscreen on its own.
# --remote-debugging-port enables programmatic page reload after deploys/upgrades
# GPU flags improve animation/transition smoothness on the Pi
exec chromium \
  --app=http://localhost:${PORT}/display \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 \
  --kiosk \
  --check-for-update-interval=31536000 \
  --password-store=basic \
  --ozone-platform=wayland \
  --remote-debugging-port=9222 \
  --ignore-gpu-blocklist \
  --enable-zero-copy \
  --num-raster-threads=2 \
  --force-gpu-mem-available-mb=256
