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
    *)      error "Unknown option: $1" ;;
  esac
done

# --- Preflight ---
ensure_tty
check_arch
check_not_root

# --- Step 1: Bootstrap packages ---
info "Installing bootstrap packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq curl

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

if ! curl -fSL --speed-limit 1024 --speed-time 60 -o "/tmp/${ASSET_NAME}" "${DOWNLOAD_URL}"; then
  error "Failed to download release tarball."
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

# Save display config to kiosk.conf (consumed by kiosk-launcher.sh)
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
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
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
echo "  Kiosk:        cage (launches automatically on TTY1)"
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
