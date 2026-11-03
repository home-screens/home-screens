#!/usr/bin/env bash
set -euo pipefail

# Home Screens Upgrade Script
# Called by the API to perform upgrades (tarball-based or git-based fallback).
#
# Usage: upgrade.sh <action> [args...]
#   upgrade.sh preflight              - Check if upgrade is possible
#   upgrade.sh sudo-check             - Passwordless sudo ready (repairs it with the image default)
#   upgrade.sh grant-sudo             - Write the passwordless sudo grant; password on stdin
#   upgrade.sh backup [target-tag]    - Backup config to data/backups/ (pins a copy when leaving a release build)
#   upgrade.sh download <tag>         - Download release tarball from GitHub
#   upgrade.sh prepare-deploy         - Verify/provision the staged release runtime
#   upgrade.sh deploy [--runtime-ready] - Atomic swap of staged files into place
#   upgrade.sh finalize-deploy [port] - Wait for new release to be healthy then drop rollback
#   upgrade.sh restart                - Restart the systemd service (spawns finalize-deploy)
#   upgrade.sh health-check           - Verify server is responding
#   upgrade.sh setup-system           - Apply system config (services, kiosk, boot target)
#   upgrade.sh ensure-runtime         - Raise Node and npm to the engines floor in package.json
#   upgrade.sh list-backups           - List config backups
#   upgrade.sh restore-backup <file>  - Safely restore a settings snapshot offline
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
# Recovery performs its read-only ownership check before sourcing any saved
# kiosk settings or entering the general upgrade actions below.
if [ "${1:-}" = "restore-backup" ]; then
  shift
  exec node "${APP_DIR}/scripts/restore-snapshot.mjs" "$@"
fi
BACKUP_DIR="${APP_DIR}/data/backups"
CONFIG_FILE="${APP_DIR}/data/config.json"
SERVICE_NAME="home-screens"
MAX_BACKUPS=6
# Config snapshot pinned the last time a release build was replaced by an
# early-access or test build. Never rotated; see the backup action.
LAST_STABLE_BACKUP="last-stable-config.json"

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

# Reload systemd after writing a unit file.
#
# setup-system is also run inside a chroot by the image builder, where there is
# no init to reload and units are read when the device first boots. Guarding
# explicitly keeps the on-device path strict — a failing daemon-reload there is
# a real error and should still abort under `set -e` — without depending on
# systemctl's own chroot detection, which needs the build host's /proc mounted
# and returns success only as a side effect.
hs_daemon_reload() {
  if [ "${HS_CHROOT:-0}" = "1" ]; then
    return 0
  fi
  sudo systemctl daemon-reload
}

# Passwordless sudo for the account running the service.
#
# Every privileged thing the app does (restart, setup-system, WiFi and hostname
# changes) goes through sudo, and Raspberry Pi OS only grants NOPASSWD to the
# account its first-boot wizard creates. Images built before September 2026
# shipped the hs account without it (issue #47). These helpers let the app
# repair that itself: silently with the image's default password, otherwise
# with a password the person types into the editor. The password only ever
# travels on stdin (never argv, never a log line) and every sudo -S call uses
# -k so a cached credential can never make a missing grant look present.
HS_IMAGE_ACCOUNT="hs"
HS_IMAGE_DEFAULT_PASSWORD="screens"

hs_sudo_ready() {
  sudo -n true 2>/dev/null
}

# Write the NOPASSWD grant for the current account using a password read from
# stdin. Same file name and shape as the grant Pi OS writes for its own user.
# The file goes through a temp path and visudo so a bad write can never lock
# sudo, and the function only reports success once sudo -n actually works.
hs_write_sudo_grant() {
  local user grant target
  user="$(id -un)"
  grant="${user} ALL=(ALL) NOPASSWD: ALL"
  target="/etc/sudoers.d/010_${user}-nopasswd"
  sudo -S -k -p '' sh -c '
    set -e
    tmp="$(mktemp /etc/sudoers.d/.010-nopasswd.XXXXXX)"
    printf "%s\n" "$1" > "${tmp}"
    chmod 0440 "${tmp}"
    visudo -cf "${tmp}" >/dev/null
    mv "${tmp}" "$2"
  ' sh "${grant}" "${target}" 2>/dev/null || return 1
  hs_sudo_ready
}

# Try the image default without asking anyone. Only for the image account:
# any other account would just add a failed-auth line to the journal on every
# check. The password is verified against a harmless command first so a
# wrong default fails before anything is written.
hs_sudo_heal_default() {
  [ "$(id -un)" = "${HS_IMAGE_ACCOUNT}" ] || return 1
  printf '%s\n' "${HS_IMAGE_DEFAULT_PASSWORD}" | sudo -S -k -p '' true 2>/dev/null || return 1
  printf '%s\n' "${HS_IMAGE_DEFAULT_PASSWORD}" | hs_write_sudo_grant
}

# Ready, or repaired silently. Returns 1 when a password is needed.
hs_sudo_check() {
  hs_sudo_ready && return 0
  hs_sudo_heal_default
}

HS_SUDO_NEEDS_PASSWORD_MSG="This device is not set up to let Home Screens make system changes without a password."

# hs_launcher_changed <desired> <launcher> <previous-launcher>
# True when the kiosk session would start differently from the launcher it is
# running now. A tarball update swaps in a tree that does not carry the
# generated launcher, so a missing file only says the tree is new: the tree it
# replaced, kept beside it as current.rollback until the new release has
# started, holds the launcher the running session came from.
hs_launcher_changed() {
  local desired="$1" launcher="$2" previous="$3" before
  before="${launcher}"
  [ -f "${before}" ] || before="${previous}"
  [ ! -f "${before}" ] || [ "$(cat "${before}")" != "${desired}" ]
}

# hs_installs_session_package <package>...
# True when one of the packages just installed or updated is a program the
# kiosk session runs (SYSTEM_PACKAGES in lib/common.sh: Chromium, labwc,
# kanshi, wlopm, wlr-randr, wtype). The running session keeps the old one
# until the device restarts, and Chromium in particular misbehaves once its
# files change under it. Every other package either works as soon as it is
# installed or only matters at the next boot, so installing vim or a font
# must not ask anyone to restart a wall that is not out of date.
hs_installs_session_package() {
  local pkg session
  session="${SYSTEM_PACKAGES:-chromium labwc kanshi wlopm wlr-randr wtype}"
  for pkg in "$@"; do
    case " ${session} " in
      *" ${pkg} "*) return 0 ;;
    esac
  done
  return 1
}

# hs_package_versions <package>...
# "name version" per installed package, one a line. Packages apt does not
# know, or knows but has not installed, are left out.
hs_package_versions() {
  [ $# -gt 0 ] || return 0
  dpkg-query -W -f='${Package} ${Version}\n' "$@" 2>/dev/null | awk 'NF == 2' || true
}

# hs_write_system_packages_record <packages>
# data/system-packages.json: what is installed and when it was last checked,
# for the System page. Versions are trimmed to the characters a Debian
# version can hold, so the file is always valid JSON.
hs_write_system_packages_record() {
  local file="${APP_DIR}/data/system-packages.json" line name version first="true" json
  json="{\"checkedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"versions\":{"
  while read -r name version; do
    [ -n "${name}" ] || continue
    version="$(printf '%s' "${version}" | tr -cd 'A-Za-z0-9.:+~-')"
    [ "${first}" = "true" ] || json="${json},"
    json="${json}\"${name}\":\"${version}\""
    first="false"
    # shellcheck disable=SC2086
  done <<< "$(hs_package_versions $1)"
  json="${json}}}"
  mkdir -p "${APP_DIR}/data" 2>/dev/null || true
  printf '%s\n' "${json}" > "${file}.tmp" 2>/dev/null && mv -f "${file}.tmp" "${file}" 2>/dev/null || true
}

# hs_upgrade_system_packages
# Brings SYSTEM_PACKAGES to the archive's newest version and leaves the names
# of the ones that changed in HS_UPGRADED_PACKAGES. Best effort end to end:
# every apt call is bounded, and a failure only means the Pi keeps what it
# has until the next install, which is what the missing-package step above it
# has always done. Skipped in the image build (the packages are installed
# fresh there), where apt is not the package manager, and when the disk has
# no room to unpack Chromium. Holds from SYSTEM_PACKAGE_HOLDS are placed
# first, the ones a previous release placed are released, and held packages
# (ours or a person's) are left out of the request: apt refuses the whole
# transaction otherwise.
#
# The budget: the server runs setup-system with a ten-minute limit, the one
# that installs this release included, so the whole pass has to fit well
# inside it with room for the rest of setup-system. Update 60 s, dry run
# 30 s, download 240 s, install 180 s. The download is a step of its own so a
# slow night on WiFi ends with files in apt's cache and nothing half
# installed; the next install picks the download up where it stopped.
#
# Test seams (never set on a device): HS_APT_UPDATE_TIMEOUT,
# HS_APT_PLAN_TIMEOUT, HS_APT_DOWNLOAD_TIMEOUT and HS_APT_UPGRADE_TIMEOUT
# (seconds), HS_MIN_FREE_KB.
hs_upgrade_system_packages() {
  HS_UPGRADED_PACKAGES=""
  local packages="${SYSTEM_PACKAGES:-}" holds="${SYSTEM_PACKAGE_HOLDS:-}"
  [ -n "${packages}" ] || return 0
  [ "${HS_CHROOT:-0}" = "1" ] && return 0
  command -v apt-get >/dev/null 2>&1 || return 0

  local installed="" pkg
  for pkg in ${packages}; do
    dpkg -s "${pkg}" >/dev/null 2>&1 && installed="${installed} ${pkg}"
  done
  installed="${installed# }"
  [ -n "${installed}" ] || return 0

  local free_kb
  free_kb="$(df --output=avail -k "${APP_DIR}" 2>/dev/null | tail -n 1 | tr -d ' ')"
  if [ -n "${free_kb}" ] && [ "${free_kb}" -lt "${HS_MIN_FREE_KB:-409600}" ]; then
    echo "Not enough free space to update the display's programs; they stay as they are"
    hs_write_system_packages_record "${installed}"
    return 0
  fi

  # Holds: release the ones an earlier release placed and this one dropped,
  # place this release's. Only holds recorded here are ever released.
  local holds_file="${APP_DIR}/data/system-package-holds" placed=""
  [ -f "${holds_file}" ] && placed="$(tr '\n' ' ' < "${holds_file}")"
  for pkg in ${placed}; do
    case " ${holds} " in
      *" ${pkg} "*) ;;
      *) sudo apt-mark unhold "${pkg}" >/dev/null 2>&1 || true ;;
    esac
  done
  for pkg in ${holds}; do
    sudo apt-mark hold "${pkg}" >/dev/null 2>&1 || true
  done
  if [ -n "${holds}${placed}" ]; then
    printf '%s\n' "${holds}" > "${holds_file}" 2>/dev/null || true
  fi

  # Held packages stay out of the request. A held package with an update
  # waiting makes apt refuse everything named with it.
  local held wanted=""
  held="$(sudo apt-mark showhold 2>/dev/null | tr '\n' ' ')"
  for pkg in ${installed}; do
    case " ${held} " in
      *" ${pkg} "*) ;;
      *) wanted="${wanted} ${pkg}" ;;
    esac
  done
  wanted="${wanted# }"
  if [ -z "${wanted}" ]; then
    hs_write_system_packages_record "${installed}"
    return 0
  fi

  echo "Checking for newer versions of the display's programs..."
  if ! sudo timeout "${HS_APT_UPDATE_TIMEOUT:-60}" apt-get update -qq \
        -o DPkg::Lock::Timeout=60 -o Acquire::Retries=2 >/dev/null 2>&1; then
    echo "Could not reach the package archive; the display's programs stay as they are"
    hs_write_system_packages_record "${installed}"
    return 0
  fi

  # Say what is coming before the long quiet part. A Chromium update is well
  # over 100 MB and the download below prints nothing while it runs, so the
  # update window would otherwise sit on the line above for minutes. The dry
  # run is the same request as the install, so what it lists is what the
  # install will do; when it lists nothing the download and install are
  # skipped as the no-ops they would be.
  local plan="" plan_ok="false" newer="" size=""
  # shellcheck disable=SC2086
  if plan="$(sudo env LC_ALL=C timeout "${HS_APT_PLAN_TIMEOUT:-30}" \
        apt-get install --only-upgrade -y --print-uris -o DPkg::Lock::Timeout=60 \
        ${wanted} 2>/dev/null)"; then
    plan_ok="true"
    newer="$(printf '%s\n' "${plan}" \
      | awk '/^The following packages will be upgraded:/ { grab = 1; next } grab && /^  / { print; next } { grab = 0 }' \
      | tr -s ' \n' '  ')"
    newer="${newer# }"
    newer="${newer% }"
    # "Need to get 118 MB of archives." or "Need to get 0 B/118 MB of
    # archives." when part of it is already in apt's cache; the total is
    # what the wait is for.
    size="$(printf '%s\n' "${plan}" | sed -n 's/^Need to get \(.*\) of archives\..*/\1/p' | head -n 1)"
    size="${size##*/}"
  fi
  if [ "${plan_ok}" = "true" ] && [ -z "${newer}" ]; then
    echo "The display's programs are already up to date"
    hs_write_system_packages_record "${installed}"
    return 0
  fi
  if [ -n "${newer}" ]; then
    if [ -n "${size}" ]; then
      echo "Newer versions found: ${newer// /, } (${size})"
    else
      echo "Newer versions found: ${newer// /, }"
    fi
  fi
  echo "Downloading, this can take a few minutes on a slow connection..."

  local before after
  # shellcheck disable=SC2086
  before="$(hs_package_versions ${installed})"
  # shellcheck disable=SC2086
  if ! sudo timeout "${HS_APT_DOWNLOAD_TIMEOUT:-240}" \
        apt-get install --only-upgrade --download-only -y -qq -o DPkg::Lock::Timeout=60 \
        ${wanted} >/dev/null 2>&1; then
    echo "Still downloading newer versions of the display's programs; they install at the next update"
    hs_write_system_packages_record "${installed}"
    return 0
  fi
  echo "Installing the new versions..."
  # shellcheck disable=SC2086
  if ! sudo env DEBIAN_FRONTEND=noninteractive timeout "${HS_APT_UPGRADE_TIMEOUT:-180}" \
        apt-get install --only-upgrade -y -qq -o DPkg::Lock::Timeout=60 \
        -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
        ${wanted} >/dev/null 2>&1; then
    echo "Updating the display's programs did not finish; they stay as they are until the next update"
  fi
  # shellcheck disable=SC2086
  after="$(hs_package_versions ${installed})"
  HS_UPGRADED_PACKAGES="$(comm -13 <(printf '%s\n' "${before}" | sort) <(printf '%s\n' "${after}" | sort) | awk '{ print $1 }' | tr '\n' ' ')"
  HS_UPGRADED_PACKAGES="${HS_UPGRADED_PACKAGES% }"
  hs_write_system_packages_record "${installed}"
  if [ -n "${HS_UPGRADED_PACKAGES}" ]; then
    echo "Updated the display's programs: ${HS_UPGRADED_PACKAGES}"
  fi
  return 0
}

# hs_scheduled_install_owes_restart
# True while data/auto-update-state.json records a pending automatic install
# of this tree's version and data/restart-needed.json names a change the
# running kiosk session will not pick up (the names are those of
# RESTART_NEEDED_CHANGES in src/lib/restart-needed.ts; a test keeps the two
# lists the same). Read by `restart`; see there.
hs_scheduled_install_owes_restart() {
  local state="${APP_DIR}/data/auto-update-state.json" marker="${APP_DIR}/data/restart-needed.json" version
  [ -f "${state}" ] && [ -f "${marker}" ] || return 1
  command -v node >/dev/null 2>&1 || return 1
  version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "${APP_DIR}/package.json" 2>/dev/null | head -n 1)
  [ -n "${version}" ] || return 1
  HS_STATE="${state}" HS_MARKER="${marker}" HS_TAG="v${version}" node -e '
    const fs = require("fs");
    const needs = ["launcher", "bash-profile", "labwc-autostart", "legacy-kiosk", "session-packages"];
    let scheduled = false, owed = false;
    try {
      const state = JSON.parse(fs.readFileSync(process.env.HS_STATE, "utf8"));
      scheduled = !!state && state.result === "installed" && state.pending === true && state.tag === process.env.HS_TAG;
      const marker = JSON.parse(fs.readFileSync(process.env.HS_MARKER, "utf8"));
      owed = !!marker && Array.isArray(marker.changed) && marker.changed.some((c) => needs.includes(c));
    } catch {}
    process.exit(scheduled && owed ? 0 : 1);
  ' 2>/dev/null
}

# hs_record_restart_changes <comma-separated change names>
# Adds setup-system's changes to data/restart-needed.json for this boot, so the
# app can offer the restart some of them need (src/lib/restart-needed.ts
# decides which). Written here, from the release being installed, because an
# update runs the pipeline of the release it replaces, which may know nothing
# about this file. Only a kiosk session that is already running can be out of
# date, so the image build, first boot (it runs before autologin) and a fresh
# install record nothing. HS_BOOT_ID_PATH is a test seam, never set on a device.
hs_record_restart_changes() {
  [ "${HS_CHROOT:-0}" = "1" ] && return 0
  local boot_id_file="${HS_BOOT_ID_PATH:-/proc/sys/kernel/random/boot_id}"
  [ -r "${boot_id_file}" ] || return 0
  pgrep -u "${USER:-}" -x labwc >/dev/null 2>&1 || return 0
  HS_CHANGES="$1" HS_BOOT_ID_FILE="${boot_id_file}" \
  HS_MARKER="${APP_DIR}/data/restart-needed.json" HS_PACKAGE="${APP_DIR}/package.json" \
  node -e '
    const fs = require("fs");
    const bootId = fs.readFileSync(process.env.HS_BOOT_ID_FILE, "utf8").trim();
    if (!bootId) process.exit(0);
    const file = process.env.HS_MARKER;
    let earlier = [];
    try {
      const old = JSON.parse(fs.readFileSync(file, "utf8"));
      if (old && old.bootId === bootId && Array.isArray(old.changed)) earlier = old.changed;
    } catch {}
    let version = null;
    try { version = JSON.parse(fs.readFileSync(process.env.HS_PACKAGE, "utf8")).version || null; } catch {}
    const changed = [...new Set([...earlier, ...process.env.HS_CHANGES.split(",").filter(Boolean)])];
    fs.mkdirSync(require("path").dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify({ bootId, changed, version, at: new Date().toISOString() }, null, 2) + "\n");
    fs.renameSync(file + ".tmp", file);
  ' 2>/dev/null || true
}

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

    # Check network connectivity to GitHub (or the rig standing in for it)
    if ! curl -fsSL --head --max-time 10 "${HS_GITHUB_DOWNLOAD_BASE:-https://github.com}" >/dev/null 2>&1; then
      errors="${errors}Cannot reach GitHub (check network connectivity). "
    fi

    # Check passwordless sudo (needed for restart and setup-system). The
    # check repairs the grant itself when the image default password still
    # works; otherwise the flag tells the editor to ask for the password.
    needs_sudo_password="false"
    if ! hs_sudo_check; then
      needs_sudo_password="true"
      errors="${errors}${HS_SUDO_NEEDS_PASSWORD_MSG} "
    fi

    # Report a runtime mismatch; tarball deployment provisions the target major.
    node_warning=""
    if [ -f "${APP_DIR}/.node-version" ]; then
      expected_major=$(cat "${APP_DIR}/.node-version" | tr -d '[:space:]')
      actual_major=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
      if [ -n "${expected_major}" ] && [ -n "${actual_major}" ] && [ "${actual_major}" != "${expected_major}" ]; then
        if [ -f "${APP_DIR}/server.js" ]; then
          node_warning="Node.js v${actual_major} detected; the system runtime will be set to v${expected_major} before restart, which also affects other Node applications"
        else
          node_warning="Node.js v${actual_major} detected (v${expected_major} recommended for source builds)"
        fi
      fi
    fi

    if [ -n "${errors}" ]; then
      echo "{\"ok\":false,\"error\":\"${errors}\",\"needsSudoPassword\":${needs_sudo_password}}"
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

  sudo-check)
    if hs_sudo_check; then
      echo '{"ok":true}'
    else
      echo "{\"ok\":false,\"needsPassword\":true,\"error\":\"${HS_SUDO_NEEDS_PASSWORD_MSG}\"}"
    fi
    ;;

  grant-sudo)
    # One password line on stdin. Never passed as an argument.
    IFS= read -r password || password=""
    if [ -z "${password}" ]; then
      echo '{"ok":false,"error":"Enter the password for this device."}'
      exit 0
    fi
    if hs_sudo_ready; then
      echo '{"ok":true,"alreadyGranted":true}'
      exit 0
    fi
    if ! printf '%s\n' "${password}" | sudo -S -k -p '' true 2>/dev/null; then
      echo '{"ok":false,"wrongPassword":true,"error":"That password did not work."}'
      exit 0
    fi
    if printf '%s\n' "${password}" | hs_write_sudo_grant; then
      echo '{"ok":true}'
    else
      echo '{"ok":false,"error":"The password worked, but the change could not be saved. Check that sudo and visudo are installed on this device."}'
    fi
    ;;

  backup)
    # Optional: the tag about to be installed. When a release build is about
    # to be replaced by an early-access or test build, the current config is
    # also pinned as LAST_STABLE_BACKUP, which the rotation below never
    # touches. Test builds carry unreleased settings migrations, and the
    # rotating snapshots age out inside a week of daily installs, so this is
    # the copy a release build is guaranteed to be able to read.
    target_tag="${1:-}"
    mkdir -p "${BACKUP_DIR}"
    if [ -f "${CONFIG_FILE}" ]; then
      # UTC, like the migration backups the app writes. The name is only a
      # unique, sortable label: the OS zone is UTC on the shipped image and
      # unrelated to the household's, so a local-looking time in it read as
      # the wrong hour. The editor shows each backup's time from the
      # `modified` field of list-backups, in the household's zone.
      timestamp=$(date -u +%Y%m%d-%H%M%S)
      # node may be off PATH under systemd; the sed fallback reads the same
      # field without it, and an unreadable file yields "unknown".
      version=$(node -p "require('./package.json').version" 2>/dev/null \
        || sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' package.json 2>/dev/null | head -n 1 \
        || true)
      [ -n "${version}" ] || version="unknown"
      backup_name="config-v${version}-${timestamp}.json"
      cp "${CONFIG_FILE}" "${BACKUP_DIR}/${backup_name}"

      # Pin only when the running version is provably a release build
      # (X.Y.Z, no suffix). Anything else, "unknown" included, must not
      # overwrite the pin: a test build whose version could not be read is
      # still a test build, and its config is the one the pin exists to
      # protect against.
      pinned=false
      if [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        case "${target_tag}" in
          *-*)
            cp "${CONFIG_FILE}" "${BACKUP_DIR}/${LAST_STABLE_BACKUP}"
            pinned=true
            ;;
        esac
      fi

      # Rotate ordinary upgrade snapshots only. Migration originals and the
      # last-stable pin must remain available for recovery indefinitely.
      # shellcheck disable=SC2012
      ls -1t "${BACKUP_DIR}"/config-*.json 2>/dev/null \
        | awk '!/[.-]migration\.[0-9]+\.[a-f0-9]{32}-[0-9]{8}-[0-9]{6}\.json$/' \
        | tail -n +$(( MAX_BACKUPS + 1 )) \
        | while IFS= read -r obsolete; do rm -f -- "$obsolete"; done

      echo "{\"ok\":true,\"file\":\"${backup_name}\",\"pinnedStable\":${pinned}}"
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
    # HS_GITHUB_DOWNLOAD_BASE lets a test rig serve releases to a real
    # device; the app's version check honours HS_GITHUB_API_BASE the same way.
    download_base="${HS_GITHUB_DOWNLOAD_BASE:-https://github.com}"
    download_url="${download_base}/${repo}/releases/download/${tag}/${asset_name}"

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
    checksum_url="${download_base}/${repo}/releases/download/${tag}/${checksum_name}"
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

  prepare-deploy)
    staging_dir="${APP_DIR}.staging"
    if [ ! -d "${staging_dir}" ]; then
      echo '{"ok":false,"error":"No staged upgrade found"}'
      exit 1
    fi
    # A tree finalize-deploy set aside after a failed start is kept for
    # diagnosis until the next attempt, which is now.
    rm -rf "${APP_DIR}.failed"
    echo '{"ok":true}'
    ;;

  deploy)
    staging_dir="${APP_DIR}.staging"
    if [ ! -d "${staging_dir}" ]; then
      echo '{"ok":false,"error":"No staged upgrade found"}'
      exit 1
    fi

    # A manual deploy has to be sure the app is not running before it replaces
    # the tree underneath it; the web path has already stopped it.
    case "${1:-}" in
      --runtime-ready) ;; # the app arranged this and is no longer writing
      '')
        # Manual upgrades must stop the service; the web workflow holds its
        # coordinator instead. Keep that check before any runtime change.
        if command -v systemctl &>/dev/null && systemctl is-active --quiet "${SERVICE_NAME}"; then
          echo '{"ok":false,"error":"Stop home-screens with sudo systemctl stop home-screens before a manual deploy."}'
          exit 1
        fi
        # Nothing else is needed to keep writers apart: the app is a single
        # process that serializes its own writes, and the check above is what
        # stops this one running alongside it. The offline restore refuses for
        # the same reason. A power cut partway through is a different problem,
        # and the journal the app recovers on startup covers that.
        ;;

      *) echo '{"ok":false,"error":"Unknown deploy option"}'; exit 1 ;;
    esac

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

  finalize-deploy)
    # Wait for the new server to become healthy after a deploy + restart,
    # then clean up the rollback directory. Designed to run as a detached
    # background job spawned from `restart`, because the orchestrating
    # process is killed by the systemd restart and cannot run cleanup
    # itself. When the new release never answers, the previous tree is
    # put back and restarted, and a marker names the version that did not
    # take so the System page can say so.
    #
    # This runs from the NEW tree's copy of the script (APP_DIR is the new
    # tree after the swap), which is what makes it a safety net for devices
    # whose old code could not have known better: a release that refuses
    # to start on data it cannot read still lands the device back where
    # it was, with that data untouched.
    #
    # The probe is GET /api/health, which needs no login, is exempt from the
    # IP allowlist, and answers 200 only once the app is routing requests.
    # A 401 or 403 from a guarded route used to count as healthy here; a
    # release that answered 500 on every request did too, and lost its
    # rollback tree. A release that must not run on the data it finds still
    # has to exit rather than serve errors, since the route itself never
    # fails.
    port="${1:-${PORT:-3000}}"
    rollback_dir="${APP_DIR}.rollback"
    if [ ! -d "${rollback_dir}" ]; then
      echo '{"ok":true,"healthy":true,"rollback":"absent"}'
      exit 0
    fi
    attempt=0
    max_attempts="${HS_FINALIZE_ATTEMPTS:-45}"  # 45 * 2s = 90s
    while [ "${attempt}" -lt "${max_attempts}" ]; do
      # %{http_code} is "000" when curl can't connect at all. curl prints
      # 000 and ALSO exits non-zero then, so an `|| echo 000` fallback used
      # to yield "000000", which is not "000", and a dead server passed as
      # healthy. Only an exact 200 counts.
      http_code=$(curl -s -o /dev/null --max-time 5 -w "%{http_code}" \
        "http://localhost:${port}/api/health" 2>/dev/null || true)
      if [ "${http_code}" = "200" ]; then
        rm -rf "${rollback_dir}" 2>/dev/null || true
        echo "{\"ok\":true,\"healthy\":true,\"attempts\":${attempt},\"status\":${http_code}}"
        exit 0
      fi
      sleep "${HS_FINALIZE_SLEEP:-2}"
      attempt=$(( attempt + 1 ))
    done

    # The new release never answered. Put the previous tree back. The
    # rollback tree still holds the data as it was copied before the swap,
    # which already includes the old tree's own migrate-step writes, so
    # nothing the device had is lost; only whatever the new tree wrote in
    # the seconds it lived, and it never became a version anyone used.
    failed_dir="${APP_DIR}.failed"
    failed_version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "${APP_DIR}/package.json" 2>/dev/null | head -n 1)
    [ -n "${failed_version}" ] || failed_version="unknown"
    echo "New release v${failed_version} did not become healthy within ${max_attempts} attempts; going back to the previous version" >&2
    sudo systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
    rm -rf "${failed_dir}"
    # Two renames, same filesystem. If the process dies between them the
    # unit's ExecStartPre restores APP_DIR from .rollback on the next start.
    mv "${APP_DIR}" "${failed_dir}"
    mv "${rollback_dir}" "${APP_DIR}"
    mkdir -p "${APP_DIR}/data" 2>/dev/null || true
    printf '{"tag":"v%s","reason":"did-not-start","at":"%s"}\n' \
      "${failed_version}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${APP_DIR}/data/upgrade-failed.json"
    sudo systemctl start "${SERVICE_NAME}" 2>/dev/null || true
    echo "{\"ok\":false,\"rolledBack\":true,\"failedVersion\":\"${failed_version}\",\"error\":\"New release did not become healthy; the previous version was put back and the failed tree kept at ${failed_dir}\"}"
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

  ensure-runtime)
    # .npmrc ships engine-strict=true, so a Node or npm below the engines
    # floor hard-fails every install. Called by deploy.sh before installing
    # deps. Node goes first: a NodeSource install ships its own npm and
    # would undo the floor if npm were raised beforehand.
    if [ -f "${APP_DIR}/.node-version" ]; then
      node_major=$(tr -d '[:space:]' < "${APP_DIR}/.node-version")
      [ -n "${node_major}" ] && install_node "${node_major}" 2>&1
    fi
    ensure_npm_floor "${APP_DIR}" 2>&1
    echo "{\"ok\":true}"
    ;;

  install)
    # Raise Node, then npm, to what package.json declares. Nothing else in this
    # legacy path provisions either, so without this an install stranded on an
    # older Node fails the engine check instead of being repaired.
    # Node goes first: a NodeSource install ships its own npm and would undo
    # the floor if npm were raised beforehand.
    # (Both guarded: common.sh may be absent on very old checkouts this legacy
    # path upgrades from.)
    if [ -f "${APP_DIR}/.node-version" ] && type -t install_node >/dev/null; then
      node_major=$(tr -d '[:space:]' < "${APP_DIR}/.node-version")
      [ -n "${node_major}" ] && install_node "${node_major}" 2>&1
    fi
    type -t ensure_npm_floor >/dev/null && ensure_npm_floor "${APP_DIR}" 2>&1
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
    #
    # --restart-kiosk: once the new release answers, end the kiosk session as
    # well (Chromium exits, labwc with it, and the autologin cycle starts both
    # again from the new launcher and packages), and drop the "restart to
    # finish" note, since a fresh session has read everything it covers. The
    # scheduled install passes it when setup-system reported such a change:
    # nobody is up to tap Restart now at four in the morning, and a Chromium
    # whose files were replaced under it should not run until someone is.
    # The device itself is never restarted.
    restart_kiosk="false"
    [ "${1:-}" = "--restart-kiosk" ] && restart_kiosk="true"
    # The flag comes from a server that knows it, this release on. The server
    # that installs this release is the previous one and passes nothing, so
    # the same decision is also made from what is on disk: the automatic
    # update's record says an install of this very version is in flight, and
    # setup-system left a change only a fresh kiosk session picks up.
    if [ "${restart_kiosk}" = "false" ] && hs_scheduled_install_owes_restart; then
      restart_kiosk="true"
    fi
    if command -v systemctl &>/dev/null && systemctl is-active "${SERVICE_NAME}" &>/dev/null; then
      # Read port now so the detached job doesn't depend on the orchestrating
      # process's environment after restart. Wrap cat||echo in braces so the
      # fallback applies to the whole subshell, not just the trailing tr.
      finalize_port=$( { cat "${APP_DIR}/data/port.conf" 2>/dev/null || echo 3000; } | tr -d '[:space:]' )
      finalize_log="${APP_DIR}/data/upgrade-finalize.log"
      mkdir -p "$(dirname "${finalize_log}")" 2>/dev/null || true
      # A job that restarts the service, checks systemd really replaced the
      # process, then hands over to finalize-deploy, which drops the rollback
      # once the new release answers or puts the old tree back when it never
      # does. Only an unchanged MainPID aborts: that means no restart
      # happened and the old process is still the one running, so nothing
      # may be finalized either way. A service that is crash-looping or
      # failed after the restart is exactly what finalize-deploy is for, so
      # it must not be filtered out here.
      # The job is a file, not a command-line string: systemd expands
      # ${VAR} in the command line of a unit it launches, so an inline
      # script's own variables reach bash already emptied. The transient
      # unit's bash opens the file before the restart; a later rename of
      # the tree does not disturb an open script.
      finalize_job="${APP_DIR}/data/upgrade-finalize-job.sh"
      cat > "${finalize_job}" <<EOF_JOB
exec > '${finalize_log}' 2>&1
sleep 3
old_pid=\$(systemctl show -p MainPID --value ${SERVICE_NAME} 2>/dev/null || echo 0)
sudo systemctl restart ${SERVICE_NAME} || true
# Give systemd time to spawn the replacement process
sleep 5
new_pid=\$(systemctl show -p MainPID --value ${SERVICE_NAME} 2>/dev/null || echo 0)
if [ "\${new_pid}" != "0" ] && [ "\${new_pid}" = "\${old_pid}" ]; then
  echo "Restart did not produce a new MainPID (old=\${old_pid}, new=\${new_pid}); aborting finalize to preserve rollback" >&2
  exit 1
fi
bash '${APP_DIR}/scripts/upgrade.sh' finalize-deploy '${finalize_port}'
finalize_rc=\$?
if [ "\${finalize_rc}" -eq 0 ] && [ '${restart_kiosk}' = 'true' ]; then
  echo "Restarting the kiosk session to finish the scheduled update"
  rm -f '${APP_DIR}/data/restart-needed.json'
  pkill -TERM chromium 2>/dev/null || true
fi
exit "\${finalize_rc}"
EOF_JOB
      # The job cannot be a child of this process: the service's cgroup is
      # SIGKILLed once its main process stops (KillMode=mixed), and neither
      # nohup nor setsid leaves the cgroup. On a real Pi the old detached
      # child died at the restart every time, which is why rollback trees
      # were never cleaned up. A transient unit of its own outlives the
      # restart it triggers. The nohup form stays as the fallback for a
      # host without systemd-run.
      if command -v systemd-run &>/dev/null \
        && sudo -n systemd-run --quiet --collect \
             --unit="${SERVICE_NAME}-finalize-$(date +%s)" \
             --property="User=$(id -un)" \
             bash "${finalize_job}" 2>/dev/null; then
        :
      else
        nohup setsid bash "${finalize_job}" > /dev/null 2>&1 < /dev/null &
        disown 2>/dev/null || true
      fi
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
      # Detect whether dbus-run-session is needed at runtime rather than
      # relying solely on kiosk.conf — self-healing if the config is missing.
      NEED_DBUS=false
      if [ "${PI_VARIANT}" = "lite" ] || [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
        command -v dbus-run-session &>/dev/null && NEED_DBUS=true
      fi

      # Flags come from lib/common.sh, which is sourced conditionally at the
      # top of this script. The literal fallback below keeps a relaunch from
      # coming back as a bare, non-kiosk browser window when this script runs
      # without lib/ beside it; scripts/__tests__/chromium-flags.test.ts fails
      # if it drifts from common.sh.
      if [ -n "${CHROMIUM_KIOSK_FLAGS+x}" ]; then
        RELAUNCH_FLAGS=("${CHROMIUM_KIOSK_FLAGS[@]}" "${CHROMIUM_KIOSK_PI_FLAGS[@]}")
      else
        RELAUNCH_FLAGS=(
          --noerrdialogs
          --disable-infobars
          --no-first-run
          --disable-session-crashed-bubble
          --autoplay-policy=no-user-gesture-required
          --overscroll-history-navigation=0
          --remote-debugging-port=9222
          --ignore-gpu-blocklist
          --enable-zero-copy
          --num-raster-threads=2
          --force-gpu-mem-available-mb=256
          --kiosk
          --check-for-update-interval=31536000
          --password-store=basic
          --ozone-platform=wayland
        )
      fi

      # One invocation; dbus-run-session is a prefix, not a second copy.
      if [ "${NEED_DBUS}" = true ]; then
        DBUS_PREFIX=(dbus-run-session --)
      else
        DBUS_PREFIX=()
      fi

      WAYLAND_DISPLAY="${WAYLAND_DISPLAY}" XDG_RUNTIME_DIR="/run/user/$(id -u)" \
        nohup "${DBUS_PREFIX[@]}" chromium --app=http://localhost:${PORT}/display \
          "${RELAUNCH_FLAGS[@]}" \
          > /dev/null 2>&1 &
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
    # Wait for GET /api/health to answer 200: the app is up and routing
    # requests. The route needs no login and ignores the IP allowlist, so
    # this works from the Pi's own loopback address on every install. The
    # answer carries the version, which the JSON below passes on.
    port="${1:-${PORT}}"
    max_attempts="${HS_HEALTH_ATTEMPTS:-30}"
    attempt=0
    while [ "${attempt}" -lt "${max_attempts}" ]; do
      body=$(curl -s --max-time 5 -w '\n%{http_code}' \
        "http://localhost:${port}/api/health" 2>/dev/null || true)
      http_code="${body##*$'\n'}"
      if [ "${http_code}" = "200" ]; then
        version=$(printf '%s' "${body%$'\n'*}" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')
        echo "{\"ok\":true,\"attempts\":${attempt},\"status\":200,\"version\":\"${version}\"}"
        exit 0
      fi
      sleep "${HS_HEALTH_SLEEP:-2}"
      attempt=$(( attempt + 1 ))
    done
    echo "{\"ok\":false,\"error\":\"Server did not respond within 60 seconds\"}"
    exit 1
    ;;

  list-backups)
    mkdir -p "${BACKUP_DIR}"
    files="["
    first=true
    # The pinned pre-prerelease copy lists first when present, then the
    # rotating snapshots newest first.
    # shellcheck disable=SC2012
    # One path per line, so an install directory with a space in it still lists.
    while IFS= read -r f; do
      name=$(basename "$f")
      size=$(wc -c < "$f" | tr -d ' ')
      # A real instant (UTC, with the Z), so the editor can show it in the
      # household's zone. Without an offset it read as the OS zone's time.
      # GNU and BSD date both take `-r <file>`.
      modified=$(date -u -r "$f" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
      if [ "$first" = true ]; then
        first=false
      else
        files="${files},"
      fi
      files="${files}{\"name\":\"${name}\",\"size\":${size},\"modified\":\"${modified}\"}"
    done < <(ls -1 "${BACKUP_DIR}/${LAST_STABLE_BACKUP}" 2>/dev/null || true
             ls -1t "${BACKUP_DIR}"/config-*.json 2>/dev/null || true)
    files="${files}]"
    echo "${files}"
    ;;

  setup-system)
    # Idempotent system-level configuration for the kiosk, as the step
    # functions of lib/setup-system.sh. Safe to run on every deploy and
    # upgrade: each step only changes what is not already as it should be.
    # The helpers above (hs_daemon_reload, hs_launcher_changed,
    # hs_record_restart_changes and the package ones) are part of it.
    source "${SCRIPT_DIR}/lib/setup-system.sh"
    hs_setup_system
    ;;

  *)
    echo "{\"ok\":false,\"error\":\"Unknown action: ${action}\"}"
    exit 1
    ;;
esac
