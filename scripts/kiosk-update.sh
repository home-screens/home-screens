#!/usr/bin/env bash
# Home Screens spoke self-update.
#
# A display-only Pi renders the hub's web app, so the app itself updates for
# free. Its *shell layer* — kiosk launcher, splash page, reporter, systemd
# units — is laid down once at install time and then fossilizes. This script
# is what un-fossilizes it: it asks the hub what version of the shell layer
# the hub is running, and if that differs from what's on disk, it downloads
# and swaps it in.
#
# Design: spokes follow the hub, zero-touch. There is no version picker and no
# "update now" button — the user updates the hub, every spoke notices. The
# bundle is carved from the hub's own running tree, so there is never a
# compatibility matrix between launcher and hub.
#
# Configuration comes entirely from data/kiosk.conf (BACKEND_URL, DISPLAY_ID),
# written by install.sh from the user's install answers. Nothing in kiosk.conf
# is ever modified by this script — it is config, not code.
#
# Usage:
#   kiosk-update.sh [--timeout <seconds>] [--restart-if-advised]
#
#   --restart-if-advised   After applying, restart Chromium *only* if the hub
#                          says now is a good time (display asleep, or the
#                          small hours). Used by the nightly timer. The
#                          launcher-run path omits it: it is already
#                          restarting by definition.
#
# Exit codes:
#   0   nothing to do (already current), or a soft failure we chose to ride out
#   10  an update was applied
#   1   a hard error (bad config, missing tools)
#
# Failure mode is always "keep running what we have". A hub that is down, a
# truncated download, a corrupt tarball, or a syntax error in a new script all
# leave the existing files untouched — exactly today's behavior.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KIOSK_CONF="${APP_DIR}/data/kiosk.conf"
STAMP_FILE="${APP_DIR}/data/kiosk-bundle.version"
STAGING_ROOT="${APP_DIR}/data/kiosk-update-staging"
# The privileged helper reads from this exact path and no other — see
# kiosk-update-privileged.sh and the sudoers drop-in.
SYSTEM_STAGING="${STAGING_ROOT}/system"
PREV_DIR="${APP_DIR}/scripts/.prev"
PRIV_HELPER="/usr/local/lib/home-screens/kiosk-update-privileged.sh"
LOCK_DIR="${APP_DIR}/data/.kiosk-update.lock"

TIMEOUT=20
RESTART_IF_ADVISED="false"
while [ $# -gt 0 ]; do
  case "$1" in
    --timeout)
      TIMEOUT="${2:-20}"; shift 2 ;;
    --restart-if-advised)
      RESTART_IF_ADVISED="true"; shift ;;
    *)
      echo "kiosk-update: unknown option $1" >&2; exit 1 ;;
  esac
done

log() {
  # journald is the durable record; stderr is for the launcher's console.
  logger -t home-screens-kiosk-update "$*" 2>/dev/null || true
  echo "[kiosk-update] $*" >&2
}

# --- Config -----------------------------------------------------------------
BACKEND_URL=""
DISPLAY_ID=""
# shellcheck disable=SC1090
[ -f "${KIOSK_CONF}" ] && source "${KIOSK_CONF}"

if [ -z "${BACKEND_URL}" ] || [ -z "${DISPLAY_ID}" ]; then
  log "no BACKEND_URL/DISPLAY_ID in ${KIOSK_CONF} — not a managed spoke, skipping"
  exit 0
fi
BACKEND_URL="${BACKEND_URL%/}"

for tool in curl jq tar sha256sum; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    log "required tool '${tool}' is missing — skipping update"
    exit 0
  fi
done

BUNDLE_URL="${BACKEND_URL}/api/display/kiosk-bundle?display=${DISPLAY_ID}"

# --- Single-runner lock -----------------------------------------------------
# The nightly timer and the launcher-run check can genuinely overlap: the timer
# is Persistent=true, so a Pi powered on mid-morning runs a catch-up tick, and
# a Chromium restart moments later runs the launcher check. Both stage into the
# same fixed directory (the privileged helper only reads one path), so without
# a lock one run's cleanup can delete files out from under the other's helper
# mid-install, leaving the system half partly applied.
#
# mkdir is atomic on every POSIX filesystem, so it needs no flock dependency.
acquire_lock() {
  if mkdir "${LOCK_DIR}" 2>/dev/null; then return 0; fi
  # A lock left behind by a killed run would otherwise block updates forever.
  # The longest legitimate run is a small download plus a file swap, so
  # anything this old is debris.
  if [ -n "$(find "${LOCK_DIR}" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
    rmdir "${LOCK_DIR}" 2>/dev/null || true
    mkdir "${LOCK_DIR}" 2>/dev/null && return 0
  fi
  return 1
}

if ! acquire_lock; then
  log "another update is already running — skipping this check"
  exit 0
fi

# One EXIT trap for the whole script: bash keeps only the most recently
# installed one, so a second `trap ... EXIT` further down would silently
# discard the lock release.
WORK=""
cleanup() {
  [ -n "${WORK}" ] && rm -rf "${WORK}"
  rmdir "${LOCK_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

# --- 1. Manifest ------------------------------------------------------------
# A 403 here means "not adopted on the hub yet" and a connection error means
# "hub is down". Both are ordinary states for a spoke, not faults — stay quiet
# and try again on the next tick, same as the reporter does.
MANIFEST="$(curl -fsS --max-time "${TIMEOUT}" "${BUNDLE_URL}&manifest=1" 2>/dev/null || true)"
if [ -z "${MANIFEST}" ]; then
  exit 0
fi

REMOTE_VERSION="$(printf '%s' "${MANIFEST}" | jq -r '.version // empty' 2>/dev/null || true)"
REMOTE_SHA="$(printf '%s' "${MANIFEST}" | jq -r '.sha256 // empty' 2>/dev/null || true)"
RESTART_ADVISED="$(printf '%s' "${MANIFEST}" | jq -r '.restartAdvised // false' 2>/dev/null || echo false)"

if [ -z "${REMOTE_VERSION}" ] || [ -z "${REMOTE_SHA}" ]; then
  log "hub returned an unreadable manifest — skipping"
  exit 0
fi

LOCAL_VERSION=""
[ -r "${STAMP_FILE}" ] && LOCAL_VERSION="$(head -c 128 "${STAMP_FILE}" | tr -d '[:space:]')"

if [ "${REMOTE_VERSION}" = "${LOCAL_VERSION}" ]; then
  exit 0
fi

log "hub is on ${REMOTE_VERSION}, this display has ${LOCAL_VERSION:-none} — updating"

# --- 2. Download + verify ---------------------------------------------------
WORK="$(mktemp -d "${TMPDIR:-/tmp}/hs-kiosk-update.XXXXXX")"

TARBALL="${WORK}/bundle.tar.gz"
if ! curl -fsS --max-time $((TIMEOUT * 3)) -o "${TARBALL}" "${BUNDLE_URL}" 2>/dev/null; then
  log "bundle download failed — keeping current files"
  exit 0
fi

ACTUAL_SHA="$(sha256sum "${TARBALL}" | cut -d' ' -f1)"
if [ "${ACTUAL_SHA}" != "${REMOTE_SHA}" ]; then
  log "checksum mismatch (expected ${REMOTE_SHA}, got ${ACTUAL_SHA}) — keeping current files"
  exit 0
fi

# Reject absolute paths and traversal before extracting. The hub is trusted,
# but "trusted" and "unchecked" are different things, and this costs one pass.
if tar -tzf "${TARBALL}" 2>/dev/null | grep -qE '^/|(^|/)\.\.(/|$)'; then
  log "bundle contains unsafe paths — refusing to extract"
  exit 0
fi

EXTRACT="${WORK}/payload"
mkdir -p "${EXTRACT}"
if ! tar -xzf "${TARBALL}" -C "${EXTRACT}" 2>/dev/null; then
  log "bundle extraction failed — keeping current files"
  exit 0
fi

# --- 3. Validate ------------------------------------------------------------
# Every shell script must parse before any of them is allowed near the live
# tree. This is the gate that makes "swap in a broken launcher" essentially
# impossible, which is why there is no automatic rollback below it.
while IFS= read -r script; do
  if ! bash -n "${script}" 2>/dev/null; then
    log "syntax check failed for $(basename "${script}") — keeping current files"
    exit 0
  fi
done < <(find "${EXTRACT}" -name '*.sh' -type f)

if [ ! -f "${EXTRACT}/kiosk-launcher-display.sh" ]; then
  log "bundle is missing kiosk-launcher-display.sh — keeping current files"
  exit 0
fi

# --- 4. Swap ----------------------------------------------------------------
mkdir -p "${PREV_DIR}" "${APP_DIR}/share"

# Move (never copy) so the swap is a rename: any process currently reading an
# old script keeps its inode and finishes cleanly. This is also what lets this
# script replace itself while running.
install_file() {
  local src="$1" dest="$2" mode="$3"
  if [ -f "${dest}" ]; then
    mv -f "${dest}" "${PREV_DIR}/$(basename "${dest}")"
  fi
  chmod "${mode}" "${src}"
  mv -f "${src}" "${dest}"
}

# "<name in bundle>|<name on disk>". The launcher lands as kiosk-launcher.sh
# because that path is what ~/.bash_profile execs on every Pi in the field.
for entry in \
  "rotate-display.sh|rotate-display.sh" \
  "kiosk-update-install.sh|kiosk-update-install.sh" \
  "kiosk-launcher-display.sh|kiosk-launcher.sh"
do
  IFS='|' read -r from to <<< "${entry}"
  [ -f "${EXTRACT}/${from}" ] || continue
  install_file "${EXTRACT}/${from}" "${APP_DIR}/scripts/${to}" 0755
done

if [ -f "${EXTRACT}/share/connecting.html" ]; then
  install_file "${EXTRACT}/share/connecting.html" "${APP_DIR}/share/connecting.html" 0644
fi

# Root-owned destinations (/usr/local/bin, /etc/systemd/system). Stage them at
# the one fixed path the sudoers drop-in allows, then hand off.
#
# The two failure modes are deliberately treated differently, because only one
# of them is worth retrying:
#
#   helper present but failed → transient (sudo hiccup, full disk, a race).
#     Don't stamp; the next check retries and the display heals itself.
#   helper missing entirely   → the machinery was never fully installed, and
#     no amount of retrying will conjure it. Stamp anyway and warn loudly:
#     looping forever would re-download and re-swap on every boot and every
#     nightly tick while the editor showed "getting ready" indefinitely.
#     Neither install.sh nor the bootstrap can leave a Pi in this state.
SYSTEM_RETRYABLE_FAILURE="false"
if [ -d "${EXTRACT}/system" ]; then
  rm -rf "${SYSTEM_STAGING}"
  mkdir -p "${SYSTEM_STAGING}"
  cp -a "${EXTRACT}/system/." "${SYSTEM_STAGING}/"
  if [ ! -x "${PRIV_HELPER}" ]; then
    log "no privileged helper at ${PRIV_HELPER} — reporter and timers were not updated;" \
        "re-run the display setup command from the hub to repair this"
  elif ! sudo -n "${PRIV_HELPER}" 2>/dev/null; then
    SYSTEM_RETRYABLE_FAILURE="true"
    log "privileged helper failed — reporter and timers left at their current versions"
  fi
  rm -rf "${SYSTEM_STAGING}"
fi

# Self-replacement goes last and is never exec'd: the new updater takes effect
# on the next invocation, so a bad-but-parseable updater can't take down the
# run that installed it.
if [ -f "${EXTRACT}/kiosk-update.sh" ]; then
  install_file "${EXTRACT}/kiosk-update.sh" "${APP_DIR}/scripts/kiosk-update.sh" 0755
fi

# The stamp is the record of "this display is fully on version X", and every
# later run short-circuits on it. Advancing it after a partial apply would
# strand the reporter and the systemd units at their old versions until the
# hub happened to ship a *different* version — a shipped reporter fix would
# silently never arrive. So a partial apply leaves the stamp alone and the
# next tick retries; the user-space files that did land stay landed, and
# re-applying them is harmless.
if [ "${SYSTEM_RETRYABLE_FAILURE}" = "true" ]; then
  log "display software partly updated to ${REMOTE_VERSION} — will retry at the next check"
else
  printf '%s\n' "${REMOTE_VERSION}" > "${STAMP_FILE}"
  log "display software updated to ${REMOTE_VERSION}"
fi

# --- 5. Restart policy ------------------------------------------------------
# New files on disk don't reach the screen until Chromium restarts. The
# launcher-run path handles that itself by re-execing. The nightly timer has
# to be careful: nobody wants the family display to black-flash mid-evening,
# so the hub decides when a restart is welcome and we just obey.
if [ "${RESTART_IF_ADVISED}" = "true" ]; then
  if [ "${RESTART_ADVISED}" = "true" ]; then
    log "restarting the kiosk to pick up the update"
    pkill -TERM chromium 2>/dev/null || true
  else
    log "display is in use — the update applies at the next natural restart"
  fi
fi

exit 10
