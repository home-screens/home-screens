#!/usr/bin/env bash
# Lay down (or refresh) the spoke self-update machinery on a display-only Pi.
#
# Single-sourced on purpose: this is called by install.sh for a fresh
# --display-only install AND by the hub's /api/display/kiosk-bootstrap
# one-liner to migrate a Pi that was flashed before self-update existed.
# Both callers therefore produce byte-identical machinery, so a migrated Pi
# is indistinguishable from a freshly installed one.
#
# It is idempotent — safe to re-run at any time.
#
# Usage:
#   kiosk-update-install.sh [--app-dir <dir>] [--user <name>]
#
#   --app-dir   Install root (default /opt/home-screens/current)
#   --user      Account the kiosk and updater run as (default: current user)
#
# It deliberately does NOT write data/kiosk-bundle.version. Only a verified
# apply in kiosk-update.sh may write that stamp, because every later update
# check short-circuits on it. Seeding it here would mark a display as being on
# a version whose reporter and systemd units were never actually installed —
# and since a display needing this script is by definition running an old
# reporter, it would report "no automatic updates" forever while the stamp
# claimed otherwise.
#
# Source files are looked up next to this script, in either of the two
# layouts it can be run from: the repo/installer layout (everything flat in
# scripts/) or the bundle layout (system files under system/).
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
APP_DIR="/opt/home-screens/current"
KIOSK_USER="$(id -un)"

while [ $# -gt 0 ]; do
  case "$1" in
    --app-dir) APP_DIR="${2:?--app-dir requires a path}"; shift 2 ;;
    --user)    KIOSK_USER="${2:?--user requires a name}"; shift 2 ;;
    *) echo "kiosk-update-install: unknown option $1" >&2; exit 1 ;;
  esac
done

PRIV_DIR="/usr/local/lib/home-screens"
PRIV_HELPER="${PRIV_DIR}/kiosk-update-privileged.sh"
SUDOERS_FILE="/etc/sudoers.d/home-screens-kiosk-update"
UNIT_DIR="/etc/systemd/system"
DROPIN_DIR="${UNIT_DIR}/home-screens-kiosk-update.service.d"

# Look a file up in the bundle layout first, then the flat repo layout.
find_src() {
  local name="$1"
  if [ -f "${SRC_DIR}/system/${name}" ]; then
    echo "${SRC_DIR}/system/${name}"
  elif [ -f "${SRC_DIR}/${name}" ]; then
    echo "${SRC_DIR}/${name}"
  else
    echo ""
  fi
}

require_src() {
  local path
  path="$(find_src "$1")"
  if [ -z "${path}" ]; then
    echo "kiosk-update-install: required file '$1' not found next to ${SRC_DIR}" >&2
    exit 1
  fi
  echo "${path}"
}

# --- 1. User-space files ----------------------------------------------------
mkdir -p "${APP_DIR}/scripts" "${APP_DIR}/data" "${APP_DIR}/share"

# The launcher installs as kiosk-launcher.sh: that path is baked into the
# ~/.bash_profile autologin block on every Pi already in the field.
install -m 0755 "$(require_src kiosk-launcher-display.sh)" "${APP_DIR}/scripts/kiosk-launcher.sh"
install -m 0755 "$(require_src kiosk-update.sh)"           "${APP_DIR}/scripts/kiosk-update.sh"
install -m 0755 "${BASH_SOURCE[0]:-$0}"                    "${APP_DIR}/scripts/kiosk-update-install.sh"

ROTATE_SRC="$(find_src rotate-display.sh)"
[ -n "${ROTATE_SRC}" ] && install -m 0755 "${ROTATE_SRC}" "${APP_DIR}/scripts/rotate-display.sh"

SPLASH_SRC=""
if [ -f "${SRC_DIR}/share/connecting.html" ]; then
  SPLASH_SRC="${SRC_DIR}/share/connecting.html"
fi
[ -n "${SPLASH_SRC}" ] && install -m 0644 "${SPLASH_SRC}" "${APP_DIR}/share/connecting.html"

# --- 2. Privileged helper ---------------------------------------------------
sudo mkdir -p "${PRIV_DIR}"
sudo install -m 0755 -o root -g root "$(require_src kiosk-update-privileged.sh)" "${PRIV_HELPER}"

# --- 3. Sudoers drop-in -----------------------------------------------------
# One fixed path, no arguments, no wildcards. Written to a temp file and
# validated with visudo before being moved into place — a malformed
# /etc/sudoers.d entry can lock the account out of sudo entirely.
SUDOERS_TMP="$(mktemp)"
cat > "${SUDOERS_TMP}" <<EOF
# Home Screens display self-update. Lets the kiosk account install the
# hub-provided reporter and systemd units, and nothing else.
${KIOSK_USER} ALL=(root) NOPASSWD: ${PRIV_HELPER}
EOF
sudo install -m 0440 -o root -g root "${SUDOERS_TMP}" "${SUDOERS_FILE}.new"
rm -f "${SUDOERS_TMP}"
if sudo visudo -cf "${SUDOERS_FILE}.new" >/dev/null 2>&1; then
  sudo mv -f "${SUDOERS_FILE}.new" "${SUDOERS_FILE}"
else
  sudo rm -f "${SUDOERS_FILE}.new"
  echo "kiosk-update-install: refusing to install an invalid sudoers file" >&2
  exit 1
fi

# --- 4. systemd units -------------------------------------------------------
sudo install -m 0644 -o root -g root \
  "$(require_src home-screens-kiosk-update.service)" "${UNIT_DIR}/home-screens-kiosk-update.service"
sudo install -m 0644 -o root -g root \
  "$(require_src home-screens-kiosk-update.timer)" "${UNIT_DIR}/home-screens-kiosk-update.timer"

# The account name is an install-time answer, so it lives in a drop-in rather
# than the shipped unit — that keeps the unit itself identical everywhere and
# therefore safe to ship in the bundle.
sudo mkdir -p "${DROPIN_DIR}"
sudo tee "${DROPIN_DIR}/10-user.conf" >/dev/null <<EOF
[Service]
User=${KIOSK_USER}
EOF
sudo chmod 0644 "${DROPIN_DIR}/10-user.conf"

sudo systemctl daemon-reload
sudo systemctl enable --now home-screens-kiosk-update.timer >/dev/null 2>&1 || true

echo "Display self-update installed (user: ${KIOSK_USER}, app dir: ${APP_DIR})."
