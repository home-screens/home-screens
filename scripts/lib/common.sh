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

ensure_npm_floor() {
  # Raise npm to the minimum version in engines.npm, and never lower it.
  # Node 22 bundles npm 10, which ignores the cpu/os fields on optional
  # dependencies and so installs every platform's prebuilt binaries: about
  # 114 extra packages of ARM, s390x and BSD builds this Pi will never run.
  # npm 11 filters them to the host platform. npm 11.6.2 in turn drops nested
  # entries for transitive optional deps when it rewrites package-lock.json,
  # so the floor is 11.6.3. .npmrc sets engine-strict=true, so an npm below
  # the floor also makes every install a hard failure.
  # Usage: ensure_npm_floor <app_dir>
  local app_dir="${1:?ensure_npm_floor: app dir required}"
  local floor current
  floor=$( (cd "${app_dir}" && node -p "(require('./package.json').engines || {}).npm || ''") 2>/dev/null || true)
  # engines.npm is a range (">=11.6.3"); the floor is its version part.
  floor="${floor#*=}"
  floor="${floor#[\^~>]}"
  if [ -z "${floor}" ] || [ "${floor}" = "undefined" ]; then
    return 0
  fi
  current=$(npm --version 2>/dev/null || true)
  if [ -n "${current}" ] && node -e '
    const part = (s) => s.split(".").map(Number);
    const [a, b] = [part(process.argv[1]), part(process.argv[2])];
    for (let i = 0; i < 3; i++) {
      const [x, y] = [a[i] || 0, b[i] || 0];
      if (x !== y) process.exit(x > y ? 0 : 1);
    }
    process.exit(0);
  ' "${current}" "${floor}" 2>/dev/null; then
    return 0
  fi
  info "Updating npm ${current:-not found} -> ${floor} (minimum required by package.json)..."
  sudo npm install -g "npm@${floor}"
  info "npm $(npm --version) installed."
}

# --- Chromium kiosk flags ---
#
# The kiosk browser invocation is emitted or executed from five places: the
# display-only launcher (install.sh), the hub launcher (upgrade.sh setup-system),
# upgrade.sh's reload-browser relaunch fallback (twice, with and without
# dbus-run-session), and start-display.sh. They drift: --remote-debugging-port
# went missing from the display-only launcher, and that is the flag letting a
# deploy reload the page over CDP instead of killing and relaunching Chromium.
#
# Two lists, because one difference between the copies is legitimate rather than
# drift. CHROMIUM_KIOSK_FLAGS are safe anywhere, including a developer machine.
# CHROMIUM_KIOSK_PI_FLAGS assume the Pi's Wayland session, so start-display.sh
# deliberately omits them: --ozone-platform=wayland fails outright on a macOS or
# X11 dev box.
#
# NOTE: upgrade.sh sources this file conditionally (`[ -f ... ] && source`), and
# that really does continue with these undefined when the file is absent. Any
# use of these from upgrade.sh must either guard, or make that source
# unconditional first.
CHROMIUM_KIOSK_FLAGS=(
  --noerrdialogs
  --disable-infobars
  --no-first-run
  --disable-session-crashed-bubble
  --disable-translate
  --autoplay-policy=no-user-gesture-required
  --overscroll-history-navigation=0
  --remote-debugging-port=9222
  --ignore-gpu-blocklist
  --enable-zero-copy
  --num-raster-threads=2
  --force-gpu-mem-available-mb=256
)

CHROMIUM_KIOSK_PI_FLAGS=(
  --check-for-update-interval=31536000
  --password-store=basic
  --ozone-platform=wayland
)

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
  exec dbus-run-session -- labwc --session ${app_dir}/scripts/kiosk-launcher.sh
fi
${marker_end}"
  else
    kiosk_block="${marker_start}
if [ \"\$(tty)\" = \"/dev/tty1\" ]; then
  exec labwc --session ${app_dir}/scripts/kiosk-launcher.sh
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

# --- Plymouth boot splash ---

setup_boot_splash() {
  # Idempotent setup of the Home Screens Plymouth boot splash. Safe to call
  # from both the full install (via upgrade.sh setup-system) and the
  # display-only branch in install.sh — both use the same theme assets.
  #
  #   1. Install plymouth + plymouth-themes if missing
  #   2. Copy the home-screens theme into /usr/share/plymouth/themes/home-screens,
  #      set it as the default, and rebuild the initramfs
  #   3. Add a 5-second minimum display time so the splash is not a single frame
  #   4. Edit /boot/firmware/cmdline.txt for quiet boot (quiet, splash, etc.)
  #   5. Disable the Pi firmware rainbow splash via /boot/firmware/config.txt
  #
  # Usage: setup_boot_splash <theme_src_dir>
  #   theme_src_dir: directory containing home-screens.plymouth, home-screens.script,
  #                  logo.png, dot.png (typically scripts/boot-splash/ in the repo)
  #
  # Sets BOOT_SPLASH_CHANGES (comma-separated, no trailing comma) so callers
  # like upgrade.sh's setup-system can fold it into their own change tracking.
  local theme_src="${1}"
  local theme_dir="/usr/share/plymouth/themes/home-screens"
  BOOT_SPLASH_CHANGES=""

  # 1. Install plymouth packages if missing
  local missing=""
  local pkg
  for pkg in plymouth plymouth-themes; do
    if ! dpkg -s "${pkg}" &>/dev/null; then
      missing="${missing} ${pkg}"
    fi
  done
  if [ -n "${missing}" ]; then
    sudo apt-get install -y -qq ${missing}
    BOOT_SPLASH_CHANGES="${BOOT_SPLASH_CHANGES}plymouth-packages,"
  fi

  # 2. Copy theme files (only when content actually differs) and set default
  if [ -d "${theme_src}" ]; then
    local theme_changed=false
    local f
    for f in home-screens.plymouth home-screens.script logo.png dot.png; do
      if [ -f "${theme_src}/${f}" ] && { [ ! -f "${theme_dir}/${f}" ] || ! cmp -s "${theme_src}/${f}" "${theme_dir}/${f}"; }; then
        theme_changed=true
      fi
    done

    if [ "${theme_changed}" = true ]; then
      sudo mkdir -p "${theme_dir}"
      sudo cp "${theme_src}/home-screens.plymouth" "${theme_dir}/"
      sudo cp "${theme_src}/home-screens.script" "${theme_dir}/"
      [ -f "${theme_src}/logo.png" ] && sudo cp "${theme_src}/logo.png" "${theme_dir}/"
      [ -f "${theme_src}/dot.png" ] && sudo cp "${theme_src}/dot.png" "${theme_dir}/"
    fi

    local current_theme
    current_theme=$(/usr/sbin/plymouth-set-default-theme 2>/dev/null || true)
    if [ "${current_theme}" != "home-screens" ] || [ "${theme_changed}" = true ]; then
      sudo /usr/sbin/plymouth-set-default-theme home-screens
      sudo update-initramfs -u
      BOOT_SPLASH_CHANGES="${BOOT_SPLASH_CHANGES}plymouth,"
    fi
  fi

  # 3. Plymouth minimum display time (5 seconds)
  local plymouth_quit_drop="/etc/systemd/system/plymouth-quit.service.d/delay.conf"
  local desired_delay="[Service]
ExecStartPre=/bin/sleep 5"
  if [ ! -f "${plymouth_quit_drop}" ] || [ "$(cat "${plymouth_quit_drop}")" != "${desired_delay}" ]; then
    sudo mkdir -p "$(dirname "${plymouth_quit_drop}")"
    echo "${desired_delay}" | sudo tee "${plymouth_quit_drop}" > /dev/null
    sudo systemctl daemon-reload
    BOOT_SPLASH_CHANGES="${BOOT_SPLASH_CHANGES}plymouth-delay,"
  fi

  # 4. Quiet boot (suppress kernel messages, hide cursor/logo)
  local cmdline="/boot/firmware/cmdline.txt"
  if [ -f "${cmdline}" ]; then
    local cmdline_updated=false
    local current_cmdline
    current_cmdline=$(cat "${cmdline}")

    # Remove serial console — forces Plymouth into framebuffer mode
    if echo "${current_cmdline}" | grep -qE 'console=(serial|ttyAMA|ttyS)[0-9]'; then
      current_cmdline=$(echo "${current_cmdline}" | sed -E 's/ ?console=(serial|ttyAMA|ttyS)[0-9][^ ]*//g')
      cmdline_updated=true
    fi

    # Remove plymouth.debug if present (leftover from troubleshooting)
    if echo "${current_cmdline}" | grep -q 'plymouth\.debug'; then
      current_cmdline=$(echo "${current_cmdline}" | sed -E 's/ ?plymouth\.debug//g')
      cmdline_updated=true
    fi

    local param
    for param in quiet "loglevel=0" "logo.nologo" "vt.global_cursor_default=0" "consoleblank=0" splash; do
      if ! echo " ${current_cmdline} " | grep -q " ${param} "; then
        current_cmdline="${current_cmdline} ${param}"
        cmdline_updated=true
      fi
    done
    if [ "${cmdline_updated}" = true ]; then
      echo "${current_cmdline}" | sudo tee "${cmdline}" > /dev/null
      BOOT_SPLASH_CHANGES="${BOOT_SPLASH_CHANGES}cmdline,"
    fi
  fi

  # 5. Disable firmware rainbow splash
  local config_txt="/boot/firmware/config.txt"
  if [ -f "${config_txt}" ]; then
    if grep -q "^disable_splash=" "${config_txt}"; then
      if ! grep -q "^disable_splash=1" "${config_txt}"; then
        sudo sed -i 's/^disable_splash=.*/disable_splash=1/' "${config_txt}"
        BOOT_SPLASH_CHANGES="${BOOT_SPLASH_CHANGES}config-txt,"
      fi
    elif ! grep -q "^disable_splash=1" "${config_txt}"; then
      echo "disable_splash=1" | sudo tee -a "${config_txt}" > /dev/null
      BOOT_SPLASH_CHANGES="${BOOT_SPLASH_CHANGES}config-txt,"
    fi
  fi

  # Trim trailing comma so callers can append cleanly
  BOOT_SPLASH_CHANGES="${BOOT_SPLASH_CHANGES%,}"
}
