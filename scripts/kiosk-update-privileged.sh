#!/usr/bin/env bash
# Root half of the spoke self-update. Installed to a root-owned fixed path
# (/usr/local/lib/home-screens/kiosk-update-privileged.sh) and invoked by the
# unprivileged updater through a narrow sudoers drop-in:
#
#   <user> ALL=(root) NOPASSWD: /usr/local/lib/home-screens/kiosk-update-privileged.sh
#
# It takes NO arguments — deliberately. Everything it installs comes from one
# hard-coded staging directory, and it copies exactly the filenames listed in
# SYSTEM_FILES below to exactly the destinations listed there. There is no
# path the caller can influence, so the sudoers grant stays a grant to do one
# specific job rather than a general "copy any file as root" primitive.
#
# (An honest note on the trust boundary: the staged contents are written by
# the kiosk user, so this is not a defense against a compromised kiosk
# account — on a single-purpose Pi that account is the whole machine. What it
# does buy is that a bug in the updater cannot scribble on arbitrary root
# paths, and that the sudoers line reads as a single reviewable capability.)
set -euo pipefail

STAGING="/opt/home-screens/current/data/kiosk-update-staging/system"
SELF="/usr/local/lib/home-screens/kiosk-update-privileged.sh"

log() {
  logger -t home-screens-kiosk-update "privileged: $*" 2>/dev/null || true
}

if [ ! -d "${STAGING}" ]; then
  log "no staging directory — nothing to do"
  exit 0
fi

# "<staged filename>|<destination>|<mode>"
SYSTEM_FILES=(
  "reporter.sh|/usr/local/bin/home-screens-reporter.sh|0755"
  "home-screens-reporter.service|/etc/systemd/system/home-screens-reporter.service|0644"
  "home-screens-reporter.timer|/etc/systemd/system/home-screens-reporter.timer|0644"
  "home-screens-kiosk-update.service|/etc/systemd/system/home-screens-kiosk-update.service|0644"
  "home-screens-kiosk-update.timer|/etc/systemd/system/home-screens-kiosk-update.timer|0644"
)

UNITS_CHANGED="false"

for entry in "${SYSTEM_FILES[@]}"; do
  IFS='|' read -r name dest mode <<< "${entry}"
  src="${STAGING}/${name}"
  [ -f "${src}" ] || continue
  # Skip unchanged files so a routine no-op update doesn't churn systemd.
  if [ -f "${dest}" ] && cmp -s "${src}" "${dest}"; then
    continue
  fi
  install -m "${mode}" -o root -g root "${src}" "${dest}"
  log "installed ${dest}"
  case "${dest}" in
    /etc/systemd/system/*) UNITS_CHANGED="true" ;;
  esac
done

if [ "${UNITS_CHANGED}" = "true" ]; then
  systemctl daemon-reload
  # try-restart is a no-op for a timer that isn't running, so this never
  # starts something the user disabled — it only re-arms what is already on.
  systemctl try-restart home-screens-reporter.timer 2>/dev/null || true
  systemctl try-restart home-screens-kiosk-update.timer 2>/dev/null || true
fi

# Replace ourselves last, and by rename rather than in-place write: the
# running bash keeps reading the old inode and finishes this script cleanly.
NEW_SELF="${STAGING}/kiosk-update-privileged.sh"
if [ -f "${NEW_SELF}" ] && ! cmp -s "${NEW_SELF}" "${SELF}"; then
  install -m 0755 -o root -g root "${NEW_SELF}" "${SELF}.new"
  mv -f "${SELF}.new" "${SELF}"
  log "installed ${SELF}"
fi

exit 0
