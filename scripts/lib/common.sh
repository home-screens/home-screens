#!/usr/bin/env bash
# scripts/lib/common.sh — shared functions for Home Screens install/upgrade/deploy scripts.
# Source this file; do not execute directly.
[[ -n "${_COMMON_SH_LOADED:-}" ]] && return 0; _COMMON_SH_LOADED=1

# --- Non-interactive mode ---
NON_INTERACTIVE="${NON_INTERACTIVE:-false}"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
NC='\033[0m'

# --- Port ---
# Precedence: PORT env var > data/port.conf > 3000
if [ -z "${PORT:-}" ]; then
  if [ -n "${APP_DIR:-}" ] && [ -f "${APP_DIR}/data/port.conf" ]; then
    _conf_port=$(tr -d '[:space:]' < "${APP_DIR}/data/port.conf")
    if [[ "${_conf_port}" =~ ^[0-9]+$ ]]; then
      PORT="${_conf_port}"
    fi
  fi
  PORT="${PORT:-3000}"
fi

# --- Logging ---
info()  { echo -e "${GREEN}[*]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }
step()  { echo -e "\n${GREEN}==>${NC} $1"; }

setup_logging() {
  # Tee all stdout/stderr to a log file so users can share it when debugging.
  # Call once, early in the script, before any meaningful output.
  LOGFILE="${HOME}/home-screens-install.log"
  if : > "${LOGFILE}" 2>/dev/null; then
    exec > >(tee -a "${LOGFILE}") 2>&1
  else
    warn "Could not create log file at ${LOGFILE} — continuing without file log"
    LOGFILE=""
  fi
  local os_name
  os_name=$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-}" || uname -s)
  echo "Home Screens install — $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "System: $(uname -m), ${os_name:-$(uname -s)}"
  if command -v free &>/dev/null; then
    echo "Memory: $(free -h 2>/dev/null | awk '/^Mem:/{print $2" total"}')"
  fi
  echo "---"
}

# --- Preflight checks ---

check_arch() {
  if [ "$(uname -m)" != "aarch64" ]; then
    if [ "$(uname -m)" = "armv7l" ]; then
      error "32-bit Raspberry Pi OS detected. Home Screens requires 64-bit (aarch64)."
    fi
    warn "This doesn't look like a Raspberry Pi ($(uname -m)). Continuing anyway..."
  fi
}

check_not_root() {
  if [ "$(id -u)" -eq 0 ]; then
    error "Don't run this script as root. It will use sudo when needed."
  fi
}

ensure_tty() {
  # Reattach stdin to the terminal for interactive prompts
  # (needed when piped or redirected).
  if [ "${NON_INTERACTIVE}" = "true" ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    exec < /dev/tty
  fi
}

# --- Node.js ---

install_node() {
  local node_major="${1:-22}"
  if command -v node &>/dev/null; then
    local current_node
    current_node=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "${current_node}" -ge "${node_major}" ]; then
      info "Node.js $(node -v) already installed, skipping."
    else
      warn "Node.js $(node -v) is too old. Installing Node.js ${node_major}..."
      curl -fsSL "https://deb.nodesource.com/setup_${node_major}.x" | sudo -E bash -
      sudo apt-get install -y -qq nodejs
    fi
  else
    info "Installing Node.js ${node_major}..."
    curl -fsSL "https://deb.nodesource.com/setup_${node_major}.x" | sudo -E bash -
    sudo apt-get install -y -qq nodejs
  fi
  info "Node $(node -v) / npm $(npm -v)"
}

# --- Kiosk block management ---

write_kiosk_block() {
  # Idempotent write/update of the .bash_profile kiosk block.
  # Usage: write_kiosk_block <variant> <app_dir>
  #   variant: "desktop" or "lite"
  #   app_dir: absolute path to the app directory
  # Returns 0 if the block was written/updated, 1 if already current.
  local variant="${1:-desktop}"
  local app_dir="${2}"
  local profile="${HOME}/.bash_profile"
  local marker_start="# --- Home Screens Kiosk ---"
  local marker_end="# --- End Kiosk ---"

  touch "${profile}"

  # Build the block content based on variant
  local kiosk_block
  if [ "${variant}" = "lite" ]; then
    kiosk_block="${marker_start}
if [ \"\$(tty)\" = \"/dev/tty1\" ]; then
  export XDG_RUNTIME_DIR=\"/run/user/\$(id -u)\"
  exec dbus-run-session -- cage -s -- ${app_dir}/scripts/kiosk-launcher.sh
fi
${marker_end}"
  else
    kiosk_block="${marker_start}
if [ \"\$(tty)\" = \"/dev/tty1\" ]; then
  exec cage -s -- ${app_dir}/scripts/kiosk-launcher.sh
fi
${marker_end}"
  fi

  # Check if block already exists
  if grep -q "Home Screens Kiosk" "${profile}" 2>/dev/null; then
    # Extract existing block and compare
    local existing
    existing=$(sed -n "/# --- Home Screens Kiosk ---/,/# --- End Kiosk ---/p" "${profile}")
    if [ "${existing}" = "${kiosk_block}" ]; then
      return 1  # already current
    fi
    # Delete old block and append updated one (atomic via temp file + mv)
    local tmp="${profile}.tmp.$$"
    trap 'rm -f "${tmp}" 2>/dev/null' RETURN
    sed "/# --- Home Screens Kiosk ---/,/# --- End Kiosk ---/d" "${profile}" > "${tmp}"
    echo "${kiosk_block}" >> "${tmp}"
    mv "${tmp}" "${profile}"
    trap - RETURN
  else
    # Fresh install — append
    echo "${kiosk_block}" >> "${profile}"
  fi

  # Fix ownership when running as root during image build / setup-system
  if [ "$(id -u)" -eq 0 ] && [ -n "${USER}" ] && [ "${USER}" != "root" ]; then
    chown "${USER}:${USER}" "${profile}"
  fi
  return 0
}
