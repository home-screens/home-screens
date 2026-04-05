#!/usr/bin/env bash
set -euo pipefail

# Home Screens Upgrade Script
# Called by the API to perform upgrades (tarball-based or git-based fallback).
#
# Usage: upgrade.sh <action> [args...]
#   upgrade.sh preflight              - Check if upgrade is possible
#   upgrade.sh backup                 - Backup config to data/backups/
#   upgrade.sh download <tag>         - Download release tarball from GitHub
#   upgrade.sh deploy                 - Atomic swap of staged files into place
#   upgrade.sh cleanup-rollback       - Remove rollback directory after success
#   upgrade.sh restart                - Restart the systemd service
#   upgrade.sh health-check           - Verify server is responding
#   upgrade.sh setup-system           - Apply system config (services, kiosk, boot target)
#   upgrade.sh list-backups           - List config backups
#   upgrade.sh restore-backup <file>  - Restore a config backup
#
# Legacy git-based actions (fallback for pre-tarball releases):
#   upgrade.sh fetch                  - Fetch latest tags from remote
#   upgrade.sh checkout <tag>         - Checkout a specific version tag
#   upgrade.sh install                - Run npm install
#   upgrade.sh build                  - Run npm run build
#   upgrade.sh rollback <tag>         - Checkout previous tag (same as checkout)
#   upgrade.sh stash                  - Stash local changes
#   upgrade.sh stash-pop              - Pop stashed changes

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${APP_DIR}/data/backups"
CONFIG_FILE="${APP_DIR}/data/config.json"
SERVICE_NAME="home-screens"
MAX_BACKUPS=6

# cd may fail if APP_DIR was removed by an interrupted deploy — the preflight
# action's recovery check handles this, so we must not abort here.
cd "${APP_DIR}" 2>/dev/null || true

# Shared functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/lib/common.sh" ] && source "${SCRIPT_DIR}/lib/common.sh"

# Read variant (default: desktop for existing installs)
PI_VARIANT="desktop"
[ -f "${APP_DIR}/data/kiosk.conf" ] && source "${APP_DIR}/data/kiosk.conf"
PI_VARIANT="${PI_VARIANT:-desktop}"

action="${1:-}"
shift || true

case "${action}" in

  preflight)
    errors=""

    # Check disk space (~400MB for tarball + staging + rollback)
    available_kb=$(df -k "${APP_DIR}" | tail -1 | awk '{print $4}')
    if [ "${available_kb}" -lt 409600 ]; then
      errors="${errors}Low disk space ($(( available_kb / 1024 ))MB available, need 400MB). "
    fi

    # Check network connectivity to GitHub
    if ! curl -fsSL --head --max-time 10 "https://github.com" >/dev/null 2>&1; then
      errors="${errors}Cannot reach GitHub (check network connectivity). "
    fi

    # Check passwordless sudo (needed for restart and setup-system)
    if ! sudo -n true 2>/dev/null; then
      errors="${errors}Passwordless sudo not available (required for restart/setup-system). "
    fi

    # Check Node.js major version matches .node-version if it exists (warning only)
    node_warning=""
    if [ -f "${APP_DIR}/.node-version" ]; then
      expected_major=$(cat "${APP_DIR}/.node-version" | tr -d '[:space:]')
      actual_major=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
      if [ -n "${expected_major}" ] && [ -n "${actual_major}" ] && [ "${actual_major}" != "${expected_major}" ]; then
        node_warning="Node.js v${actual_major} detected (v${expected_major} recommended)"
      fi
    fi

    if [ -n "${errors}" ]; then
      echo "{\"ok\":false,\"error\":\"${errors}\"}"
    else
      # Check git status for legacy fallback
      dirty="false"
      if git rev-parse --is-inside-work-tree &>/dev/null; then
        if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
          dirty="true"
        fi
      fi
      warning_field=""
      if [ -n "${node_warning}" ]; then
        warning_field=",\"warning\":\"${node_warning}\""
      fi
      echo "{\"ok\":true,\"dirty\":${dirty},\"diskMB\":$(( available_kb / 1024 ))${warning_field}}"
    fi
    ;;

  backup)
    mkdir -p "${BACKUP_DIR}"
    if [ -f "${CONFIG_FILE}" ]; then
      timestamp=$(date +%Y%m%d-%H%M%S)
      version=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
      backup_name="config-v${version}-${timestamp}.json"
      cp "${CONFIG_FILE}" "${BACKUP_DIR}/${backup_name}"

      # Prune old backups, keep latest MAX_BACKUPS
      # shellcheck disable=SC2012
      ls -1t "${BACKUP_DIR}"/config-*.json 2>/dev/null | tail -n +$(( MAX_BACKUPS + 1 )) | xargs -r rm -f

      echo "{\"ok\":true,\"file\":\"${backup_name}\"}"
    else
      echo "{\"ok\":true,\"file\":null}"
    fi
    ;;

  download)
    tag="${1:-}"
    if [ -z "${tag}" ]; then
      echo '{"ok":false,"error":"No tag specified"}'
      exit 1
    fi

    repo="${2:-home-screens/home-screens}"
    asset_name="home-screens-${tag}.tar.gz"
    download_url="https://github.com/${repo}/releases/download/${tag}/${asset_name}"

    staging_dir="${APP_DIR}.staging"
    rm -rf "${staging_dir}"
    mkdir -p "${staging_dir}"

    # Clean up staging on any failure, signal, or cancellation
    trap 'rm -rf "${staging_dir}" 2>/dev/null; true' ERR INT TERM

    # Check that the release asset exists before committing to download
    if ! curl -fsSL --head --max-time 10 "${download_url}" >/dev/null 2>&1; then
      rm -rf "${staging_dir}"
      echo "{\"ok\":false,\"error\":\"Release asset not found: ${asset_name}\"}"
      exit 1
    fi

    # Download (with stall detection: fail if <1KB/s for 60 seconds)
    if ! curl -fSL --speed-limit 1024 --speed-time 60 -o "${staging_dir}/${asset_name}" "${download_url}" 2>&1; then
      rm -rf "${staging_dir}"
      echo "{\"ok\":false,\"error\":\"Failed to download ${asset_name}\"}"
      exit 1
    fi

    # Extract
    tar -xzf "${staging_dir}/${asset_name}" -C "${staging_dir}"
    rm "${staging_dir}/${asset_name}"

    # Validate tarball contents — catch CI misconfigurations before deploy
    for required in server.js package.json; do
      if [ ! -f "${staging_dir}/${required}" ]; then
        rm -rf "${staging_dir}"
        echo "{\"ok\":false,\"error\":\"Tarball missing required file: ${required}\"}"
        exit 1
      fi
    done

    trap - ERR INT TERM
    echo "{\"ok\":true,\"staging\":\"${staging_dir}\"}"
    ;;

  deploy)
    staging_dir="${APP_DIR}.staging"
    if [ ! -d "${staging_dir}" ]; then
      echo '{"ok":false,"error":"No staged upgrade found"}'
      exit 1
    fi

    rollback_dir="${APP_DIR}.rollback"

    # Safety trap: covers both the data-move phase and the atomic swap.
    # Order matters: restore APP_DIR from rollback FIRST (phase 2), then
    # move data back (phase 1). If APP_DIR is gone, the data-restore
    # conditions would skip because they check [ -d "${APP_DIR}" ].
    trap '
      # Phase 2: restore APP_DIR from rollback if the swap failed
      [ ! -d "${APP_DIR}" ] && [ -d "${rollback_dir}" ] && mv "${rollback_dir}" "${APP_DIR}" 2>/dev/null
      # Phase 1: restore data moved to staging
      [ -d "${staging_dir}/data" ] && [ ! -d "${APP_DIR}/data" ] && [ -d "${APP_DIR}" ] && mv "${staging_dir}/data" "${APP_DIR}/data" 2>/dev/null
      [ -d "${staging_dir}/public/backgrounds" ] && [ ! -d "${APP_DIR}/public/backgrounds" ] && [ -d "${APP_DIR}" ] && mv "${staging_dir}/public/backgrounds" "${APP_DIR}/public/backgrounds" 2>/dev/null
      true
    ' ERR INT TERM

    # 1. Move user data INTO the staged release so it survives the swap
    if [ -d "${APP_DIR}/data" ]; then
      rm -rf "${staging_dir}/data"
      mv "${APP_DIR}/data" "${staging_dir}/data"
    fi
    if [ -d "${APP_DIR}/public/backgrounds" ]; then
      mkdir -p "${staging_dir}/public"
      rm -rf "${staging_dir}/public/backgrounds"
      mv "${APP_DIR}/public/backgrounds" "${staging_dir}/public/backgrounds"
    fi
    # Preserve .env files
    shopt -s nullglob
    for f in "${APP_DIR}"/.env*; do
      cp -a "${f}" "${staging_dir}/"
    done
    shopt -u nullglob

    # 2. Remove any previous rollback
    rm -rf "${rollback_dir}"

    # 3. Atomic swap: rename current → rollback, staging → current
    #    rename(2) is atomic on the same filesystem
    mv "${APP_DIR}" "${rollback_dir}"
    mv "${staging_dir}" "${APP_DIR}"

    # Clear the trap now that the swap succeeded
    trap - ERR INT TERM

    # NOTE: rollback_dir is intentionally kept — cleaned up after health-check
    echo '{"ok":true}'
    ;;

  cleanup-rollback)
    rollback_dir="${APP_DIR}.rollback"
    rm -rf "${rollback_dir}" 2>/dev/null || true
    echo '{"ok":true}'
    ;;

  migrate-remote)
    # One-time migration: update git remote from old repo to new org
    current_url=$(git remote get-url origin 2>/dev/null || true)
    if [[ "$current_url" == *"agent462/home-screens"* ]]; then
      new_url="${current_url//agent462\/home-screens/home-screens\/home-screens}"
      git remote set-url origin "$new_url" 2>&1
      echo "{\"ok\":true,\"migrated\":true,\"from\":\"${current_url}\",\"to\":\"${new_url}\"}"
    else
      echo "{\"ok\":true,\"migrated\":false}"
    fi
    ;;

  fetch)
    git fetch --tags --force origin 2>&1
    echo "{\"ok\":true}"
    ;;

  checkout)
    target="${1:-}"
    if [ -z "${target}" ]; then
      echo "{\"ok\":false,\"error\":\"No target tag specified\"}"
      exit 1
    fi
    git clean -fd -e data/ -e public/backgrounds/ -e .env* 2>&1
    git checkout -f "${target}" 2>&1
    echo "{\"ok\":true,\"target\":\"${target}\"}"
    ;;

  install)
    # Force include devDependencies (TypeScript etc.) even when
    # NODE_ENV=production is inherited from the systemd service.
    npm install --include=dev 2>&1
    echo "{\"ok\":true}"
    ;;

  build)
    npm run build 2>&1
    echo "{\"ok\":true}"
    ;;

  restart)
    # Try systemctl first (production Pi), fall back gracefully.
    # IMPORTANT: The Next.js server IS the home-screens service, so restarting
    # it immediately would kill the process orchestrating this upgrade.
    # We schedule the restart with a short delay so this script can exit
    # cleanly and the API can respond before the process is terminated.
    if command -v systemctl &>/dev/null && systemctl is-active "${SERVICE_NAME}" &>/dev/null; then
      nohup bash -c "sleep 3 && sudo systemctl restart ${SERVICE_NAME}" > /dev/null 2>&1 &
      echo "{\"ok\":true,\"method\":\"systemctl\"}"
    else
      echo "{\"ok\":true,\"method\":\"manual\",\"message\":\"Service not managed by systemd. Restart manually.\"}"
    fi
    ;;

  reload-browser)
    # Reload the kiosk browser page via Chrome DevTools Protocol.
    # Requires Chromium to be started with --remote-debugging-port=9222.
    # Falls back to killing and relaunching Chromium if CDP is not available.
    CDP_URL="http://localhost:9222"
    reloaded=false

    # Try CDP reload first (no flicker, instant)
    if tab_id=$(curl -sf "${CDP_URL}/json" 2>/dev/null \
        | python3 -c "import sys,json; tabs=json.load(sys.stdin); [print(t['id']) for t in tabs if '/display' in t.get('url','')]" 2>/dev/null \
        | head -1) && [ -n "${tab_id}" ]; then
      curl -sf "${CDP_URL}/json/reload/${tab_id}" > /dev/null 2>&1
      reloaded=true
      echo "{\"ok\":true,\"method\":\"cdp\"}"
    fi

    # Fallback: kill and relaunch Chromium
    if [ "${reloaded}" = false ]; then
      # Find the Wayland display for the running Chromium
      WAYLAND_DISPLAY=""
      CHROMIUM_PID=$(pgrep -x chromium | head -1)
      if [ -n "${CHROMIUM_PID}" ]; then
        WAYLAND_DISPLAY=$(tr '\0' '\n' < "/proc/${CHROMIUM_PID}/environ" 2>/dev/null | grep '^WAYLAND_DISPLAY=' | cut -d= -f2)
      fi
      WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"

      pkill chromium 2>/dev/null || true
      sleep 2
      # Detect whether dbus-run-session is needed at runtime rather than
      # relying solely on kiosk.conf — self-healing if the config is missing.
      NEED_DBUS=false
      if [ "${PI_VARIANT}" = "lite" ] || [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
        command -v dbus-run-session &>/dev/null && NEED_DBUS=true
      fi

      if [ "${NEED_DBUS}" = true ]; then
        WAYLAND_DISPLAY="${WAYLAND_DISPLAY}" XDG_RUNTIME_DIR="/run/user/$(id -u)" \
          nohup dbus-run-session -- chromium --app=http://localhost:${PORT}/display \
            --noerrdialogs --disable-infobars --no-first-run \
            --disable-session-crashed-bubble --disable-translate \
            --check-for-update-interval=31536000 --password-store=basic \
            --ozone-platform=wayland --remote-debugging-port=9222 \
            --ignore-gpu-blocklist --enable-zero-copy \
            --num-raster-threads=2 --force-gpu-mem-available-mb=256 \
            > /dev/null 2>&1 &
      else
        WAYLAND_DISPLAY="${WAYLAND_DISPLAY}" XDG_RUNTIME_DIR="/run/user/$(id -u)" \
          nohup chromium --app=http://localhost:${PORT}/display \
            --noerrdialogs --disable-infobars --no-first-run \
            --disable-session-crashed-bubble --disable-translate \
            --check-for-update-interval=31536000 --password-store=basic \
            --ozone-platform=wayland --remote-debugging-port=9222 \
            --ignore-gpu-blocklist --enable-zero-copy \
            --num-raster-threads=2 --force-gpu-mem-available-mb=256 \
            > /dev/null 2>&1 &
      fi
      echo "{\"ok\":true,\"method\":\"relaunch\"}"
    fi
    ;;

  rollback)
    # Same as checkout - alias for clarity
    target="${1:-}"
    if [ -z "${target}" ]; then
      echo "{\"ok\":false,\"error\":\"No target tag specified\"}"
      exit 1
    fi
    git clean -fd -e data/ -e public/backgrounds/ -e .env* 2>&1
    git checkout -f "${target}" 2>&1
    echo "{\"ok\":true,\"target\":\"${target}\"}"
    ;;

  stash)
    result=$(git stash push -m "home-screens-upgrade-$(date +%s)" 2>&1)
    if echo "${result}" | grep -q "No local changes"; then
      echo "{\"ok\":true,\"stashed\":false}"
    else
      echo "{\"ok\":true,\"stashed\":true}"
    fi
    ;;

  stash-pop)
    if git stash list 2>/dev/null | grep -q "home-screens-upgrade"; then
      git stash pop 2>&1
      echo "{\"ok\":true,\"popped\":true}"
    else
      echo "{\"ok\":true,\"popped\":false}"
    fi
    ;;

  health-check)
    port="${1:-${PORT}}"
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
      if curl -sf "http://localhost:${port}/api/config" >/dev/null 2>&1; then
        echo "{\"ok\":true,\"attempts\":${attempt}}"
        exit 0
      fi
      sleep 2
      attempt=$(( attempt + 1 ))
    done
    echo "{\"ok\":false,\"error\":\"Server did not respond within 60 seconds\"}"
    exit 1
    ;;

  list-backups)
    mkdir -p "${BACKUP_DIR}"
    files="["
    first=true
    for f in $(ls -1t "${BACKUP_DIR}"/config-*.json 2>/dev/null); do
      name=$(basename "$f")
      size=$(wc -c < "$f" | tr -d ' ')
      modified=$(date -r "$f" +%Y-%m-%dT%H:%M:%S 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo "unknown")
      if [ "$first" = true ]; then
        first=false
      else
        files="${files},"
      fi
      files="${files}{\"name\":\"${name}\",\"size\":${size},\"modified\":\"${modified}\"}"
    done
    files="${files}]"
    echo "${files}"
    ;;

  restore-backup)
    backup_name="${1:-}"
    if [ -z "${backup_name}" ]; then
      echo "{\"ok\":false,\"error\":\"No backup file specified\"}"
      exit 1
    fi
    backup_path="${BACKUP_DIR}/${backup_name}"
    if [ ! -f "${backup_path}" ]; then
      echo "{\"ok\":false,\"error\":\"Backup file not found\"}"
      exit 1
    fi
    # Validate it's valid JSON
    if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'))" -- "${backup_path}" 2>/dev/null; then
      echo "{\"ok\":false,\"error\":\"Backup file is not valid JSON\"}"
      exit 1
    fi
    cp "${backup_path}" "${CONFIG_FILE}"
    echo "{\"ok\":true,\"restored\":\"${backup_name}\"}"
    ;;

  setup-system)
    # Idempotent system-level configuration for the kiosk.
    # Safe to run on every deploy/upgrade — only changes what's needed.
    changed=""

    # 0. Ensure required system packages are installed
    REQUIRED_PACKAGES="chromium labwc wtype wlr-randr fonts-noto-color-emoji plymouth plymouth-themes"
    missing=""
    for pkg in ${REQUIRED_PACKAGES}; do
      if ! dpkg -s "${pkg}" &>/dev/null; then
        missing="${missing} ${pkg}"
      fi
    done
    if [ "${PI_VARIANT}" = "lite" ]; then
      for pkg in fonts-noto-core libpam-systemd dbus-user-session; do
        if ! dpkg -s "${pkg}" &>/dev/null; then
          missing="${missing} ${pkg}"
        fi
      done
    fi
    if [ -n "${missing}" ]; then
      sudo apt-get update -qq
      sudo apt-get install -y -qq ${missing}
      changed="${changed}packages,"
    fi

    # Ensure GPU access for labwc/Chromium on Lite (Desktop adds these by default)
    if [ "${PI_VARIANT}" = "lite" ]; then
      for grp in video render; do
        if getent group "${grp}" >/dev/null 2>&1 && ! id -nG "${USER}" | grep -qw "${grp}"; then
          sudo usermod -aG "${grp}" "${USER}"
          changed="${changed}${grp}-group,"
        fi
      done
    fi

    # 1. Ensure fontconfig prioritises emoji font for Chromium
    EMOJI_CONF="/etc/fonts/conf.d/01-emoji.conf"
    DESIRED_EMOJI_CONF='<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <description>Add Noto Color Emoji as fallback for all families</description>
  <match target="pattern">
    <test qual="any" name="family"><string>sans-serif</string></test>
    <edit name="family" mode="append"><string>Noto Color Emoji</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>serif</string></test>
    <edit name="family" mode="append"><string>Noto Color Emoji</string></edit>
  </match>
  <match target="pattern">
    <test qual="any" name="family"><string>monospace</string></test>
    <edit name="family" mode="append"><string>Noto Color Emoji</string></edit>
  </match>
  <alias>
    <family>emoji</family>
    <prefer><family>Noto Color Emoji</family></prefer>
  </alias>
</fontconfig>'
    if [ ! -f "${EMOJI_CONF}" ] || [ "$(cat "${EMOJI_CONF}")" != "${DESIRED_EMOJI_CONF}" ]; then
      echo "${DESIRED_EMOJI_CONF}" | sudo tee "${EMOJI_CONF}" > /dev/null
      sudo fc-cache -f
      changed="${changed}emoji-font,"
    fi

    # 2. Ensure systemd services are current
    #    For tarball installs: use node server.js directly (no npm wrapper)
    #    For git installs: use npm start
    NODE_PATH=$(which node 2>/dev/null || echo "/usr/bin/node")
    if [ -f "${APP_DIR}/server.js" ]; then
      EXEC_START="${NODE_PATH} ${APP_DIR}/server.js"
      WORKING_DIR="${APP_DIR}"
    else
      NPM_PATH=$(which npm 2>/dev/null || echo "/usr/bin/npm")
      EXEC_START="${NPM_PATH} start"
      WORKING_DIR="${APP_DIR}"
    fi

    SERVICE_FILE="/etc/systemd/system/home-screens.service"
    # ExecStartPre recovers from an interrupted atomic deploy — if APP_DIR was
    # removed (mid-swap power loss) but the rollback still exists, restore it.
    DESIRED_SERVICE="[Unit]
Description=Home Screens Next.js Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${WORKING_DIR}
ExecStartPre=/bin/bash -c '[ -d ${APP_DIR} ] || [ ! -d ${APP_DIR}.rollback ] || mv ${APP_DIR}.rollback ${APP_DIR}'
ExecStart=${EXEC_START}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${PORT}

[Install]
WantedBy=multi-user.target"

    if [ ! -f "${SERVICE_FILE}" ] || [ "$(cat "${SERVICE_FILE}")" != "${DESIRED_SERVICE}" ]; then
      echo "${DESIRED_SERVICE}" | sudo tee "${SERVICE_FILE}" > /dev/null
      sudo systemctl daemon-reload
      sudo systemctl enable home-screens.service
      changed="${changed}service,"
    fi

    # 3. Boot to console (required for labwc kiosk)
    CURRENT_DEFAULT=$(systemctl get-default 2>/dev/null || echo "unknown")
    if [ "${CURRENT_DEFAULT}" != "multi-user.target" ]; then
      sudo systemctl set-default multi-user.target
      changed="${changed}boot-target,"
    fi

    # 4. Disable display managers
    for dm in lightdm gdm3 sddm; do
      if systemctl is-enabled "${dm}" &>/dev/null; then
        sudo systemctl disable "${dm}"
        changed="${changed}${dm},"
      fi
    done

    # 5. Disable legacy kiosk service
    if systemctl is-enabled home-screens-kiosk &>/dev/null; then
      sudo systemctl disable home-screens-kiosk
      changed="${changed}legacy-kiosk,"
    fi

    # 6. Autologin on TTY1
    AUTOLOGIN_DIR="/etc/systemd/system/getty@tty1.service.d"
    AUTOLOGIN_CONF="${AUTOLOGIN_DIR}/autologin.conf"
    DESIRED_AUTOLOGIN="[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${USER} --noclear %I \$TERM"

    if [ ! -f "${AUTOLOGIN_CONF}" ] || [ "$(cat "${AUTOLOGIN_CONF}")" != "${DESIRED_AUTOLOGIN}" ]; then
      sudo mkdir -p "${AUTOLOGIN_DIR}"
      echo "${DESIRED_AUTOLOGIN}" | sudo tee "${AUTOLOGIN_CONF}" > /dev/null
      sudo systemctl daemon-reload
      changed="${changed}autologin,"
    fi

    # 7. Generate kiosk.conf from config.json
    KIOSK_CONF="${APP_DIR}/data/kiosk.conf"
    if [ -f "${CONFIG_FILE}" ]; then
      DESIRED_KIOSK=$(node <<GENEOF
var c = JSON.parse(require("fs").readFileSync("${CONFIG_FILE}", "utf-8"));
var s = c.settings || {};
var w = s.displayWidth || 0;
var h = s.displayHeight || 0;
var mw = Math.max(w, h);
var mh = Math.min(w, h);
var lines = [];
if (mw && mh) lines.push('DISPLAY_MODE="' + mw + 'x' + mh + '"');
if (s.displayTransform && s.displayTransform !== "normal") lines.push('DISPLAY_TRANSFORM="' + s.displayTransform + '"');
if (s.piVariant) lines.push('PI_VARIANT="' + s.piVariant + '"');
console.log(lines.join("\\n"));
GENEOF
      )

      if [ ! -f "${KIOSK_CONF}" ] || [ "$(cat "${KIOSK_CONF}")" != "${DESIRED_KIOSK}" ]; then
        echo "${DESIRED_KIOSK}" > "${KIOSK_CONF}"
        changed="${changed}kiosk-conf,"
      fi
      # Fix ownership so the Next.js server (running as $USER) can update kiosk.conf
      if [ "$(id -u)" -eq 0 ] && [ -n "${USER}" ] && [ "${USER}" != "root" ]; then
        chown "${USER}:${USER}" "${KIOSK_CONF}"
      fi
    fi

    # 8a. Kiosk launcher script (run as labwc --session child)
    LAUNCHER="${APP_DIR}/scripts/kiosk-launcher.sh"
    DESIRED_LAUNCHER='#!/usr/bin/env bash
# Launched as the labwc --session child — applies resolution, rotation, hides
# the cursor, then starts Chromium.  When this script (or Chromium) exits,
# labwc exits too, and the autologin cycle restarts everything.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"

# Load display config (generated by setup-system from config.json)
DISPLAY_TRANSFORM=""
DISPLAY_MODE=""
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

# Load port (default 3000)
PORT=3000
if [ -f "${APP_DIR}/data/port.conf" ]; then
  _p=$(tr -d "[:space:]" < "${APP_DIR}/data/port.conf")
  [[ "${_p}" =~ ^[0-9]+$ ]] && PORT="${_p}"
fi

# Apply rotation and resolution in the background (split into separate calls
# so a mode failure does not prevent the transform from applying).
if [ -n "${DISPLAY_TRANSFORM}" ] || [ -n "${DISPLAY_MODE}" ]; then
  OUTPUT=$(wlr-randr 2>/dev/null | head -1 | awk '"'"'{print $1}'"'"' || echo '"'"'HDMI-A-1'"'"')
  [ -n "${DISPLAY_TRANSFORM}" ] && \
    (sleep 1 && wlr-randr --output "${OUTPUT}" --transform "${DISPLAY_TRANSFORM}") &
  [ -n "${DISPLAY_MODE}" ] && \
    (sleep 2 && wlr-randr --output "${OUTPUT}" --mode "${DISPLAY_MODE}" 2>/dev/null \
      || wlr-randr --output "${OUTPUT}" --custom-mode "${DISPLAY_MODE}" 2>/dev/null \
      || true) &
fi

# Hide cursor — triggers the HideCursor keybind defined in labwc rc.xml.
# The cursor reappears on mouse movement and stays hidden during touch.
(sleep 2 && wtype -M logo -k h -m logo) &

# Clear Chromium crash state so kiosk mode is not overridden by a restore dialog.
CHROME_PREFS="${HOME}/.config/chromium/Default/Preferences"
if [ -f "${CHROME_PREFS}" ]; then
  sed -i '"'"'s/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/'"'"' "${CHROME_PREFS}"
fi

# Wait for the Next.js server before launching Chromium (defense in depth —
# on first boot the server may be delayed by firstboot tasks).
for _i in $(seq 1 120); do
  (echo > /dev/tcp/localhost/${PORT}) 2>/dev/null && break
  sleep 1
done

# Launch Chromium in app mode (chromeless window — no tabs, no address bar).
# labwc'"'"'s window rule handles fullscreen via ToggleFullscreen.
# --remote-debugging-port enables programmatic page reload after deploys/upgrades
# GPU flags improve animation/transition smoothness on the Pi
exec chromium \
  --app=http://localhost:${PORT}/display \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-translate \
  --check-for-update-interval=31536000 \
  --password-store=basic \
  --ozone-platform=wayland \
  --remote-debugging-port=9222 \
  --ignore-gpu-blocklist \
  --enable-zero-copy \
  --num-raster-threads=2 \
  --force-gpu-mem-available-mb=256'

    if [ ! -f "${LAUNCHER}" ] || [ "$(cat "${LAUNCHER}")" != "${DESIRED_LAUNCHER}" ]; then
      echo "${DESIRED_LAUNCHER}" > "${LAUNCHER}"
      chmod +x "${LAUNCHER}"
      changed="${changed}launcher,"
    fi
    # Fix ownership when running as root during image build
    if [ "$(id -u)" -eq 0 ] && [ -n "${USER}" ] && [ "${USER}" != "root" ]; then
      chown "${USER}:${USER}" "${LAUNCHER}"
    fi

    # 8b. labwc configuration (window rules, cursor hiding keybind)
    LABWC_DIR="${HOME}/.config/labwc"
    mkdir -p "${LABWC_DIR}"

    DESIRED_RC='<?xml version="1.0"?>
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
</labwc_config>'

    if [ ! -f "${LABWC_DIR}/rc.xml" ] || [ "$(cat "${LABWC_DIR}/rc.xml")" != "${DESIRED_RC}" ]; then
      echo "${DESIRED_RC}" > "${LABWC_DIR}/rc.xml"
      changed="${changed}labwc-rc,"
    fi

    # Fix ownership when running as root during image build
    if [ "$(id -u)" -eq 0 ] && [ -n "${USER}" ] && [ "${USER}" != "root" ]; then
      chown -R "${USER}:${USER}" "${HOME}/.config/labwc"
    fi

    # 9. labwc auto-launch in .bash_profile (idempotent: updates stale blocks)
    #    Re-source kiosk.conf so PI_VARIANT reflects step 7's output (on the
    #    very first run kiosk.conf didn't exist when we sourced it at the top).
    [ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"
    PI_VARIANT="${PI_VARIANT:-desktop}"
    if write_kiosk_block "${PI_VARIANT}" "${APP_DIR}"; then
      changed="${changed}bash-profile,"
    fi

    # 10. Plymouth boot splash
    THEME_SRC="${APP_DIR}/scripts/boot-splash"
    THEME_DIR="/usr/share/plymouth/themes/home-screens"
    if [ -d "${THEME_SRC}" ]; then
      theme_changed=false
      for f in home-screens.plymouth home-screens.script logo.png dot.png; do
        if [ -f "${THEME_SRC}/${f}" ] && { [ ! -f "${THEME_DIR}/${f}" ] || ! cmp -s "${THEME_SRC}/${f}" "${THEME_DIR}/${f}"; }; then
          theme_changed=true
        fi
      done

      if [ "${theme_changed}" = true ]; then
        sudo mkdir -p "${THEME_DIR}"
        sudo cp "${THEME_SRC}/home-screens.plymouth" "${THEME_DIR}/"
        sudo cp "${THEME_SRC}/home-screens.script" "${THEME_DIR}/"
        [ -f "${THEME_SRC}/logo.png" ] && sudo cp "${THEME_SRC}/logo.png" "${THEME_DIR}/"
        [ -f "${THEME_SRC}/dot.png" ] && sudo cp "${THEME_SRC}/dot.png" "${THEME_DIR}/"
      fi

      current_theme=$(/usr/sbin/plymouth-set-default-theme 2>/dev/null || true)
      if [ "${current_theme}" != "home-screens" ] || [ "${theme_changed}" = true ]; then
        sudo /usr/sbin/plymouth-set-default-theme home-screens
        sudo update-initramfs -u
        changed="${changed}plymouth,"
      fi
    fi

    # 11. Plymouth minimum display time (5 seconds)
    PLYMOUTH_QUIT_DROP="/etc/systemd/system/plymouth-quit.service.d/delay.conf"
    DESIRED_DELAY="[Service]
ExecStartPre=/bin/sleep 5"
    if [ ! -f "${PLYMOUTH_QUIT_DROP}" ] || [ "$(cat "${PLYMOUTH_QUIT_DROP}")" != "${DESIRED_DELAY}" ]; then
      sudo mkdir -p "$(dirname "${PLYMOUTH_QUIT_DROP}")"
      echo "${DESIRED_DELAY}" | sudo tee "${PLYMOUTH_QUIT_DROP}" > /dev/null
      sudo systemctl daemon-reload
      changed="${changed}plymouth-delay,"
    fi

    # 12. Quiet boot (suppress kernel messages, hide cursor/logo)
    CMDLINE="/boot/firmware/cmdline.txt"
    if [ -f "${CMDLINE}" ]; then
      cmdline_updated=false
      current_cmdline=$(cat "${CMDLINE}")

      # Remove serial console — forces Plymouth into text-only mode
      if echo "${current_cmdline}" | grep -qE 'console=(serial|ttyAMA|ttyS)[0-9]'; then
        current_cmdline=$(echo "${current_cmdline}" | sed -E 's/ ?console=(serial|ttyAMA|ttyS)[0-9][^ ]*//g')
        cmdline_updated=true
      fi

      # Remove plymouth.debug if present (leftover from troubleshooting)
      if echo "${current_cmdline}" | grep -q 'plymouth\.debug'; then
        current_cmdline=$(echo "${current_cmdline}" | sed -E 's/ ?plymouth\.debug//g')
        cmdline_updated=true
      fi

      for param in quiet "loglevel=0" "logo.nologo" "vt.global_cursor_default=0" "consoleblank=0" splash; do
        if ! echo " ${current_cmdline} " | grep -q " ${param} "; then
          current_cmdline="${current_cmdline} ${param}"
          cmdline_updated=true
        fi
      done
      if [ "${cmdline_updated}" = true ]; then
        echo "${current_cmdline}" | sudo tee "${CMDLINE}" > /dev/null
        changed="${changed}cmdline,"
      fi
    fi

    # 13. Disable firmware rainbow splash
    CONFIG_TXT="/boot/firmware/config.txt"
    if [ -f "${CONFIG_TXT}" ]; then
      if grep -q "^disable_splash=" "${CONFIG_TXT}"; then
        if ! grep -q "^disable_splash=1" "${CONFIG_TXT}"; then
          sudo sed -i 's/^disable_splash=.*/disable_splash=1/' "${CONFIG_TXT}"
          changed="${changed}config-txt,"
        fi
      elif ! grep -q "^disable_splash=1" "${CONFIG_TXT}"; then
        echo "disable_splash=1" | sudo tee -a "${CONFIG_TXT}" > /dev/null
        changed="${changed}config-txt,"
      fi
    fi

    # 14a. brcmfmac driver stability — disable firmware roaming and buggy features.
    #      Official RPi Foundation fix, also adopted by Home Assistant OS.
    BRCMFMAC_CONF="/etc/modprobe.d/brcmfmac.conf"
    DESIRED_BRCMFMAC="options brcmfmac roamoff=1 feature_disable=0x282000"
    if [ ! -f "${BRCMFMAC_CONF}" ] || ! grep -q "feature_disable=0x282000" "${BRCMFMAC_CONF}" 2>/dev/null; then
      echo "${DESIRED_BRCMFMAC}" | sudo tee "${BRCMFMAC_CONF}" > /dev/null
      changed="${changed}brcmfmac-modprobe,"
    fi

    # 14b. Reserve kernel memory for network buffers — prevents WiFi drops
    #      under memory pressure when packet allocation fails.
    WIFI_MEM_CONF="/etc/sysctl.d/98-wifi-memory.conf"
    if [ ! -f "${WIFI_MEM_CONF}" ] || ! grep -q "min_free_kbytes" "${WIFI_MEM_CONF}" 2>/dev/null; then
      echo "vm.min_free_kbytes = 16384" | sudo tee "${WIFI_MEM_CONF}" > /dev/null
      sudo sysctl vm.min_free_kbytes=16384 2>/dev/null || true
      changed="${changed}wifi-memory,"
    fi

    # 14c. WiFi reliability — power management, MAC randomization, IPv6, bgscan.
    #      brcmfmac aggressively sleeps the radio (500-800ms latency spikes),
    #      randomized scan MACs confuse mesh APs, IPv6 multicast triggers radio
    #      issues, and background scanning takes the radio off-channel.
    WIFI_NM_CONF="/etc/NetworkManager/conf.d/wifi-powersave.conf"
    DESIRED_WIFI_NM="[connection]
wifi.powersave = 2

[device-wifi]
match-device=type:wifi
wifi.scan-rand-mac-address=no

[connection-wifi-default]
match-device=type:wifi
wifi.cloned-mac-address=preserve
ipv6.method=disabled"
    if [ ! -f "${WIFI_NM_CONF}" ] || [ "$(sudo cat "${WIFI_NM_CONF}")" != "${DESIRED_WIFI_NM}" ]; then
      echo "${DESIRED_WIFI_NM}" | sudo tee "${WIFI_NM_CONF}" > /dev/null
      sudo iw wlan0 set power_save off 2>/dev/null || true
      changed="${changed}wifi-nm-conf,"
    fi

    # 15. WiFi per-connection hardening — infinite retries, relaxed bgscan, no IPv6.
    #     On mesh networks (Google/Nest WiFi), AP steering causes brief disconnects.
    #     The NM default of 4 retries burns through instantly, leaving the Pi offline.
    #     bgscan takes the radio off-channel; for a stationary device, scan ~never.
    WIFI_CONN=$(nmcli -t -f NAME,TYPE connection show --active 2>/dev/null | grep ':802-11-wireless$' | head -1 | cut -d: -f1)
    if [ -n "${WIFI_CONN}" ]; then
      CURRENT_RETRIES=$(nmcli -g connection.autoconnect-retries connection show "${WIFI_CONN}" 2>/dev/null)
      if [ "${CURRENT_RETRIES}" != "0" ]; then
        sudo nmcli connection modify "${WIFI_CONN}" \
          connection.autoconnect-retries 0 \
          802-11-wireless.powersave 2 \
          ipv6.method disabled 2>/dev/null || true
        changed="${changed}wifi-connection,"
      fi
    fi

    # 15a. Mask suspend/hibernate — brcmfmac can't recover from suspend.
    for target in sleep.target suspend.target hibernate.target hybrid-sleep.target; do
      if ! systemctl is-enabled "${target}" 2>/dev/null | grep -q masked; then
        sudo systemctl mask "${target}" 2>/dev/null || true
        changed="${changed}mask-suspend,"
      fi
    done

    # 16. WiFi watchdog — monitors connectivity and recovers from drops.
    #     Pings the gateway every 2 minutes; escalates through NM reconnect,
    #     interface cycle, and driver reload if needed.
    WATCHDOG_SCRIPT="/usr/local/bin/wifi-watchdog.sh"
    DESIRED_WATCHDOG='#!/bin/bash
# WiFi watchdog for Home Screens display
GATEWAY=$(ip route show default 2>/dev/null | awk "/default via/ {print \$3; exit}")
[ -z "$GATEWAY" ] && exit 0
LOG_TAG=wifi-watchdog
if ping -c 3 -W 5 $GATEWAY > /dev/null 2>&1; then exit 0; fi
logger -t $LOG_TAG "Gateway unreachable, attempting NM reconnect"
WIFI_CONN=$(nmcli -t -f NAME,TYPE connection show 2>/dev/null | grep ":802-11-wireless$" | head -1 | cut -d: -f1)
[ -z "$WIFI_CONN" ] && exit 1
nmcli connection up "$WIFI_CONN" 2>/dev/null; sleep 10
if ping -c 3 -W 5 $GATEWAY > /dev/null 2>&1; then logger -t $LOG_TAG "Reconnected via NM"; exit 0; fi
logger -t $LOG_TAG "NM reconnect failed, cycling wlan0"
nmcli device disconnect wlan0 2>/dev/null; sleep 3; nmcli device connect wlan0 2>/dev/null; sleep 10
if ping -c 3 -W 5 $GATEWAY > /dev/null 2>&1; then logger -t $LOG_TAG "Reconnected via interface cycle"; exit 0; fi
logger -t $LOG_TAG "Interface cycle failed, reloading brcmfmac"
modprobe -r brcmfmac && sleep 2 && modprobe brcmfmac; sleep 15
nmcli connection up "$WIFI_CONN" 2>/dev/null
logger -t $LOG_TAG "Driver reloaded, connection attempt sent"'

    if [ ! -f "${WATCHDOG_SCRIPT}" ] || [ "$(sudo cat "${WATCHDOG_SCRIPT}")" != "${DESIRED_WATCHDOG}" ]; then
      echo "${DESIRED_WATCHDOG}" | sudo tee "${WATCHDOG_SCRIPT}" > /dev/null
      sudo chmod +x "${WATCHDOG_SCRIPT}"
      changed="${changed}wifi-watchdog,"
    fi

    WATCHDOG_SERVICE="/etc/systemd/system/wifi-watchdog.service"
    DESIRED_WD_SERVICE="[Unit]
Description=WiFi connectivity watchdog
After=NetworkManager.service

[Service]
Type=oneshot
ExecStart=${WATCHDOG_SCRIPT}"
    if [ ! -f "${WATCHDOG_SERVICE}" ] || [ "$(sudo cat "${WATCHDOG_SERVICE}")" != "${DESIRED_WD_SERVICE}" ]; then
      echo "${DESIRED_WD_SERVICE}" | sudo tee "${WATCHDOG_SERVICE}" > /dev/null
      changed="${changed}wifi-watchdog-service,"
    fi

    WATCHDOG_TIMER="/etc/systemd/system/wifi-watchdog.timer"
    DESIRED_WD_TIMER="[Unit]
Description=Run WiFi watchdog every 2 minutes

[Timer]
OnBootSec=60
OnUnitActiveSec=120

[Install]
WantedBy=timers.target"
    if [ ! -f "${WATCHDOG_TIMER}" ] || [ "$(sudo cat "${WATCHDOG_TIMER}")" != "${DESIRED_WD_TIMER}" ]; then
      echo "${DESIRED_WD_TIMER}" | sudo tee "${WATCHDOG_TIMER}" > /dev/null
      sudo systemctl daemon-reload
      sudo systemctl enable wifi-watchdog.timer 2>/dev/null || true
      sudo systemctl start wifi-watchdog.timer 2>/dev/null || true
      changed="${changed}wifi-watchdog-timer,"
    fi

    # Remove trailing comma
    changed="${changed%,}"
    if [ -n "${changed}" ]; then
      echo "{\"ok\":true,\"changed\":\"${changed}\"}"
    else
      echo "{\"ok\":true,\"changed\":null}"
    fi
    ;;

  *)
    echo "{\"ok\":false,\"error\":\"Unknown action: ${action}\"}"
    exit 1
    ;;
esac
