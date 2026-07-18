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
#   upgrade.sh finalize-deploy [port] - Wait for new release to be healthy then drop rollback
#   upgrade.sh restart                - Restart the systemd service (spawns finalize-deploy)
#   upgrade.sh health-check           - Verify server is responding
#   upgrade.sh setup-system           - Apply system config (services, kiosk, boot target)
#   upgrade.sh ensure-npm             - Align npm with the engines pin in package.json
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

    # Verify SHA-256 checksum if a sidecar is published. Releases predating
    # the checksum rollout lack a sidecar — warn but continue in that case
    # to keep upgrades to older versions working.
    checksum_name="${asset_name}.sha256"
    checksum_url="https://github.com/${repo}/releases/download/${tag}/${checksum_name}"
    if curl -fsSL --max-time 30 -o "${staging_dir}/${checksum_name}" "${checksum_url}" 2>/dev/null; then
      if ! ( cd "${staging_dir}" && sha256sum -c "${checksum_name}" >/dev/null 2>&1 ); then
        rm -rf "${staging_dir}"
        echo "{\"ok\":false,\"error\":\"Checksum verification failed for ${asset_name}\"}"
        exit 1
      fi
      rm -f "${staging_dir}/${checksum_name}"
    fi
    # If the sidecar was missing we silently continue (backwards compatible
    # with pre-checksum releases) — the bash trap still cleans staging on error.

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

    # Safety trap: covers the atomic swap. Data is COPIED into staging
    # (not moved), so a power loss before the swap leaves the original
    # data intact in APP_DIR — no data restoration is needed in that case.
    # We only need to roll back APP_DIR if the swap failed mid-rename.
    trap '
      [ ! -d "${APP_DIR}" ] && [ -d "${rollback_dir}" ] && mv "${rollback_dir}" "${APP_DIR}" 2>/dev/null
      true
    ' ERR INT TERM

    # 1. COPY user data INTO the staged release so it survives the swap.
    #    Copying (not moving) eliminates the data-stranding window: the
    #    original data remains in APP_DIR throughout the copy phase. If
    #    power is lost mid-copy, recovery is automatic — APP_DIR is intact.
    #    The cost is one extra copy per upgrade (typically tens of MB).
    if [ -d "${APP_DIR}/data" ]; then
      rm -rf "${staging_dir}/data"
      cp -a "${APP_DIR}/data" "${staging_dir}/data"
    fi
    if [ -d "${APP_DIR}/public/backgrounds" ]; then
      mkdir -p "${staging_dir}/public"
      rm -rf "${staging_dir}/public/backgrounds"
      cp -a "${APP_DIR}/public/backgrounds" "${staging_dir}/public/backgrounds"
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
    #    rename(2) is atomic on the same filesystem.
    #    After the swap, the rollback dir still contains the old user data.
    #    finalize-deploy will remove rollback (and that stale data copy)
    #    once the new release passes its health check.
    mv "${APP_DIR}" "${rollback_dir}"
    mv "${staging_dir}" "${APP_DIR}"

    # Clear the trap now that the swap succeeded
    trap - ERR INT TERM

    # NOTE: rollback_dir is intentionally kept — cleaned up after health-check
    echo '{"ok":true}'
    ;;

  cleanup-rollback)
    # Backwards-compat shim for v0.25.0 and earlier upgrade pipelines.
    #
    # Those releases call `cleanup-rollback` AFTER the atomic swap (so this
    # NEW script handles the call) and BEFORE `restart`. The action used to
    # delete APP_DIR.rollback immediately, but that left nothing to recover
    # from when the new release failed to boot — see commit 2d9b1bd.
    #
    # In the current model, `restart` spawns a detached `finalize-deploy`
    # job that drops the rollback dir only after a health check passes, so
    # this shim just needs to succeed without touching anything. If we
    # removed the case entirely (as 2d9b1bd briefly did), the shell hits
    # the unknown-action fallthrough and old installs cannot upgrade past
    # v0.25.0. Keep this case until v0.25.0 is no longer in the wild.
    echo '{"ok":true,"shim":true}'
    ;;

  finalize-deploy)
    # Wait for the new server to become healthy after a deploy + restart,
    # then clean up the rollback directory. Designed to run as a detached
    # background job spawned from `restart`, because the orchestrating
    # process is killed by the systemd restart and cannot run cleanup
    # itself. Leaves the rollback in place if health check fails so the
    # user can recover via the upgrade UI's rollback action.
    #
    # Health check accepts ANY HTTP response code (incl. 401) — when auth
    # is enabled /api/config requires a session or display token, but the
    # 401 still proves the server is bound to the port and processing
    # requests, which is what "healthy" means here. We just want to know
    # the new release booted successfully.
    port="${1:-${PORT:-3000}}"
    rollback_dir="${APP_DIR}.rollback"
    if [ ! -d "${rollback_dir}" ]; then
      echo '{"ok":true,"healthy":true,"rollback":"absent"}'
      exit 0
    fi
    attempt=0
    max_attempts=45  # 45 * 2s = 90s
    while [ ${attempt} -lt ${max_attempts} ]; do
      # %{http_code} is "000" when curl can't connect at all; any HTTP
      # response (200, 401, 500, ...) means the server is reachable.
      http_code=$(curl -s -o /dev/null --max-time 5 -w "%{http_code}" \
        "http://localhost:${port}/api/config" 2>/dev/null || echo "000")
      if [ -n "${http_code}" ] && [ "${http_code}" != "000" ]; then
        rm -rf "${rollback_dir}" 2>/dev/null || true
        echo "{\"ok\":true,\"healthy\":true,\"attempts\":${attempt},\"status\":${http_code}}"
        exit 0
      fi
      sleep 2
      attempt=$(( attempt + 1 ))
    done
    echo "{\"ok\":false,\"error\":\"New release did not become healthy within 90s; rollback preserved at ${rollback_dir}\"}"
    exit 1
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

  ensure-npm)
    # .npmrc ships engine-strict=true, so an npm older than the engines pin
    # hard-fails every install. Called by deploy.sh before installing deps.
    ensure_pinned_npm "${APP_DIR}" 2>&1
    echo "{\"ok\":true}"
    ;;

  install)
    # Align npm with the engines pin first (guarded: common.sh may be absent
    # on very old checkouts this legacy path upgrades from).
    type -t ensure_pinned_npm >/dev/null && ensure_pinned_npm "${APP_DIR}" 2>&1
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
      # Read port now so the detached job doesn't depend on the orchestrating
      # process's environment after restart. Wrap cat||echo in braces so the
      # fallback applies to the whole subshell, not just the trailing tr.
      finalize_port=$( { cat "${APP_DIR}/data/port.conf" 2>/dev/null || echo 3000; } | tr -d '[:space:]' )
      finalize_log="${APP_DIR}/data/upgrade-finalize.log"
      mkdir -p "$(dirname "${finalize_log}")" 2>/dev/null || true
      # Detached job: restart the service, verify systemd actually replaced
      # the running process, then finalize by health-checking and cleaning up
      # the rollback. `setsid` makes it survive the orchestrator's death.
      #
      # CRITICAL: this block must short-circuit on ANY failure so finalize-deploy
      # never runs against a still-living old process. `set -e` aborts on error.
      # The MainPID check rejects the case where systemctl exits 0 but the
      # process was not actually replaced (e.g., transient systemd state).
      nohup setsid bash -c "
        set -e
        sleep 3
        old_pid=\$(systemctl show -p MainPID --value ${SERVICE_NAME} 2>/dev/null || echo 0)
        sudo systemctl restart ${SERVICE_NAME}
        # Give systemd time to spawn the replacement process
        sleep 5
        new_pid=\$(systemctl show -p MainPID --value ${SERVICE_NAME} 2>/dev/null || echo 0)
        if [ \"\${new_pid}\" = \"0\" ] || [ \"\${new_pid}\" = \"\${old_pid}\" ]; then
          echo \"Restart did not produce a new MainPID (old=\${old_pid}, new=\${new_pid}); aborting finalize to preserve rollback\" >&2
          exit 1
        fi
        systemctl is-active --quiet ${SERVICE_NAME}
        bash '${APP_DIR}/scripts/upgrade.sh' finalize-deploy '${finalize_port}'
      " > "${finalize_log}" 2>&1 < /dev/null &
      disown 2>/dev/null || true
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
            --autoplay-policy=no-user-gesture-required \
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
            --autoplay-policy=no-user-gesture-required \
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
    # Accept any HTTP response code (incl. 401 from auth-enabled installs)
    # as proof the server is up. We're checking liveness, not authorization.
    port="${1:-${PORT}}"
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
      http_code=$(curl -s -o /dev/null --max-time 5 -w "%{http_code}" \
        "http://localhost:${port}/api/config" 2>/dev/null || echo "000")
      if [ -n "${http_code}" ] && [ "${http_code}" != "000" ]; then
        echo "{\"ok\":true,\"attempts\":${attempt},\"status\":${http_code}}"
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
    REQUIRED_PACKAGES="chromium labwc wtype wlr-randr fonts-noto-color-emoji plymouth plymouth-themes vim"
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

    # 0b. Stop cloud-init from re-applying its cached hostname on every boot.
    # Raspberry Pi OS ships cloud-init enabled; without this drop-in,
    # /etc/hostname is rewritten on each boot from /boot/firmware/user-data,
    # silently undoing any hostnamectl change made through the editor.
    # Idempotent: only writes when the file is missing or differs.
    if [ -d /etc/cloud ]; then
      CLOUD_HOSTNAME_CONF="/etc/cloud/cloud.cfg.d/99-home-screens-hostname.cfg"
      DESIRED_CLOUD_HOSTNAME="preserve_hostname: true"
      if [ ! -f "${CLOUD_HOSTNAME_CONF}" ] \
         || [ "$(cat "${CLOUD_HOSTNAME_CONF}")" != "${DESIRED_CLOUD_HOSTNAME}" ]; then
        sudo mkdir -p /etc/cloud/cloud.cfg.d
        echo "${DESIRED_CLOUD_HOSTNAME}" | sudo tee "${CLOUD_HOSTNAME_CONF}" > /dev/null
        changed="${changed}cloud-init-hostname,"
      fi
    fi

    # 0c. Stop cloud-init from rewriting netplan on every boot. The NoCloud
    # datasource on Raspberry Pi OS contains only an ethernet stanza; on
    # boot, cloud-init regenerates /etc/netplan from it and deletes the
    # NM-managed 90-NM-<uuid>.yaml that stores any Wi-Fi profile added via
    # the editor. Same idempotent drop-in pattern as the hostname fix.
    if [ -d /etc/cloud ]; then
      CLOUD_NETWORK_CONF="/etc/cloud/cloud.cfg.d/99-home-screens-network.cfg"
      DESIRED_CLOUD_NETWORK="network: {config: disabled}"
      if [ ! -f "${CLOUD_NETWORK_CONF}" ] \
         || [ "$(cat "${CLOUD_NETWORK_CONF}")" != "${DESIRED_CLOUD_NETWORK}" ]; then
        sudo mkdir -p /etc/cloud/cloud.cfg.d
        echo "${DESIRED_CLOUD_NETWORK}" | sudo tee "${CLOUD_NETWORK_CONF}" > /dev/null
        changed="${changed}cloud-init-network,"
      fi
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
TimeoutStopSec=15
KillMode=mixed
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

    # 2b. Hardware reporter — the hub reads its own /proc in-process (see
    #     src/lib/hardware-stats-server.ts), so hub Pis don't need the bash
    #     reporter. It's only meaningful on display-only Pis that don't run
    #     Node. Three concerns in priority order:
    #       a) Tear down any self-looping timer left over from RC installs
    #          that enabled it on the hub. One-shot, idempotent.
    #       b) Keep the reporter files (binary + unit files + env file) fresh
    #          on whatever Pi is running this script, so a display-only Pi
    #          upgraded via rsync gets the newest reporter logic.
    #       c) Leave the timer's enable/disable state alone if the user has
    #          deliberately enabled it (e.g. for diagnosis on a hub).
    if systemctl is-enabled home-screens-reporter.timer >/dev/null 2>&1 \
       && [ ! -f /etc/default/home-screens-reporter ]; then
      # Timer was enabled without an env file — that's the v1.2.0-rc.0
      # footgun. It cannot succeed (DISPLAY_ID/HUB_URL unset); disable it so
      # the hub stops spawning the tick-every-30s process and emitting
      # "missing DISPLAY_ID" journal entries on every firing.
      sudo systemctl disable --now home-screens-reporter.timer 2>/dev/null || true
      info "Disabled misconfigured home-screens-reporter.timer (env file missing — was never able to post)."
      changed="${changed}reporter-cleanup,"
    fi

    # v1.2.0-rc.0/rc.1 wrote a `reporter_token` into data/secrets.json for
    # the shared-secret auth model that no longer exists. Remove it on any
    # install that still has it — it's dead weight and might confuse a
    # future operator who sees it in the secrets file. Idempotent: no-op
    # when the key is absent.
    SECRETS_FILE="${APP_DIR}/data/secrets.json"
    if [ -f "${SECRETS_FILE}" ] && grep -q '"reporter_token"' "${SECRETS_FILE}" 2>/dev/null; then
      node -e "
        const fs = require('fs');
        const path = process.argv[1];
        try {
          const s = JSON.parse(fs.readFileSync(path, 'utf-8'));
          if ('reporter_token' in s) {
            delete s.reporter_token;
            fs.writeFileSync(path, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
          }
        } catch { /* leave file alone if unreadable — not our problem to fix */ }
      " "${SECRETS_FILE}" 2>/dev/null || true
      info "Removed stale reporter_token from secrets.json."
      changed="${changed}reporter-secret-cleanup,"
    fi

    REPORTER_SRC_DIR="${APP_DIR}/scripts"
    REPORTER_BIN="/usr/local/bin/home-screens-reporter.sh"
    REPORTER_SERVICE="/etc/systemd/system/home-screens-reporter.service"
    REPORTER_TIMER="/etc/systemd/system/home-screens-reporter.timer"
    if [ -f "${REPORTER_SRC_DIR}/reporter.sh" ]; then
      reporter_changed=0
      if [ ! -f "${REPORTER_BIN}" ] || ! sudo cmp -s "${REPORTER_SRC_DIR}/reporter.sh" "${REPORTER_BIN}"; then
        sudo install -m 0755 "${REPORTER_SRC_DIR}/reporter.sh" "${REPORTER_BIN}"
        reporter_changed=1
      fi
      if [ -f "${REPORTER_SRC_DIR}/home-screens-reporter.service" ] && \
         ( [ ! -f "${REPORTER_SERVICE}" ] || ! sudo cmp -s "${REPORTER_SRC_DIR}/home-screens-reporter.service" "${REPORTER_SERVICE}" ); then
        sudo install -m 0644 "${REPORTER_SRC_DIR}/home-screens-reporter.service" "${REPORTER_SERVICE}"
        reporter_changed=1
      fi
      if [ -f "${REPORTER_SRC_DIR}/home-screens-reporter.timer" ] && \
         ( [ ! -f "${REPORTER_TIMER}" ] || ! sudo cmp -s "${REPORTER_SRC_DIR}/home-screens-reporter.timer" "${REPORTER_TIMER}" ); then
        sudo install -m 0644 "${REPORTER_SRC_DIR}/home-screens-reporter.timer" "${REPORTER_TIMER}"
        reporter_changed=1
      fi
      if [ "${reporter_changed}" = "1" ]; then
        sudo systemctl daemon-reload
        # Restart the timer only if it has the config it needs AND the
        # admin has opted in by enabling it. The hub path never falls here
        # because install.sh no longer enables the reporter for hubs.
        if [ -f /etc/default/home-screens-reporter ] && \
           systemctl is-enabled home-screens-reporter.timer >/dev/null 2>&1; then
          sudo systemctl restart home-screens-reporter.timer 2>/dev/null || true
        fi
        changed="${changed}reporter,"
      fi
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

# Purge session restore data so Chromium does not re-open the previous
# session'"'"'s app window alongside the new --app window.  Without this, every
# reboot produces a duplicate tab that silently drains the command queue.
rm -rf "${HOME}/.config/chromium/Default/Sessions" 2>/dev/null || true

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
  --autoplay-policy=no-user-gesture-required \
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

    # 8c. Remove stale Chromium launch from labwc autostart (if present).
    #     Legacy installs launched Chromium from autostart AND kiosk-launcher.sh,
    #     causing two page targets that race on the display command queue.
    if [ -f "${LABWC_DIR}/autostart" ] && grep -q 'chromium' "${LABWC_DIR}/autostart"; then
      sed -i '/chromium/d' "${LABWC_DIR}/autostart"
      changed="${changed}labwc-autostart,"
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

    # 10. Plymouth boot splash + 5s minimum display + quiet-boot cmdline +
    #     firmware rainbow splash. Same logic the display-only branch in
    #     install.sh runs — see setup_boot_splash in scripts/lib/common.sh.
    setup_boot_splash "${APP_DIR}/scripts/boot-splash"
    if [ -n "${BOOT_SPLASH_CHANGES}" ]; then
      changed="${changed}${BOOT_SPLASH_CHANGES},"
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
    masked_any=0
    for target in sleep.target suspend.target hibernate.target hybrid-sleep.target; do
      if ! systemctl is-enabled "${target}" 2>/dev/null | grep -q masked; then
        sudo systemctl mask "${target}" 2>/dev/null || true
        masked_any=1
      fi
    done
    [ "${masked_any}" = "1" ] && changed="${changed}mask-suspend,"

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

    # 17. Volatile journal — keep logs in RAM to reduce SD card writes.
    _JOURNALD_DIR="/etc/systemd/journald.conf.d"
    _JOURNALD_CONF="${_JOURNALD_DIR}/home-screens.conf"
    _DESIRED_JOURNALD="[Journal]
Storage=volatile
RuntimeMaxUse=16M
RuntimeMaxFileSize=4M
SyncIntervalSec=5min"
    if [ ! -f "${_JOURNALD_CONF}" ] || [ "$(sudo cat "${_JOURNALD_CONF}")" != "${_DESIRED_JOURNALD}" ]; then
      sudo mkdir -p "${_JOURNALD_DIR}"
      echo "${_DESIRED_JOURNALD}" | sudo tee "${_JOURNALD_CONF}" > /dev/null
      sudo systemctl restart systemd-journald 2>/dev/null || true
      changed="${changed}journald,"
    fi

    # 18. Swap optimization — low swappiness + reduced cache pressure for kiosk.
    _ZRAM_SYSCTL="/etc/sysctl.d/99-home-screens-zram.conf"
    _DESIRED_ZRAM_SYSCTL="vm.swappiness=10
vm.vfs_cache_pressure=50"
    if [ ! -f "${_ZRAM_SYSCTL}" ] || [ "$(sudo cat "${_ZRAM_SYSCTL}")" != "${_DESIRED_ZRAM_SYSCTL}" ]; then
      echo "${_DESIRED_ZRAM_SYSCTL}" | sudo tee "${_ZRAM_SYSCTL}" > /dev/null
      changed="${changed}zram-sysctl,"
    fi

    # Purge zram-tools if present (conflicts with native zram-generator)
    if dpkg -s zram-tools &>/dev/null; then
      sudo apt-get purge -y -qq zram-tools 2>/dev/null || true
      changed="${changed}purge-zram-tools,"
    fi

    # Stop/disable/purge dphys-swapfile and remove /var/swap if present
    if dpkg -s dphys-swapfile &>/dev/null; then
      sudo systemctl stop dphys-swapfile 2>/dev/null || true
      sudo systemctl disable dphys-swapfile 2>/dev/null || true
      sudo apt-get purge -y -qq dphys-swapfile 2>/dev/null || true
      changed="${changed}purge-dphys-swapfile,"
    fi
    if [ -f /var/swap ]; then
      sudo swapoff /var/swap 2>/dev/null || true
      sudo rm -f /var/swap
      changed="${changed}remove-swapfile,"
    fi

    # 19. Disable unnecessary services — reduce background activity and SD wear.
    _DISABLE_SVCS="apt-daily.service apt-daily-upgrade.service apt-daily.timer apt-daily-upgrade.timer man-db.timer dpkg-db-backup.timer rsyslog.service syslog.service bluetooth.service hciuart.service bthelper@.service ModemManager.service triggerhappy.service triggerhappy.socket systemd-journal-flush.service smartmontools.service smartd.service serial-getty@ttyAMA0.service serial-getty@ttyS0.service"
    _disabled_any=0
    for _svc in ${_DISABLE_SVCS}; do
      # Skip if the unit doesn't exist on this system
      if ! systemctl list-unit-files "${_svc}" &>/dev/null; then
        continue
      fi
      _state=$(systemctl is-enabled "${_svc}" 2>/dev/null || echo "missing")
      if [ "${_state}" != "masked" ] && [ "${_state}" != "disabled" ] && [ "${_state}" != "missing" ] && [ "${_state}" != "indirect" ]; then
        sudo systemctl disable "${_svc}" 2>/dev/null || true
        sudo systemctl stop "${_svc}" 2>/dev/null || true
        _disabled_any=1
      fi
    done
    [ "${_disabled_any}" = "1" ] && changed="${changed}disable-services,"

    # Mask services that package installs or deps might re-enable
    _MASK_SVCS="rsyslog.service ModemManager.service bluetooth.service"
    _masked_any=0
    for _svc in ${_MASK_SVCS}; do
      _state=$(systemctl is-enabled "${_svc}" 2>/dev/null || echo "missing")
      if [ "${_state}" != "masked" ] && [ "${_state}" != "missing" ]; then
        sudo systemctl mask "${_svc}" 2>/dev/null || true
        _masked_any=1
      fi
    done
    [ "${_masked_any}" = "1" ] && changed="${changed}mask-services,"

    # 20. Storage-specific optimizations — adapt trim/scrub to disk type.
    _ROOT_PART=$(findmnt -n -o SOURCE / 2>/dev/null || echo "")
    _ROOT_DEV=$(lsblk -no PKNAME "${_ROOT_PART}" 2>/dev/null || echo "")
    if [ -n "${_ROOT_DEV}" ]; then
      case "${_ROOT_DEV}" in
        mmcblk*)
          # SD card — no TRIM support, disable timers
          for _tmr in fstrim.timer e2scrub_all.timer; do
            _state=$(systemctl is-enabled "${_tmr}" 2>/dev/null || echo "missing")
            if [ "${_state}" != "masked" ] && [ "${_state}" != "disabled" ] && [ "${_state}" != "missing" ]; then
              sudo systemctl disable "${_tmr}" 2>/dev/null || true
              sudo systemctl stop "${_tmr}" 2>/dev/null || true
              changed="${changed}disable-${_tmr},"
            fi
          done
          ;;
        *)
          # SSD/NVMe — enable TRIM and scrub
          for _tmr in fstrim.timer e2scrub_all.timer; do
            _state=$(systemctl is-enabled "${_tmr}" 2>/dev/null || echo "missing")
            if [ "${_state}" = "disabled" ]; then
              sudo systemctl enable "${_tmr}" 2>/dev/null || true
              sudo systemctl start "${_tmr}" 2>/dev/null || true
              changed="${changed}enable-${_tmr},"
            fi
          done
          ;;
      esac
    fi

    # 21. File descriptor limits — Chromium and Next.js benefit from higher limits.
    _LIMITS_CONF="/etc/security/limits.d/99-home-screens.conf"
    _DESIRED_LIMITS="${USER} soft nofile 65536
${USER} hard nofile 65536"
    if [ ! -f "${_LIMITS_CONF}" ] || [ "$(sudo cat "${_LIMITS_CONF}")" != "${_DESIRED_LIMITS}" ]; then
      echo "${_DESIRED_LIMITS}" | sudo tee "${_LIMITS_CONF}" > /dev/null
      changed="${changed}fd-limits,"
    fi

    # 22. tmpfs mounts — reduce SD card writes for temp files.
    _FSTAB_MARKER="# Home Screens tmpfs"
    if ! grep -q "${_FSTAB_MARKER}" /etc/fstab 2>/dev/null; then
      sudo tee -a /etc/fstab > /dev/null <<TMPFS_EOF
${_FSTAB_MARKER}
tmpfs /tmp tmpfs defaults,noatime,nosuid,nodev,size=256M,mode=1777 0 0
tmpfs /var/tmp tmpfs defaults,noatime,nosuid,nodev,size=128M,mode=1777 0 0
TMPFS_EOF
      changed="${changed}tmpfs-mounts,"
    fi

    # 23. WiFi autoconnect dispatcher — set infinite retries and disable powersave
    #     on any WiFi connection that comes up, including new SSIDs.
    _DISPATCHER="/etc/NetworkManager/dispatcher.d/99-wifi-autoconnect"
    _DESIRED_DISPATCHER='#!/bin/bash
# Home Screens — ensure WiFi connections always reconnect and stay awake.
# Runs on any NM connection "up" event; $CONNECTION_UUID is set by NM.
[ "$2" != "up" ] && exit 0
CONN_TYPE=$(nmcli -g connection.type connection show "$CONNECTION_UUID" 2>/dev/null)
[ "$CONN_TYPE" != "802-11-wireless" ] && exit 0
CURRENT=$(nmcli -g connection.autoconnect-retries connection show "$CONNECTION_UUID" 2>/dev/null)
[ "$CURRENT" = "0" ] && exit 0
nmcli connection modify "$CONNECTION_UUID" connection.autoconnect-retries 0 2>/dev/null
nmcli connection modify "$CONNECTION_UUID" 802-11-wireless.powersave 2 2>/dev/null'
    if [ ! -f "${_DISPATCHER}" ] || [ "$(sudo cat "${_DISPATCHER}")" != "${_DESIRED_DISPATCHER}" ]; then
      echo "${_DESIRED_DISPATCHER}" | sudo tee "${_DISPATCHER}" > /dev/null
      sudo chmod +x "${_DISPATCHER}"
      changed="${changed}wifi-dispatcher,"
    fi

    # 24. Boot speed — disable services that block boot waiting for network.
    for _svc in systemd-networkd-wait-online.service NetworkManager-wait-online.service; do
      _state=$(systemctl is-enabled "${_svc}" 2>/dev/null || echo "missing")
      if [ "${_state}" != "masked" ] && [ "${_state}" != "disabled" ] && [ "${_state}" != "missing" ]; then
        sudo systemctl disable "${_svc}" 2>/dev/null || true
        changed="${changed}disable-${_svc},"
      fi
    done
    # If dhcpcd is enabled but NetworkManager is also enabled, disable dhcpcd (redundant)
    _dhcpcd_state=$(systemctl is-enabled dhcpcd 2>/dev/null || echo "missing")
    _nm_state=$(systemctl is-enabled NetworkManager 2>/dev/null || echo "missing")
    if [ "${_dhcpcd_state}" = "enabled" ] && [ "${_nm_state}" = "enabled" ]; then
      sudo systemctl disable dhcpcd 2>/dev/null || true
      sudo systemctl stop dhcpcd 2>/dev/null || true
      changed="${changed}disable-dhcpcd,"
    fi

    # 25. Kernel parameter tuning — raise inotify watch limit for Next.js file watching.
    _SYSCTL_CONF="/etc/sysctl.d/99-home-screens.conf"
    _DESIRED_SYSCTL="fs.inotify.max_user_watches=524288"
    if [ ! -f "${_SYSCTL_CONF}" ] || [ "$(sudo cat "${_SYSCTL_CONF}")" != "${_DESIRED_SYSCTL}" ]; then
      echo "${_DESIRED_SYSCTL}" | sudo tee "${_SYSCTL_CONF}" > /dev/null
      changed="${changed}sysctl-inotify,"
    fi

    # Apply all sysctl changes
    sudo sysctl --system > /dev/null 2>&1 || true

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
