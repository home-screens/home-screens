#!/usr/bin/env bash
# scripts/lib/setup-system.sh: the steps of `upgrade.sh setup-system`.
# Sourced by that arm; do not execute directly.
#
# Idempotent system-level configuration for the kiosk, run on every install
# and update, by the image builder inside a chroot (HS_CHROOT=1) and by
# deploy.sh. Each step only changes what is not already as it should be, and
# names what it changed in `changed` (comma-terminated names; src/lib/
# restart-needed.ts decides which of them need a restart to finish). Whole
# files come from tracked templates in scripts/system-files/ through
# hs_install_file; kiosk.conf comes from lib/kiosk-conf.cjs; the hub's
# launcher is scripts/kiosk-launcher-hub.sh installed as kiosk-launcher.sh.
#
# Expects upgrade.sh's APP_DIR, CONFIG_FILE, SCRIPT_DIR and PI_VARIANT, its
# hs_daemon_reload, hs_installs_session_package, hs_upgrade_system_packages,
# hs_launcher_changed and hs_record_restart_changes, and lib/common.sh (PORT,
# setup_font_aliases, write_kiosk_block, setup_boot_splash,
# hs_install_if_changed, hs_render_template).
[[ -n "${_SETUP_SYSTEM_SH_LOADED:-}" ]] && return 0; _SETUP_SYSTEM_SH_LOADED=1

HS_SYSTEM_FILES="$(cd "$(dirname "${BASH_SOURCE[0]}")/../system-files" && pwd)"

# Everything the kiosk session and the hub need from apt. fonts-dejavu-core
# is what the generic-family aliases (setup_font_aliases) point at. It is
# present on Desktop images already; Lite needs it named explicitly.
REQUIRED_PACKAGES="chromium labwc wtype wlr-randr wlopm kanshi fonts-noto-color-emoji fonts-dejavu-core plymouth plymouth-themes vim"

# hs_install_file <path> <mode> <tag>
# hs_install_if_changed with the tag folded into this run's change list.
# True when the file was written, so a step can run what a new file needs.
hs_install_file() {
  local tag
  tag="$(hs_install_if_changed "$@")"
  [ -n "${tag}" ] || return 1
  changed="${changed}${tag},"
}

# hs_owned_by_user <path>...
# During the image build this runs as root on the account's behalf; what it
# writes under that account's home and tree has to end up theirs.
hs_owned_by_user() {
  if [ "$(id -u)" -eq 0 ] && [ -n "${USER}" ] && [ "${USER}" != "root" ]; then
    chown "${USER}:${USER}" "$@"
  fi
}

# Required system packages.
hs_step_required_packages() {
  local missing="" pkg
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
    # shellcheck disable=SC2086
    sudo apt-get install -y -qq ${missing}
    changed="${changed}packages,"
    # shellcheck disable=SC2086
    if hs_installs_session_package ${missing}; then
      changed="${changed}session-packages,"
    fi
  fi
}

# Bring the programs the kiosk runs to the archive's newest version. A Pi
# keeps the Chromium and labwc it was flashed with otherwise, and a fix that
# lands in a package only ever reaches Pis flashed after it. Every one of
# them is a session program, so a change is a restart to finish.
hs_step_newer_packages() {
  hs_upgrade_system_packages
  if [ -n "${HS_UPGRADED_PACKAGES}" ]; then
    changed="${changed}packages,session-packages,"
  fi
}

# Generic font-family aliases (see setup_font_aliases in lib/common.sh).
hs_step_font_aliases() {
  setup_font_aliases
  changed="${changed}${FONT_ALIAS_CHANGES}"
}

# GPU access for labwc and Chromium on Lite (Desktop adds these by default).
hs_step_gpu_groups() {
  local grp
  [ "${PI_VARIANT}" = "lite" ] || return 0
  for grp in video render; do
    if getent group "${grp}" >/dev/null 2>&1 && ! id -nG "${USER}" | grep -qw "${grp}"; then
      sudo usermod -aG "${grp}" "${USER}"
      changed="${changed}${grp}-group,"
    fi
  done
}

# Stop cloud-init from undoing settings on every boot. Raspberry Pi OS ships
# it enabled. Without the hostname drop-in, /etc/hostname is rewritten on
# each boot from /boot/firmware/user-data, silently undoing any hostnamectl
# change made through the editor. Without the network drop-in, the NoCloud
# datasource (an ethernet stanza only) regenerates /etc/netplan on boot and
# deletes the NM-managed 90-NM-<uuid>.yaml that stores any Wi-Fi profile
# added via the editor.
hs_step_cloud_init() {
  [ -d /etc/cloud ] || return 0
  hs_install_file /etc/cloud/cloud.cfg.d/99-home-screens-hostname.cfg 0644 cloud-init-hostname \
    < "${HS_SYSTEM_FILES}/cloud-init-hostname.cfg" || true
  hs_install_file /etc/cloud/cloud.cfg.d/99-home-screens-network.cfg 0644 cloud-init-network \
    < "${HS_SYSTEM_FILES}/cloud-init-network.cfg" || true
}

# fontconfig prioritises the emoji font for Chromium.
hs_step_emoji_font() {
  if hs_install_file /etc/fonts/conf.d/01-emoji.conf 0644 emoji-font < "${HS_SYSTEM_FILES}/fontconfig-01-emoji.conf"; then
    sudo fc-cache -f
  fi
}

# The systemd service. Tarball installs run node server.js directly (no npm
# wrapper); git installs run npm start.
#
# ExecStartPre recovers from an interrupted atomic deploy: if APP_DIR was
# removed (mid-swap power loss) but the rollback still exists, restore it.
# The '-' on WorkingDirectory is what lets that run: systemd changes
# directory for every Exec line, ExecStartPre included, and without the
# prefix a missing APP_DIR fails the unit before the restore command ever
# starts. With it, ExecStartPre runs from / and ExecStart then finds the
# restored directory.
# UV_THREADPOOL_SIZE: Node's default pool of 4 threads is shared by every
# file read, DNS lookup and picture resize, so one resize could hold up the
# wall's polls. It only takes effect when set before Node starts.
hs_step_service() {
  local node_path npm_path exec_start
  node_path=$(which node 2>/dev/null || echo "/usr/bin/node")
  if [ -f "${APP_DIR}/server.js" ]; then
    exec_start="${node_path} ${APP_DIR}/server.js"
  else
    npm_path=$(which npm 2>/dev/null || echo "/usr/bin/npm")
    exec_start="${npm_path} start"
  fi
  if hs_install_file /etc/systemd/system/home-screens.service 0644 service <<< "$(hs_render_template "${HS_SYSTEM_FILES}/home-screens.service" \
      "USER=${USER}" "WORKING_DIR=${APP_DIR}" "APP_DIR=${APP_DIR}" "EXEC_START=${exec_start}" "PORT=${PORT}")"; then
    hs_daemon_reload
    sudo systemctl enable home-screens.service
  fi
}

# Hardware reporter. The hub reads its own /proc in-process (see
# src/lib/hardware-stats-server.ts), so hub Pis do not need the bash
# reporter; it is only meaningful on display-only Pis that do not run Node.
# Two concerns:
#   a) Keep the reporter files (binary, unit files, env file) fresh on
#      whatever Pi is running this script, so a display-only Pi upgraded via
#      rsync gets the newest reporter logic.
#   b) Leave the timer's enable/disable state alone if the user has
#      deliberately enabled it (e.g. for diagnosis on a hub).
hs_step_reporter() {
  local src="${APP_DIR}/scripts" bin="/usr/local/bin/home-screens-reporter.sh"
  local service="/etc/systemd/system/home-screens-reporter.service" timer="/etc/systemd/system/home-screens-reporter.timer"
  local reporter_changed=0
  [ -f "${src}/reporter.sh" ] || return 0
  if [ ! -f "${bin}" ] || ! sudo cmp -s "${src}/reporter.sh" "${bin}"; then
    sudo install -m 0755 "${src}/reporter.sh" "${bin}"
    reporter_changed=1
  fi
  if [ -f "${src}/home-screens-reporter.service" ] && \
     ( [ ! -f "${service}" ] || ! sudo cmp -s "${src}/home-screens-reporter.service" "${service}" ); then
    sudo install -m 0644 "${src}/home-screens-reporter.service" "${service}"
    reporter_changed=1
  fi
  if [ -f "${src}/home-screens-reporter.timer" ] && \
     ( [ ! -f "${timer}" ] || ! sudo cmp -s "${src}/home-screens-reporter.timer" "${timer}" ); then
    sudo install -m 0644 "${src}/home-screens-reporter.timer" "${timer}"
    reporter_changed=1
  fi
  if [ "${reporter_changed}" = "1" ]; then
    hs_daemon_reload
    # Restart the timer only if it has the config it needs AND the admin
    # has opted in by enabling it. The hub path never falls here because
    # install.sh no longer enables the reporter for hubs.
    if [ -f /etc/default/home-screens-reporter ] && \
       systemctl is-enabled home-screens-reporter.timer >/dev/null 2>&1; then
      sudo systemctl restart home-screens-reporter.timer 2>/dev/null || true
    fi
    changed="${changed}reporter,"
  fi
}

# Boot to console (required for the labwc kiosk).
hs_step_boot_target() {
  local current
  current=$(systemctl get-default 2>/dev/null || echo "unknown")
  if [ "${current}" != "multi-user.target" ]; then
    sudo systemctl set-default multi-user.target
    changed="${changed}boot-target,"
  fi
}

# Display managers off.
hs_step_display_managers() {
  local dm
  for dm in lightdm gdm3 sddm; do
    if systemctl is-enabled "${dm}" &>/dev/null; then
      sudo systemctl disable "${dm}"
      changed="${changed}${dm},"
    fi
  done
}

# The legacy kiosk service off.
hs_step_legacy_kiosk() {
  if systemctl is-enabled home-screens-kiosk &>/dev/null; then
    sudo systemctl disable home-screens-kiosk
    changed="${changed}legacy-kiosk,"
  fi
}

# Autologin on TTY1.
hs_step_autologin() {
  if hs_install_file /etc/systemd/system/getty@tty1.service.d/autologin.conf 0644 autologin \
      <<< "$(hs_render_template "${HS_SYSTEM_FILES}/getty-autologin.conf" "USER=${USER}")"; then
    hs_daemon_reload
  fi
}

# kiosk.conf from config.json (lib/kiosk-conf.cjs).
hs_step_kiosk_conf() {
  local kiosk_conf="${APP_DIR}/data/kiosk.conf" desired
  [ -f "${CONFIG_FILE}" ] || return 0
  desired="$(node "${SCRIPT_DIR}/lib/kiosk-conf.cjs" "${CONFIG_FILE}")"
  if [ ! -f "${kiosk_conf}" ] || [ "$(cat "${kiosk_conf}")" != "${desired}" ]; then
    echo "${desired}" > "${kiosk_conf}"
    changed="${changed}kiosk-conf,"
    # Put the new rotation and resolution on the running screen, as a save
    # in the editor does, so this change does not wait for a restart (the
    # labwc step turns touch to match). With no kiosk session running (the
    # image build, first boot, a fresh install) the script does nothing.
    if [ -x "${SCRIPT_DIR}/kiosk-outputs.sh" ]; then
      "${SCRIPT_DIR}/kiosk-outputs.sh" apply || true
    fi
  fi
  # The Next.js server (running as $USER) updates kiosk.conf after a save.
  hs_owned_by_user "${kiosk_conf}"
}

# The kiosk launcher (run as the labwc --session child), from
# scripts/kiosk-launcher-hub.sh. Installed as kiosk-launcher.sh because that
# path is baked into the ~/.bash_profile autologin block on every Pi in the
# field (write_kiosk_block in lib/common.sh); the display-only launcher
# installs at the same path on spokes.
hs_step_launcher() {
  local launcher="${APP_DIR}/scripts/kiosk-launcher.sh" desired
  desired="$(cat "${SCRIPT_DIR}/kiosk-launcher-hub.sh")"
  # Reported only when the running session's launcher is really different;
  # the file itself is (re)written whenever this tree's copy is not current.
  if hs_launcher_changed "${desired}" "${launcher}" "${APP_DIR}.rollback/scripts/kiosk-launcher.sh"; then
    changed="${changed}launcher,"
  fi
  if [ ! -f "${launcher}" ] || [ "$(cat "${launcher}")" != "${desired}" ]; then
    echo "${desired}" > "${launcher}"
    chmod +x "${launcher}"
  fi
  hs_owned_by_user "${launcher}"
}

# labwc configuration (window rules, cursor hiding keybind, and the touch
# matrix that follows the rotation in kiosk.conf). labwc-rc.sh is the file's
# only writer: the app runs the same script after a save, so an update and a
# save agree. Then the leftovers of older installs in labwc's autostart.
hs_step_labwc() {
  local labwc_dir="${HOME}/.config/labwc"
  if [ "$(bash "${SCRIPT_DIR}/labwc-rc.sh" --create)" = "changed" ]; then
    changed="${changed}labwc-rc,"
  fi

  # Legacy installs launched Chromium from autostart AND kiosk-launcher.sh,
  # causing two page targets that race on the display command queue.
  if [ -f "${labwc_dir}/autostart" ] && grep -q 'chromium' "${labwc_dir}/autostart"; then
    sed -i '/chromium/d' "${labwc_dir}/autostart"
    changed="${changed}labwc-autostart,"
  fi
  # The same installs, and rotate-display.sh until kanshi took over the
  # screen settings, rotated from autostart with wlr-randr. That line runs
  # after kanshi has applied the rotation from kiosk.conf, so a stale angle
  # in it would win at every boot. Only the rotation lines go: any other
  # wlr-randr line there is its owner's.
  if [ -f "${labwc_dir}/autostart" ] && grep -q 'wlr-randr.*--transform' "${labwc_dir}/autostart"; then
    sed -i '/wlr-randr.*--transform/d' "${labwc_dir}/autostart"
    case ",${changed}" in
      *,labwc-autostart,*) ;;
      *) changed="${changed}labwc-autostart," ;;
    esac
  fi

  # Fix ownership when running as root during image build.
  #
  # The parent matters as much as the child: labwc-rc.sh's `mkdir -p`
  # creates ${HOME}/.config too, and as root it lands root-owned. Chromium
  # then cannot create ${HOME}/.config/chromium, resolves its user-data and
  # crashpad directories to an empty string, and aborts at startup
  # ("chrome_crashpad_handler: --database is required"). Chromium is the
  # labwc session leader, so that abort takes down the whole kiosk and the
  # autologin cycle respawns until systemd parks getty@tty1 at
  # start-limit-hit: a black screen with nothing running and nothing in
  # the journal.
  if [ "$(id -u)" -eq 0 ] && [ -n "${USER}" ] && [ "${USER}" != "root" ]; then
    chown "${USER}:${USER}" "${HOME}/.config"
    chown -R "${USER}:${USER}" "${labwc_dir}"
  fi
}

# labwc auto-launch in .bash_profile (idempotent: updates stale blocks).
# Re-source kiosk.conf so PI_VARIANT reflects the kiosk.conf step's output
# (on the very first run kiosk.conf did not exist when upgrade.sh sourced it
# at the top).
hs_step_bash_profile() {
  local kiosk_conf="${APP_DIR}/data/kiosk.conf"
  [ -f "${kiosk_conf}" ] && source "${kiosk_conf}"
  PI_VARIANT="${PI_VARIANT:-desktop}"
  if write_kiosk_block "${PI_VARIANT}" "${APP_DIR}"; then
    changed="${changed}bash-profile,"
  fi
}

# Plymouth boot splash, 5 s minimum display, quiet-boot cmdline and the
# firmware rainbow splash. Same logic the display-only branch in install.sh
# runs; see setup_boot_splash in lib/common.sh.
hs_step_boot_splash() {
  setup_boot_splash "${APP_DIR}/scripts/boot-splash"
  if [ -n "${BOOT_SPLASH_CHANGES}" ]; then
    changed="${changed}${BOOT_SPLASH_CHANGES},"
  fi
}

# brcmfmac driver stability and memory for its buffers. The modprobe options
# (firmware roaming and buggy features off) are the official RPi Foundation
# fix, also adopted by Home Assistant OS. The reserved kernel memory keeps
# packet allocation from failing under memory pressure, which drops WiFi.
# Both files are checked by their one line, so a person's additions stay.
hs_step_wifi_driver() {
  local modprobe_conf="/etc/modprobe.d/brcmfmac.conf" mem_conf="/etc/sysctl.d/98-wifi-memory.conf"
  if [ ! -f "${modprobe_conf}" ] || ! grep -q "feature_disable=0x282000" "${modprobe_conf}" 2>/dev/null; then
    sudo tee "${modprobe_conf}" > /dev/null < "${HS_SYSTEM_FILES}/modprobe-brcmfmac.conf"
    changed="${changed}brcmfmac-modprobe,"
  fi
  if [ ! -f "${mem_conf}" ] || ! grep -q "min_free_kbytes" "${mem_conf}" 2>/dev/null; then
    sudo tee "${mem_conf}" > /dev/null < "${HS_SYSTEM_FILES}/sysctl-98-wifi-memory.conf"
    # In a chroot /proc is the build host's, so applying this would tune the
    # build machine instead of the image. The .conf above is what ships.
    if [ "${HS_CHROOT:-0}" != "1" ]; then
      sudo sysctl vm.min_free_kbytes=16384 2>/dev/null || true
    fi
    changed="${changed}wifi-memory,"
  fi
}

# WiFi reliability in NetworkManager: power management, MAC randomization,
# IPv6 and bgscan. brcmfmac aggressively sleeps the radio (500-800 ms latency
# spikes), randomized scan MACs confuse mesh APs, IPv6 multicast triggers
# radio issues, and background scanning takes the radio off-channel. Then the
# active connection itself: infinite retries, relaxed bgscan, no IPv6. On
# mesh networks (Google/Nest WiFi), AP steering causes brief disconnects, and
# the NM default of 4 retries burns through instantly, leaving the Pi
# offline. bgscan takes the radio off-channel; for a stationary device, scan
# about never.
hs_step_wifi_network_manager() {
  local wifi_conn current_retries
  if hs_install_file /etc/NetworkManager/conf.d/wifi-powersave.conf 0644 wifi-nm-conf < "${HS_SYSTEM_FILES}/networkmanager-wifi-powersave.conf"; then
    sudo iw wlan0 set power_save off 2>/dev/null || true
  fi

  # `|| true` is load-bearing: with `set -o pipefail`, grep finding no
  # wireless connection exits 1, which propagates out of the pipeline and
  # aborts the whole script. That happens on any host with no active WiFi,
  # an ethernet-only Pi as well as the image builder's chroot.
  wifi_conn=$(nmcli -t -f NAME,TYPE connection show --active 2>/dev/null | grep ':802-11-wireless$' | head -1 | cut -d: -f1 || true)
  if [ -n "${wifi_conn}" ]; then
    current_retries=$(nmcli -g connection.autoconnect-retries connection show "${wifi_conn}" 2>/dev/null)
    if [ "${current_retries}" != "0" ]; then
      sudo nmcli connection modify "${wifi_conn}" \
        connection.autoconnect-retries 0 \
        802-11-wireless.powersave 2 \
        ipv6.method disabled 2>/dev/null || true
      changed="${changed}wifi-connection,"
    fi
  fi
}

# Suspend and hibernate masked: brcmfmac cannot recover from suspend.
hs_step_mask_suspend() {
  local masked_any=0 target
  for target in sleep.target suspend.target hibernate.target hybrid-sleep.target; do
    if ! systemctl is-enabled "${target}" 2>/dev/null | grep -q masked; then
      sudo systemctl mask "${target}" 2>/dev/null || true
      masked_any=1
    fi
  done
  [ "${masked_any}" = "1" ] && changed="${changed}mask-suspend,"
  return 0
}

# WiFi watchdog: monitors connectivity and recovers from drops. Pings the
# gateway every 2 minutes; escalates through NM reconnect, interface cycle,
# and driver reload if needed.
hs_step_wifi_watchdog() {
  hs_install_file /usr/local/bin/wifi-watchdog.sh 0755 wifi-watchdog < "${HS_SYSTEM_FILES}/wifi-watchdog.sh" || true
  hs_install_file /etc/systemd/system/wifi-watchdog.service 0644 wifi-watchdog-service < "${HS_SYSTEM_FILES}/wifi-watchdog.service" || true
  if hs_install_file /etc/systemd/system/wifi-watchdog.timer 0644 wifi-watchdog-timer < "${HS_SYSTEM_FILES}/wifi-watchdog.timer"; then
    hs_daemon_reload
    sudo systemctl enable wifi-watchdog.timer 2>/dev/null || true
    sudo systemctl start wifi-watchdog.timer 2>/dev/null || true
  fi
}

# Volatile journal: logs in RAM to reduce SD card writes.
hs_step_journald() {
  if hs_install_file /etc/systemd/journald.conf.d/home-screens.conf 0644 journald < "${HS_SYSTEM_FILES}/journald-home-screens.conf"; then
    sudo systemctl restart systemd-journald 2>/dev/null || true
  fi
}

# Swap: low swappiness and reduced cache pressure for a kiosk, zram-tools
# purged (it conflicts with the native zram-generator), dphys-swapfile and
# its /var/swap gone.
hs_step_swap() {
  hs_install_file /etc/sysctl.d/99-home-screens-zram.conf 0644 zram-sysctl < "${HS_SYSTEM_FILES}/sysctl-99-home-screens-zram.conf" || true
  if dpkg -s zram-tools &>/dev/null; then
    sudo apt-get purge -y -qq zram-tools 2>/dev/null || true
    changed="${changed}purge-zram-tools,"
  fi
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
}

# Unnecessary services off, to reduce background activity and SD wear, and
# the ones package installs or dependencies might re-enable masked.
hs_step_disable_services() {
  local disable_svcs mask_svcs svc state disabled_any=0 masked_any=0
  disable_svcs="apt-daily.service apt-daily-upgrade.service apt-daily.timer apt-daily-upgrade.timer man-db.timer dpkg-db-backup.timer rsyslog.service syslog.service bluetooth.service hciuart.service bthelper@.service ModemManager.service triggerhappy.service triggerhappy.socket systemd-journal-flush.service smartmontools.service smartd.service serial-getty@ttyAMA0.service serial-getty@ttyS0.service"
  for svc in ${disable_svcs}; do
    # Skip if the unit does not exist on this system
    if ! systemctl list-unit-files "${svc}" &>/dev/null; then
      continue
    fi
    state=$(systemctl is-enabled "${svc}" 2>/dev/null || echo "missing")
    if [ "${state}" != "masked" ] && [ "${state}" != "disabled" ] && [ "${state}" != "missing" ] && [ "${state}" != "indirect" ]; then
      sudo systemctl disable "${svc}" 2>/dev/null || true
      sudo systemctl stop "${svc}" 2>/dev/null || true
      disabled_any=1
    fi
  done
  [ "${disabled_any}" = "1" ] && changed="${changed}disable-services,"

  mask_svcs="rsyslog.service ModemManager.service bluetooth.service"
  for svc in ${mask_svcs}; do
    state=$(systemctl is-enabled "${svc}" 2>/dev/null || echo "missing")
    if [ "${state}" != "masked" ] && [ "${state}" != "missing" ]; then
      sudo systemctl mask "${svc}" 2>/dev/null || true
      masked_any=1
    fi
  done
  [ "${masked_any}" = "1" ] && changed="${changed}mask-services,"
  return 0
}

# Storage-specific: trim and scrub timers adapted to the disk type.
hs_step_storage_timers() {
  local root_part root_dev tmr state
  root_part=$(findmnt -n -o SOURCE / 2>/dev/null || echo "")
  root_dev=$(lsblk -no PKNAME "${root_part}" 2>/dev/null || echo "")
  [ -n "${root_dev}" ] || return 0
  case "${root_dev}" in
    mmcblk*)
      # SD card: no TRIM support, timers off
      for tmr in fstrim.timer e2scrub_all.timer; do
        state=$(systemctl is-enabled "${tmr}" 2>/dev/null || echo "missing")
        if [ "${state}" != "masked" ] && [ "${state}" != "disabled" ] && [ "${state}" != "missing" ]; then
          sudo systemctl disable "${tmr}" 2>/dev/null || true
          sudo systemctl stop "${tmr}" 2>/dev/null || true
          changed="${changed}disable-${tmr},"
        fi
      done
      ;;
    *)
      # SSD/NVMe: TRIM and scrub on
      for tmr in fstrim.timer e2scrub_all.timer; do
        state=$(systemctl is-enabled "${tmr}" 2>/dev/null || echo "missing")
        if [ "${state}" = "disabled" ]; then
          sudo systemctl enable "${tmr}" 2>/dev/null || true
          sudo systemctl start "${tmr}" 2>/dev/null || true
          changed="${changed}enable-${tmr},"
        fi
      done
      ;;
  esac
}

# File descriptor limits: Chromium and Next.js benefit from higher limits.
hs_step_fd_limits() {
  hs_install_file /etc/security/limits.d/99-home-screens.conf 0644 fd-limits \
    <<< "$(hs_render_template "${HS_SYSTEM_FILES}/limits-99-home-screens.conf" "USER=${USER}")" || true
}

# tmpfs mounts: fewer SD card writes for temp files.
hs_step_tmpfs() {
  if ! grep -q "# Home Screens tmpfs" /etc/fstab 2>/dev/null; then
    sudo tee -a /etc/fstab > /dev/null < "${HS_SYSTEM_FILES}/fstab-tmpfs"
    changed="${changed}tmpfs-mounts,"
  fi
}

# WiFi autoconnect dispatcher: infinite retries and no powersave on any WiFi
# connection that comes up, new SSIDs included.
hs_step_wifi_dispatcher() {
  hs_install_file /etc/NetworkManager/dispatcher.d/99-wifi-autoconnect 0755 wifi-dispatcher \
    < "${HS_SYSTEM_FILES}/networkmanager-99-wifi-autoconnect" || true
}

# Boot speed: services that block boot waiting for the network off, and
# dhcpcd off where NetworkManager is also enabled (redundant).
hs_step_boot_speed() {
  local svc state dhcpcd_state nm_state
  for svc in systemd-networkd-wait-online.service NetworkManager-wait-online.service; do
    state=$(systemctl is-enabled "${svc}" 2>/dev/null || echo "missing")
    if [ "${state}" != "masked" ] && [ "${state}" != "disabled" ] && [ "${state}" != "missing" ]; then
      sudo systemctl disable "${svc}" 2>/dev/null || true
      changed="${changed}disable-${svc},"
    fi
  done
  dhcpcd_state=$(systemctl is-enabled dhcpcd 2>/dev/null || echo "missing")
  nm_state=$(systemctl is-enabled NetworkManager 2>/dev/null || echo "missing")
  if [ "${dhcpcd_state}" = "enabled" ] && [ "${nm_state}" = "enabled" ]; then
    sudo systemctl disable dhcpcd 2>/dev/null || true
    sudo systemctl stop dhcpcd 2>/dev/null || true
    changed="${changed}disable-dhcpcd,"
  fi
}

# Kernel parameters: the inotify watch limit raised for Next.js file
# watching, then every sysctl change applied. Skipped in a chroot, where
# /proc belongs to the build host; the .conf files take effect when the
# device boots.
hs_step_sysctl() {
  hs_install_file /etc/sysctl.d/99-home-screens.conf 0644 sysctl-inotify < "${HS_SYSTEM_FILES}/sysctl-99-home-screens.conf" || true
  if [ "${HS_CHROOT:-0}" != "1" ]; then
    sudo sysctl --system > /dev/null 2>&1 || true
  fi
}

# The whole of `upgrade.sh setup-system`: every step in order, then one
# JSON line naming what changed, which the app reads (src/lib/upgrade.ts)
# and the restart marker records.
hs_setup_system() {
  changed=""

  hs_step_required_packages
  hs_step_newer_packages
  hs_step_font_aliases
  hs_step_gpu_groups
  hs_step_cloud_init
  hs_step_emoji_font
  hs_step_service
  hs_step_reporter
  hs_step_boot_target
  hs_step_display_managers
  hs_step_legacy_kiosk
  hs_step_autologin
  hs_step_kiosk_conf
  hs_step_launcher
  hs_step_labwc
  hs_step_bash_profile
  hs_step_boot_splash
  hs_step_wifi_driver
  hs_step_wifi_network_manager
  hs_step_mask_suspend
  hs_step_wifi_watchdog
  hs_step_journald
  hs_step_swap
  hs_step_disable_services
  hs_step_storage_timers
  hs_step_fd_limits
  hs_step_tmpfs
  hs_step_wifi_dispatcher
  hs_step_boot_speed
  hs_step_sysctl

  changed="${changed%,}"
  if [ -n "${changed}" ]; then
    hs_record_restart_changes "${changed}"
    echo "{\"ok\":true,\"changed\":\"${changed}\"}"
  else
    echo "{\"ok\":true,\"changed\":null}"
  fi
}
