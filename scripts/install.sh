#!/usr/bin/env bash
set -euo pipefail

# Home Screens - Raspberry Pi Install Script
# Downloads a pre-built release from GitHub and configures the kiosk.
#
# Usage:
#   git clone https://github.com/home-screens/home-screens.git
#   ~/home-screens/scripts/install.sh                        # Pi OS Lite (default)
#   ~/home-screens/scripts/install.sh --desktop              # Pi OS with Desktop
#   ~/home-screens/scripts/install.sh --version v1.2.0       # Install a specific release
#   ~/home-screens/scripts/install.sh --non-interactive      # Skip display prompts (use defaults)
#
# Display-only install (no backend, just a kiosk pointed at a hub Pi):
#   ~/home-screens/scripts/install.sh --display-only --backend http://192.168.1.100:3000
#   ~/home-screens/scripts/install.sh --display-only --backend http://hub:3000 --display-id kitchen
#
# After the install reboots, adopt the Pi on the hub:
#   Settings → Displays → Unadopted → click the Pi's id. No token to paste.

# --- Self-download guard (enables: curl -fsSL <url> | bash) ─────────────
# When running standalone without companion files (lib/common.sh, boot-splash/),
# download them from GitHub to a temp directory and re-launch from there.
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd 2>/dev/null || echo "")"
if [ -z "${_SCRIPT_DIR}" ] || [ ! -f "${_SCRIPT_DIR}/lib/common.sh" ]; then
  _TMP="$(mktemp -d)"
  _REPO="home-screens/home-screens"
  _BRANCH="main"
  _BASE="https://raw.githubusercontent.com/${_REPO}/${_BRANCH}/scripts"
  printf '\n  Downloading installer files...\n\n'
  mkdir -p "${_TMP}/lib" "${_TMP}/boot-splash"
  curl -fsSL "${_BASE}/install.sh" -o "${_TMP}/install.sh"
  curl -fsSL "${_BASE}/lib/common.sh" -o "${_TMP}/lib/common.sh"
  for _f in home-screens.plymouth home-screens.script logo.png dot.png; do
    curl -fsSL "${_BASE}/boot-splash/${_f}" -o "${_TMP}/boot-splash/${_f}"
  done
  # Reporter files — required so display-only installs run via `curl | bash`
  # can install the hardware reporter. Without these the install_reporter()
  # call below falls through to its "Reporter script not found" warning and
  # the Pi silently skips hw-stats posting, contradicting the adoption UI.
  for _f in reporter.sh home-screens-reporter.service home-screens-reporter.timer; do
    curl -fsSL "${_BASE}/${_f}" -o "${_TMP}/${_f}"
  done
  _HS_BOOTSTRAP_TMP="${_TMP}" exec bash "${_TMP}/install.sh" "$@"
fi

# Clean up bootstrap temp dir if we were re-launched by the guard above.
if [ -n "${_HS_BOOTSTRAP_TMP:-}" ]; then
  trap 'rm -rf "${_HS_BOOTSTRAP_TMP}"' EXIT
fi

INSTALL_BASE="/opt/home-screens"
APP_DIR="${INSTALL_BASE}/current"
REPO="home-screens/home-screens"
NODE_MAJOR=22

# --- Shared functions ---
source "$(dirname "$0")/lib/common.sh"

# --- Install log ---
setup_logging

# --- Parse flags ---
PI_VARIANT="lite"
REQUESTED_VERSION=""
REQUESTED_PORT=""
DISPLAY_ONLY="false"
BACKEND_URL=""
DISPLAY_NODE_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --desktop) PI_VARIANT="desktop"; shift ;;
    --version)
      if [ -z "${2:-}" ]; then error "--version requires a tag (e.g. --version v1.2.0)"; fi
      REQUESTED_VERSION="$2"; shift 2 ;;
    --port)
      if [ -z "${2:-}" ]; then error "--port requires a number (e.g. --port 8080)"; fi
      if ! [[ "${2}" =~ ^[0-9]+$ ]]; then error "--port must be a number (e.g. --port 8080)"; fi
      REQUESTED_PORT="$2"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE="true"; shift ;;
    --display-only) DISPLAY_ONLY="true"; shift ;;
    --backend)
      if [ -z "${2:-}" ]; then error "--backend requires a URL (e.g. --backend http://hub:3000)"; fi
      BACKEND_URL="$2"; shift 2 ;;
    --display-id)
      if [ -z "${2:-}" ]; then error "--display-id requires a value (e.g. --display-id kitchen)"; fi
      DISPLAY_NODE_ID="$2"; shift 2 ;;
    *)      error "Unknown option: $1" ;;
  esac
done

# --- Reporter helper (display-only Pis only) ---
# Installs /usr/local/bin/home-screens-reporter.sh + systemd unit files +
# /etc/default/home-screens-reporter. The reporter POSTs to
# /api/display/hw-stats on the hub, which is gated only by
# requireAdoptedDisplay — no bearer token needed. Arguments:
#   $1 = display ID (e.g. "kitchen")
#   $2 = hub base URL (e.g. "http://192.168.1.100:3000")
install_reporter() {
  local display_id="$1"
  local hub_url="$2"
  local script_src="${APP_DIR}/scripts/reporter.sh"

  # --display-only Pis don't have APP_DIR/scripts/reporter.sh yet — fall back
  # to the repo clone (or bootstrap temp dir) where the installer actually ran.
  if [ ! -f "${script_src}" ]; then
    script_src="$(cd "$(dirname "$0")" && pwd)/reporter.sh"
  fi

  if [ ! -f "${script_src}" ]; then
    warn "Reporter script not found at ${script_src} — skipping reporter install."
    return 1
  fi

  sudo install -m 0755 "${script_src}" /usr/local/bin/home-screens-reporter.sh

  sudo install -m 0644 "$(dirname "${script_src}")/home-screens-reporter.service" \
    /etc/systemd/system/home-screens-reporter.service
  sudo install -m 0644 "$(dirname "${script_src}")/home-screens-reporter.timer" \
    /etc/systemd/system/home-screens-reporter.timer

  sudo tee /etc/default/home-screens-reporter >/dev/null <<EOF
HOME_SCREENS_DISPLAY_ID=${display_id}
HOME_SCREENS_HUB_URL=${hub_url}
EOF
  sudo chmod 0644 /etc/default/home-screens-reporter

  sudo systemctl daemon-reload
  sudo systemctl enable --now home-screens-reporter.timer
}

# --- Preflight ---
ensure_tty
check_arch
check_not_root

# --- Display-only branch: skip Node, tarball, server setup. Just kiosk. ---
if [ "${DISPLAY_ONLY}" = "true" ]; then
  if [ -z "${BACKEND_URL}" ]; then
    error "--display-only requires --backend <url> (e.g. --backend http://192.168.1.100:3000)"
  fi
  # Strip trailing slash so URL composition stays clean
  BACKEND_URL="${BACKEND_URL%/}"

  # Auto-generate a display ID from the hostname when none was given.
  # Lowercase, swap any non-alnum to '-', strip leading/trailing dashes,
  # truncate to leave room for a 5-char "-XXXX" suffix, and append four
  # random lowercase-alphanumeric characters from /dev/urandom. The
  # suffix prevents two Pis with the same hostname (the Raspberry Pi OS
  # default of "raspberrypi" is a classic case) from colliding on the
  # same display id when they're both adopted via --display-only.
  if [ -z "${DISPLAY_NODE_ID}" ]; then
    HOST_SLUG=$(hostname \
      | tr '[:upper:]' '[:lower:]' \
      | sed 's/[^a-z0-9]/-/g; s/^-*//; s/-*$//' \
      | cut -c1-59 \
      | sed 's/-*$//')
    if [ -z "${HOST_SLUG}" ]; then
      HOST_SLUG="display"
    fi
    # LC_ALL=C makes tr treat /dev/urandom as bytes regardless of locale.
    # The 2>/dev/null swallows the harmless "broken pipe" warning, and the
    # outer ( ... ) || true keeps `set -euo pipefail` from killing the
    # script when tr exits 141 after head -c 4 closes the pipe — without
    # this guard the whole install silently exits right after the banner.
    RAND_SUFFIX=$( (LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom 2>/dev/null | head -c 4) || true)
    if [ "${#RAND_SUFFIX}" -ne 4 ]; then
      # Fallback: very unusual /dev/urandom failure. $RANDOM is enough
      # entropy for a 4-char suffix when we just need a tiebreaker.
      RAND_SUFFIX=$(printf '%04x' $((RANDOM % 65536)))
    fi
    DISPLAY_NODE_ID="${HOST_SLUG}-${RAND_SUFFIX}"
    info "Auto-generated display ID: ${DISPLAY_NODE_ID} (override with --display-id)"
  fi

  # Validate the ID is URL-safe and within the 64-char cap enforced by
  # display-filter.ts + display-commands.ts. Without this cap, a hostname
  # like an overly long auto-generated string would pass the regex here and
  # then get silently rejected by the API layer — the display would never
  # show up in the editor's unadopted list with no visible error.
  if ! [[ "${DISPLAY_NODE_ID}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    error "Invalid --display-id '${DISPLAY_NODE_ID}': must be lowercase letters, digits, hyphens (e.g. kitchen, bedroom-tv)"
  fi
  if [ "${#DISPLAY_NODE_ID}" -gt 64 ]; then
    error "Invalid --display-id '${DISPLAY_NODE_ID}': max length is 64 characters (got ${#DISPLAY_NODE_ID})"
  fi

  info "Display-only install — backend ${BACKEND_URL}, display ${DISPLAY_NODE_ID}"

  # 1. Install only the kiosk-side packages. No Node, no Next.js.
  # jq is required by /usr/local/bin/home-screens-reporter.sh for JSON
  # assembly — display-only Pis don't have it from the Node.js/Next.js path
  # that the hub install pulls in transitively.
  info "Installing kiosk packages..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq chromium labwc wtype wlr-randr fonts-noto-color-emoji curl jq
  if [ "${PI_VARIANT}" = "lite" ]; then
    sudo apt-get install -y -qq fonts-noto-core libpam-systemd dbus-user-session
  fi

  # 2. GPU group access for labwc/Chromium on Lite
  if [ "${PI_VARIANT}" = "lite" ]; then
    for grp in video render; do
      if getent group "${grp}" >/dev/null 2>&1 && ! id -nG "${USER}" | grep -qw "${grp}"; then
        sudo usermod -aG "${grp}" "${USER}"
      fi
    done
  fi

  # 2b. Plymouth boot splash (Home Screens branded splash on early boot).
  #     The full install gets this via upgrade.sh setup-system, but the
  #     display-only branch never runs that path — call the shared helper
  #     directly so display-only Pis show the same branded boot splash
  #     instead of the vanilla rainbow → black-screen → kiosk transition.
  #     Theme assets ship in scripts/boot-splash/ in the cloned repo.
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  info "Installing boot splash..."
  setup_boot_splash "${SCRIPT_DIR}/boot-splash"

  # 3. Display orientation prompts (same as full install)
  if [ "${NON_INTERACTIVE}" = "true" ]; then
    WLR_TRANSFORM="90"
    DISPLAY_MODE=""
    NATIVE_RES=$(cat /sys/class/drm/card*-*/modes 2>/dev/null | head -1 || true)
    if [ -n "${NATIVE_RES}" ]; then
      DISPLAY_MODE="${NATIVE_RES}"
    fi
  else
    echo ""
    echo "  How is your display oriented?"
    echo "  1) Portrait (default, rotated 90° clockwise)"
    echo "  2) Portrait (rotated 90° counter-clockwise)"
    echo "  3) Landscape (no rotation)"
    echo "  4) Inverted (rotated 180°)"
    echo ""
    read -rp "  Display orientation [1]: " ORIENT_CHOICE
    ORIENT_CHOICE="${ORIENT_CHOICE:-1}"
    case "${ORIENT_CHOICE}" in
      2) WLR_TRANSFORM="270" ;;
      3) WLR_TRANSFORM=""    ;;
      4) WLR_TRANSFORM="180" ;;
      *) WLR_TRANSFORM="90"  ;;
    esac
    echo ""
    read -rp "  Resolution [auto]: " DISPLAY_RES
    DISPLAY_MODE=""
    if [ -n "${DISPLAY_RES}" ]; then
      DISPLAY_MODE="${DISPLAY_RES}"
    else
      NATIVE_RES=$(cat /sys/class/drm/card*-*/modes 2>/dev/null | head -1 || true)
      [ -n "${NATIVE_RES}" ] && DISPLAY_MODE="${NATIVE_RES}"
    fi
  fi

  # 4. Create app dir owned by the user. We do not download a tarball — the
  #    only files we need are the kiosk-launcher and a stub HTML page.
  if [ ! -d "${INSTALL_BASE}" ]; then
    sudo mkdir -p "${INSTALL_BASE}"
    sudo chown "${USER}:${USER}" "${INSTALL_BASE}"
  fi
  mkdir -p "${APP_DIR}/data" "${APP_DIR}/scripts" "${APP_DIR}/share"

  # 5. kiosk.conf — same shape as the full install, plus DISPLAY_URL.
  #    The launcher reads this to know which URL to open.
  KIOSK_CONF="${APP_DIR}/data/kiosk.conf"
  : > "${KIOSK_CONF}"
  echo "DISPLAY_URL=\"${BACKEND_URL}/display/${DISPLAY_NODE_ID}\"" >> "${KIOSK_CONF}"
  echo "BACKEND_URL=\"${BACKEND_URL}\"" >> "${KIOSK_CONF}"
  echo "DISPLAY_ID=\"${DISPLAY_NODE_ID}\"" >> "${KIOSK_CONF}"
  [ -n "${DISPLAY_MODE}" ] && echo "DISPLAY_MODE=\"${DISPLAY_MODE}\"" >> "${KIOSK_CONF}"
  [ -n "${WLR_TRANSFORM}" ] && echo "DISPLAY_TRANSFORM=\"${WLR_TRANSFORM}\"" >> "${KIOSK_CONF}"
  echo "PI_VARIANT=\"${PI_VARIANT}\"" >> "${KIOSK_CONF}"

  # 6. Local "Connecting…" splash served via file:// while the hub boots.
  SPLASH_HTML="${APP_DIR}/share/connecting.html"
  cat > "${SPLASH_HTML}" <<'SPLASH_EOF'
<!doctype html>
<html><head><meta charset="utf-8"><title>Home Screens</title>
<style>
  html,body{margin:0;height:100%;background:#0a0a0a;color:#e5e5e5;
    font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;
    justify-content:center;text-align:center;}
  .wrap{padding:32px;max-width:520px}
  h1{font-size:32px;font-weight:600;margin:0 0 12px;color:#fafafa}
  p{font-size:16px;color:#a3a3a3;line-height:1.5;margin:0 0 24px}
  .pill{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;
    border-radius:999px;background:#171717;border:1px solid #262626;
    font-size:13px;color:#737373}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;
    background:#22c55e;animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:.4;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}
</style></head><body><div class="wrap">
  <h1>Home Screens</h1>
  <p>Waiting for the hub to come online…</p>
  <span class="pill"><span class="dot"></span>Connecting</span>
</div></body></html>
SPLASH_EOF

  # 7. Kiosk launcher — health-checks the hub before launching Chromium so
  #    a display-only Pi sharing a power strip with the hub doesn't try to
  #    load a URL that isn't ready yet.
  LAUNCHER="${APP_DIR}/scripts/kiosk-launcher.sh"
  cat > "${LAUNCHER}" <<'LAUNCHER_EOF'
#!/usr/bin/env bash
# Display-only kiosk launcher. Reads DISPLAY_URL/BACKEND_URL from kiosk.conf,
# waits for the hub to respond, then launches Chromium pointed at the hub.
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

HEALTH_URL="${BACKEND_URL:-${DISPLAY_URL%/display/*}}/api/system/build-id"
SPLASH_URL="file://${APP_DIR}/share/connecting.html"

# Single immediate health check. We don't loop here because labwc's
# autologin-on-exit cycle re-runs this script every few seconds anyway,
# and we want the splash to render in the meantime.
if curl -fsS --max-time 5 "${HEALTH_URL}" >/dev/null 2>&1; then
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
  --check-for-update-interval=31536000 \
  --password-store=basic \
  --ozone-platform=wayland \
  --remote-debugging-port=9222 \
  --ignore-gpu-blocklist \
  --enable-zero-copy \
  --num-raster-threads=2 \
  --force-gpu-mem-available-mb=256
LAUNCHER_EOF
  chmod +x "${LAUNCHER}"

  # 8. labwc rc.xml (same window rules and cursor hide as full install)
  LABWC_DIR="${HOME}/.config/labwc"
  mkdir -p "${LABWC_DIR}"
  cat > "${LABWC_DIR}/rc.xml" <<'RC_EOF'
<?xml version="1.0"?>
<labwc_config>
  <windowRules>
    <windowRule identifier="*" serverDecoration="no" skipTaskbar="yes" skipWindowSwitcher="yes">
      <action name="ToggleFullscreen"/>
    </windowRule>
  </windowRules>
  <keyboard>
    <keybind key="W-h">
      <action name="HideCursor"/>
    </keybind>
  </keyboard>
</labwc_config>
RC_EOF

  # 8b. Remove stale Chromium launch from labwc autostart (if present).
  if [ -f "${LABWC_DIR}/autostart" ] && grep -q 'chromium' "${LABWC_DIR}/autostart"; then
    sed -i '/chromium/d' "${LABWC_DIR}/autostart"
  fi

  # 9. Boot to console + autologin on TTY1
  CURRENT_DEFAULT=$(systemctl get-default 2>/dev/null || echo "unknown")
  if [ "${CURRENT_DEFAULT}" != "multi-user.target" ]; then
    sudo systemctl set-default multi-user.target
  fi
  for dm in lightdm gdm3 sddm; do
    if systemctl is-enabled "${dm}" &>/dev/null; then
      sudo systemctl disable "${dm}"
    fi
  done
  AUTOLOGIN_DIR="/etc/systemd/system/getty@tty1.service.d"
  AUTOLOGIN_CONF="${AUTOLOGIN_DIR}/autologin.conf"
  sudo mkdir -p "${AUTOLOGIN_DIR}"
  sudo tee "${AUTOLOGIN_CONF}" >/dev/null <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${USER} --noclear %I \$TERM
EOF
  sudo systemctl daemon-reload

  # 10. Bash profile kiosk auto-launch (reuses the shared helper)
  write_kiosk_block "${PI_VARIANT}" "${APP_DIR}" || true

  echo ""
  echo -e "${GREEN}============================================${NC}"
  echo -e "${GREEN}  Display-only install complete!${NC}"
  echo -e "${GREEN}============================================${NC}"
  echo ""
  echo "  Hub:          ${BACKEND_URL}"
  echo "  Display ID:   ${DISPLAY_NODE_ID}"
  echo "  Display URL:  ${BACKEND_URL}/display/${DISPLAY_NODE_ID}"
  echo ""
  echo "  Next steps:"
  echo "    1. Reboot this Pi:    sudo reboot"
  echo "    2. On the hub Pi, open the editor → Settings → Displays."
  echo "    3. Adopt '${DISPLAY_NODE_ID}' from the unadopted list and assign it screens."
  echo ""
  if [ -n "${LOGFILE:-}" ]; then
    echo "  Log:          ${LOGFILE}"
    echo ""
  fi

  # Install the hardware reporter. Hub-side auth: none. The hwStats
  # endpoint (/api/display/hw-stats) is gated only by adoption, so the Pi
  # doesn't need to carry a token. Posts 403 until the admin adopts this
  # display on the hub; 200 immediately afterwards.
  if install_reporter "${DISPLAY_NODE_ID}" "${BACKEND_URL}"; then
    info "Hardware reporter installed (timer: home-screens-reporter.timer)."
    info "  Stats will start flowing once '${DISPLAY_NODE_ID}' is adopted on the hub."
  fi

  exit 0
fi

# --- Step 1: Bootstrap packages ---
info "Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
info "Installing bootstrap packages..."
sudo apt-get install -y -qq curl vim

# Stop cloud-init (active by default on Raspberry Pi OS) from re-applying
# its cached hostname on every boot. Without this, hostname changes made
# in the editor get silently reverted after the next reboot.
if [ -d /etc/cloud ]; then
  info "Disabling cloud-init hostname management..."
  sudo mkdir -p /etc/cloud/cloud.cfg.d
  echo "preserve_hostname: true" \
    | sudo tee /etc/cloud/cloud.cfg.d/99-home-screens-hostname.cfg >/dev/null

  # Same story for network config: cloud-init's network module rewrites
  # /etc/netplan on every boot from the NoCloud datasource, which contains
  # no wifis: stanza — so any Wi-Fi profile added through the editor (which
  # NetworkManager stores as /etc/netplan/90-NM-<uuid>.yaml on this stack)
  # gets silently deleted at the next reboot.
  info "Disabling cloud-init network management..."
  echo "network: {config: disabled}" \
    | sudo tee /etc/cloud/cloud.cfg.d/99-home-screens-network.cfg >/dev/null
fi

# --- Step 2: Node.js ---
install_node "${NODE_MAJOR}"

# --- Step 3: Download release ---
if [ -n "${REQUESTED_VERSION}" ]; then
  LATEST_TAG="${REQUESTED_VERSION}"
  info "Using requested version ${LATEST_TAG}..."
else
  info "Fetching latest release..."
  LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try { console.log(JSON.parse(d).tag_name); }
      catch { process.exit(1); }
    });
  ")

  if [ -z "${LATEST_TAG}" ]; then
    error "Could not determine latest release tag."
  fi
fi

info "Downloading ${LATEST_TAG}..."
ASSET_NAME="home-screens-${LATEST_TAG}.tar.gz"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${ASSET_NAME}"
CHECKSUM_NAME="${ASSET_NAME}.sha256"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${CHECKSUM_NAME}"

if ! curl -fSL --speed-limit 1024 --speed-time 60 -o "/tmp/${ASSET_NAME}" "${DOWNLOAD_URL}"; then
  error "Failed to download release tarball."
fi

# Verify SHA-256 checksum if a sidecar is published. Releases prior to the
# checksum rollout don't have one — warn but continue in that case so users
# can still install older versions.
if curl -fsSL --max-time 30 -o "/tmp/${CHECKSUM_NAME}" "${CHECKSUM_URL}" 2>/dev/null; then
  info "Verifying checksum..."
  # The sidecar was generated against the bare filename — run from /tmp so
  # the relative path resolves correctly.
  if ( cd /tmp && sha256sum -c "${CHECKSUM_NAME}" >/dev/null 2>&1 ); then
    info "Checksum OK."
  else
    rm -f "/tmp/${ASSET_NAME}" "/tmp/${CHECKSUM_NAME}"
    error "Checksum verification FAILED for ${ASSET_NAME}. Refusing to install."
  fi
  rm -f "/tmp/${CHECKSUM_NAME}"
else
  warn "No checksum sidecar published for ${LATEST_TAG} — skipping verification."
fi

# Create the install base owned by the current user.
# The app lives in current/, with staging/rollback siblings for atomic upgrades.
if [ ! -d "${INSTALL_BASE}" ]; then
  sudo mkdir -p "${INSTALL_BASE}"
  sudo chown "${USER}:${USER}" "${INSTALL_BASE}"
fi

# Preserve any existing data/ directory from a prior install.
if [ -d "${APP_DIR}/data" ]; then
  mv "${APP_DIR}/data" "/tmp/home-screens-data-$$"
fi

rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}"

info "Extracting..."
tar -xzf "/tmp/${ASSET_NAME}" -C "${APP_DIR}"
rm -f "/tmp/${ASSET_NAME}"

# Restore user data if we saved it
if [ -d "/tmp/home-screens-data-$$" ]; then
  rm -rf "${APP_DIR}/data"
  mv "/tmp/home-screens-data-$$" "${APP_DIR}/data"
fi

# Validate
if [ ! -f "${APP_DIR}/server.js" ] || [ ! -f "${APP_DIR}/package.json" ]; then
  error "Tarball is missing required files (server.js, package.json)."
fi

info "Installed ${LATEST_TAG} to ${APP_DIR}"

cd "${APP_DIR}"

# --- Step 4: Create data directory ---
mkdir -p data

# --- Step 4b: Port configuration ---
if [ -n "${REQUESTED_PORT}" ]; then
  echo "${REQUESTED_PORT}" > data/port.conf
  PORT="${REQUESTED_PORT}"
  info "Server port set to ${PORT}."
fi

# --- Step 5: Display configuration ---
if [ "${NON_INTERACTIVE}" = "true" ]; then
  # Defaults: portrait 90° rotation, auto-detect resolution
  WLR_TRANSFORM="90"
  DISPLAY_MODE=""
  NATIVE_RES=$(cat /sys/class/drm/card*-*/modes 2>/dev/null | head -1 || true)
  if [ -n "${NATIVE_RES}" ]; then
    DISPLAY_MODE="${NATIVE_RES}"
    info "Auto-detected display resolution: ${DISPLAY_MODE}"
  else
    info "Using default display config (portrait 90°, 1080×1920)."
  fi
else
  echo ""
  echo "  How is your display oriented?"
  echo "  1) Portrait (default, rotated 90° clockwise)"
  echo "  2) Portrait (rotated 90° counter-clockwise)"
  echo "  3) Landscape (no rotation)"
  echo "  4) Inverted (rotated 180°)"
  echo ""
  read -rp "  Display orientation [1]: " ORIENT_CHOICE
  ORIENT_CHOICE="${ORIENT_CHOICE:-1}"

  case "${ORIENT_CHOICE}" in
    2) WLR_TRANSFORM="270" ;;
    3) WLR_TRANSFORM=""     ;;
    4) WLR_TRANSFORM="180" ;;
    *) WLR_TRANSFORM="90"  ;;
  esac

  echo ""
  echo "  Enter display resolution (e.g. 1920x1080, 2560x1440)"
  echo "  Leave blank to use the display's preferred resolution."
  echo ""
  read -rp "  Resolution [auto]: " DISPLAY_RES

  DISPLAY_MODE=""
  if [ -n "${DISPLAY_RES}" ]; then
    DISPLAY_MODE="${DISPLAY_RES}"
    info "Display resolution set to ${DISPLAY_MODE}."
  else
    # Auto-detect native resolution from kernel DRM/EDID (first mode = preferred)
    NATIVE_RES=$(cat /sys/class/drm/card*-*/modes 2>/dev/null | head -1 || true)
    if [ -n "${NATIVE_RES}" ]; then
      DISPLAY_MODE="${NATIVE_RES}"
      info "Auto-detected display resolution: ${DISPLAY_MODE}"
    fi
  fi
fi

# Save display config to kiosk.conf (consumed by labwc kiosk-launcher.sh)
# Values are quoted to match the format upgrade.sh generates from config.json.
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"
: > "${KIOSK_CONF}"
[ -n "${DISPLAY_MODE}" ] && echo "DISPLAY_MODE=\"${DISPLAY_MODE}\"" >> "${KIOSK_CONF}"
[ -n "${WLR_TRANSFORM}" ] && echo "DISPLAY_TRANSFORM=\"${WLR_TRANSFORM}\"" >> "${KIOSK_CONF}"
echo "PI_VARIANT=\"${PI_VARIANT}\"" >> "${KIOSK_CONF}"
if [ -n "${WLR_TRANSFORM}" ]; then
  info "Display will be rotated ${WLR_TRANSFORM}° on boot."
fi

# Persist display settings into config.json so upgrades stay in sync.
# upgrade.sh regenerates kiosk.conf from config.json, so without this
# the user's install-time choices would be lost on the first upgrade.
CONFIG_FILE="${APP_DIR}/data/config.json"
node -e "
const [, configFile, transform, mode, variant] = process.argv;
const fs = require('fs');
let c;
try { c = JSON.parse(fs.readFileSync(configFile, 'utf-8')); } catch {
  c = {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080, displayHeight: 1920, displayTransform: '90',
      latitude: 0, longitude: 0,
      weather: { provider: 'open-meteo', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], maxEvents: 10, daysAhead: 7 }
    },
    screens: [{ id: 'default', name: 'Screen 1', backgroundImage: '', modules: [] }]
  };
}
const s = c.settings = c.settings || {};
s.displayTransform = transform || 'normal';
if (mode) {
  const [a, b] = mode.split('x').map(Number);
  if (a && b) {
    if (transform === '90' || transform === '270') {
      s.displayWidth = Math.min(a, b);
      s.displayHeight = Math.max(a, b);
    } else {
      s.displayWidth = a;
      s.displayHeight = b;
    }
  }
} else {
  // No custom resolution — set default dimensions based on orientation
  if (transform === '90' || transform === '270') {
    s.displayWidth = 1080;
    s.displayHeight = 1920;
  } else {
    s.displayWidth = 1920;
    s.displayHeight = 1080;
  }
}
s.piVariant = variant;
fs.writeFileSync(configFile, JSON.stringify(c, null, 2) + '\n');
" "${CONFIG_FILE}" "${WLR_TRANSFORM}" "${DISPLAY_MODE}" "${PI_VARIANT}"
info "Display settings saved to config.json."

# --- Step 6: System setup (services, kiosk, boot target, autologin) ---
info "Configuring system..."
bash "${APP_DIR}/scripts/upgrade.sh" setup-system

# Grant the home-screens service user access to the systemd journal so the
# diagnostics endpoint can shell out to `journalctl -u home-screens` without
# sudo. This is idempotent and a no-op if the user is already in the group.
if getent group systemd-journal >/dev/null 2>&1 \
   && ! id -nG "${USER}" 2>/dev/null | grep -qw systemd-journal; then
  sudo usermod -aG systemd-journal "${USER}"
  info "Added ${USER} to systemd-journal group (requires re-login to take effect)."
fi

# --- Done ---
echo ""
echo -e "${GREEN}============================================${NC}"
if [ "${PI_VARIANT}" = "desktop" ]; then
  echo -e "${GREEN}  Installation complete! (Pi OS Desktop)${NC}"
else
  echo -e "${GREEN}  Installation complete!${NC}"
fi
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Display URL:  http://$(hostname -I | awk '{print $1}'):${PORT}/display"
echo "  Editor URL:   http://$(hostname -I | awk '{print $1}'):${PORT}/editor"
echo ""
echo "  Service:      home-screens (Next.js server)"
echo "  Kiosk:        labwc (launches automatically on TTY1)"
echo "  App:          ${APP_DIR}"
echo "  Data:         ${APP_DIR}/data/config.json"
echo ""
if [ -n "${LOGFILE:-}" ]; then
  echo "  Log:          ${LOGFILE}"
  echo ""
fi
echo "  Commands:"
echo "    sudo systemctl start home-screens    # start server"
echo "    sudo systemctl status home-screens   # check status"
echo "    journalctl -u home-screens -f        # view logs"
echo ""
echo "  Reboot to start the kiosk display:"
echo "    sudo reboot"
echo ""
