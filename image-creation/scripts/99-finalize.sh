#!/bin/bash
# Stage 99: Finalize for Distribution
# Cleans up the system and prepares for image creation.
# Only runs when --img flag is passed to build-image.sh.

set -e

APP_DIR="/opt/home-screens/current"
APP_USER="hs"

log_info() {
    echo "[INFO] $1"
}

log_warn() {
    echo "[WARN] $1"
}

if [ "$BUILD_IMG" != "true" ]; then
    log_info "Skipping finalize (not building image)"
    exit 0
fi

log_info "Preparing image for distribution"

# ============================================================================
# Remove packages only needed for building (not runtime)
# ============================================================================
log_info "Removing build-only dependencies"

# Git (repo already cloned/downloaded and installed)
apt-get -y purge git 2>/dev/null || true

# Build essentials (only needed if HS_LOCAL was used)
apt-get -y purge build-essential gcc g++ make 2>/dev/null || true

# Clean up orphaned packages
apt-get -y autoremove --purge

# ============================================================================
# Clean package cache
# ============================================================================
log_info "Cleaning package cache"
apt-get clean
rm -rf /var/lib/apt/lists/*
rm -rf /var/cache/apt/archives/*.deb

# ============================================================================
# Remove development files and caches
# ============================================================================
log_info "Removing development files"
rm -rf /root/.npm
rm -rf /root/.cache
rm -rf /home/*/.npm
rm -rf /home/*/.cache
rm -rf /home/*/.ssh/id_rsa*
rm -rf /home/*/.ssh/known_hosts*
rm -rf /home/*/.ssh/authorized_keys

# ============================================================================
# Clear logs
# ============================================================================
log_info "Clearing logs"
find /var/log -type f -name "*.log" -delete 2>/dev/null || true
find /var/log -type f -name "*.gz" -delete 2>/dev/null || true
find /var/log -type f -name "*.1" -delete 2>/dev/null || true
journalctl --vacuum-time=1s 2>/dev/null || true

# ============================================================================
# Clear temp files
# ============================================================================
log_info "Clearing temp files"
rm -rf /tmp/*
rm -rf /var/tmp/*

# ============================================================================
# Clear SSH host keys (regenerated on first boot)
# ============================================================================
log_info "Removing SSH host keys (will regenerate on first boot)"
rm -f /etc/ssh/ssh_host_*

# ============================================================================
# Clear machine-id (regenerated on first boot)
# ============================================================================
log_info "Clearing machine-id"
truncate -s 0 /etc/machine-id
rm -f /var/lib/dbus/machine-id
ln -sf /etc/machine-id /var/lib/dbus/machine-id

# ============================================================================
# Clear shell history
# ============================================================================
log_info "Clearing bash history"
rm -f /root/.bash_history
rm -f /home/*/.bash_history
history -c 2>/dev/null || true

# ============================================================================
# Create first-boot service
# ============================================================================
log_info "Setting up first-boot initialization"

cat > /etc/systemd/system/home-screens-firstboot.service << EOF
[Unit]
Description=Home Screens First Boot Initialization
ConditionPathExists=!/opt/home-screens/.initialized
After=network.target
Before=home-screens.service ssh.service sshd.service getty@tty1.service

[Service]
Type=oneshot
ExecStart=/opt/home-screens/bin/firstboot.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /opt/home-screens/bin

cat > /opt/home-screens/bin/firstboot.sh << 'FBEOF'
#!/bin/bash
# Home Screens First Boot Initialization
# NOTE: Do NOT use `set -e` — individual failures are handled inline and must
# not prevent the .initialized marker from being written (which would cause
# the script to re-run on every boot).

APP_DIR="/opt/home-screens/current"
APP_USER="hs"
CONFIG_FILE="${APP_DIR}/data/config.json"

log() {
    echo "[Home Screens FirstBoot] $1"
    logger -t home-screens-firstboot "$1" 2>/dev/null || true
}

log "Starting first boot initialization"

# Regenerate SSH host keys (use ssh-keygen -A instead of dpkg-reconfigure
# to avoid a systemd deadlock — this unit declares Before=ssh.service, so
# dpkg-reconfigure's attempt to restart ssh would block forever).
if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    log "Regenerating SSH host keys"
    ssh-keygen -A
fi

# Regenerate machine-id (empty file triggers systemd auto-regeneration,
# but we also call setup explicitly as a belt-and-suspenders approach)
if [ ! -s /etc/machine-id ]; then
    log "Regenerating machine-id"
    systemd-machine-id-setup
fi

# WiFi from wifi.txt is handled by home-screens-wifi.service, which runs on
# every boot while the file exists, so a corrected file after a failed first
# attempt still works. It is deliberately not part of this once-only script.

# Expand filesystem to fill SD card (immediate, no reboot needed)
ROOT_PART=$(findmnt -n -o SOURCE / 2>/dev/null || echo "")
ROOT_DEV=$(lsblk -no PKNAME "$ROOT_PART" 2>/dev/null || echo "")
if [ -n "$ROOT_DEV" ] && [ -n "$ROOT_PART" ]; then
    DISK_SIZE=$(lsblk -b -n -o SIZE "/dev/$ROOT_DEV" 2>/dev/null | head -1)
    PART_SIZE=$(lsblk -b -n -o SIZE "$ROOT_PART" 2>/dev/null)
    if [ -n "$DISK_SIZE" ] && [ -n "$PART_SIZE" ]; then
        THRESHOLD=$((DISK_SIZE * 90 / 100))
        if [ "$PART_SIZE" -lt "$THRESHOLD" ]; then
            log "Expanding filesystem"
            PART_NUM=$(echo "$ROOT_PART" | grep -o '[0-9]*$')
            if ! growpart "/dev/$ROOT_DEV" "$PART_NUM" 2>/dev/null; then
                log "growpart failed — filesystem not expanded"
            elif ! resize2fs "$ROOT_PART" 2>/dev/null; then
                log "resize2fs failed — filesystem not expanded"
            fi
        fi
    fi
fi

# Auto-detect display resolution from DRM/EDID and update config.json
# The first mode listed is the display's preferred/native resolution.
NATIVE_RES=$(cat /sys/class/drm/card*-*/modes 2>/dev/null | head -1 || true)
if [ -n "${NATIVE_RES}" ] && [ -f "${CONFIG_FILE}" ] && command -v node &>/dev/null; then
    log "Detected display resolution: ${NATIVE_RES}"
    node -e "
      const fs = require('fs');
      const [configFile, native] = process.argv.slice(1);
      try {
        const c = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        const s = c.settings = c.settings || {};
        const [rawW, rawH] = native.split('x').map(Number);
        if (rawW && rawH) {
          const t = s.displayTransform || '90';
          if (t === '90' || t === '270') {
            s.displayWidth = Math.min(rawW, rawH);
            s.displayHeight = Math.max(rawW, rawH);
          } else {
            s.displayWidth = rawW;
            s.displayHeight = rawH;
          }
          fs.writeFileSync(configFile, JSON.stringify(c, null, 2) + '\n');
        }
      } catch (e) {
        // Non-fatal — editor will show default 1080x1920
      }
    " -- "${CONFIG_FILE}" "${NATIVE_RES}"

    # Regenerate kiosk.conf with the detected resolution
    if [ -f "${APP_DIR}/scripts/upgrade.sh" ]; then
        if USER="${APP_USER}" HOME="/home/${APP_USER}" \
            bash "${APP_DIR}/scripts/upgrade.sh" setup-system 2>/dev/null; then
            log "Updated config.json with detected display dimensions"
        else
            log "setup-system failed — display config may need manual update via editor"
        fi
    fi
else
    log "No display detected or node not available — using defaults (1080x1920)"
fi

# Mark first boot as complete — only after all required work succeeds.
# The systemd unit uses ConditionPathExists to skip on subsequent boots.
touch /opt/home-screens/.initialized
log "First boot initialization complete"
FBEOF

chmod +x /opt/home-screens/bin/firstboot.sh
systemctl enable home-screens-firstboot.service

# ============================================================================
# WiFi provisioning from wifi.txt: its own unit, runs on every boot while the
# file exists. Kept out of firstboot.sh so a corrected wifi.txt after a failed
# first attempt is picked up without reflashing.
# ============================================================================
log_info "Setting up WiFi provisioning from wifi.txt"
cat > /opt/home-screens/bin/wifi-provision.sh << 'WPEOF'
#!/bin/bash
# Home Screens WiFi setup from /boot/firmware/wifi.txt.
#
# Runs on every boot while the file exists (the unit's ConditionPathExists),
# not only the first, so a corrected file after a failed attempt is used
# without reflashing. The file is removed only once NetworkManager has a
# saved, valid profile; from then on NetworkManager owns the retries. A file
# that cannot be turned into a profile stays on the card, with the reason in
# the journal (journalctl -t home-screens-wifi).
#
# The profile is written by `nmcli --offline`, which escapes the SSID and
# password for the keyfile format. Pi OS's imager_custom writes them raw,
# which drops leading spaces and mangles backslashes, so it is not used.
set -u

WIFI_FILE="/boot/firmware/wifi.txt"
CONN_NAME="preconfigured"
CONN_DIR="/etc/NetworkManager/system-connections"
CONN_FILE="${CONN_DIR}/${CONN_NAME}.nmconnection"

log() {
    echo "[Home Screens WiFi] $1"
    logger -t home-screens-wifi "$1" 2>/dev/null || true
}

[ -f "${WIFI_FILE}" ] || exit 0
log "Found wifi.txt"

WIFI_SSID="" WIFI_PASS="" WIFI_COUNTRY="" WIFI_HIDDEN=""
# `|| [ -n "$line" ]` keeps a last line that has no trailing newline; a bare
# `read` returns 1 on it and the loop body never ran, so a file that ended
# with PASSWORD=... silently became an open network. Values are used exactly
# as written apart from a Windows carriage return and one pair of matching
# surrounding quotes, since passwords may contain spaces.
while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in \#*|"") continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    key=$(echo "$key" | tr -d '[:space:]')
    case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    case "$key" in
        SSID)     WIFI_SSID="$value" ;;
        PASSWORD) WIFI_PASS="$value" ;;
        COUNTRY)  WIFI_COUNTRY="$(echo "$value" | tr -d '[:space:]')" ;;
        HIDDEN)   WIFI_HIDDEN="$(echo "$value" | tr -d '[:space:]')" ;;
    esac
done < "${WIFI_FILE}"

if [ -z "${WIFI_SSID}" ]; then
    log "wifi.txt has no SSID line, leaving the file in place"
    exit 0
fi

# A WPA passphrase is 8 to 63 bytes, or exactly 64 hex digits. nmcli
# --offline does not check this, and a profile with a bad key would be saved,
# the file deleted, and the join fail forever with nothing to fix on the card.
# Bytes, not characters: the unit runs under the system's UTF-8 locale, where
# ${#var} counts characters, and NetworkManager measures the key in bytes.
if [ -n "${WIFI_PASS}" ]; then
    pass_bytes=$(printf '%s' "${WIFI_PASS}" | wc -c | tr -d ' ')
    if ! { [ "${pass_bytes}" -ge 8 ] && [ "${pass_bytes}" -le 63 ]; } \
       && ! printf '%s' "${WIFI_PASS}" | grep -qE '^[0-9A-Fa-f]{64}$'; then
        log "PASSWORD is ${pass_bytes} bytes long; a WiFi password is 8 to 63 bytes (accented letters count as 2). Leaving wifi.txt in place"
        exit 0
    fi
fi

# Country: the documented default is US, and it must be a real ISO 3166 code
# because raspi-config writes it into cmdline.txt as the regulatory domain.
WIFI_COUNTRY="$(printf '%s' "${WIFI_COUNTRY:-US}" | tr '[:lower:]' '[:upper:]')"
if ! printf '%s' "${WIFI_COUNTRY}" | grep -qE '^[A-Z]{2}$' \
   || ! grep -qE "^${WIFI_COUNTRY}[[:space:]]" /usr/share/zoneinfo/iso3166.tab 2>/dev/null; then
    log "COUNTRY '${WIFI_COUNTRY}' is not a two-letter country code, using US"
    WIFI_COUNTRY="US"
fi

# Setting the country is also what switches the radio on: raspi-config sets
# the regulatory domain, records it in cmdline.txt and runs nmcli radio wifi on.
if command -v raspi-config >/dev/null 2>&1; then
    if raspi-config nonint do_wifi_country "${WIFI_COUNTRY}" >/dev/null 2>&1; then
        log "Country set to ${WIFI_COUNTRY}"
    else
        log "Could not set the country with raspi-config, continuing"
    fi
else
    command -v iw >/dev/null 2>&1 && iw reg set "${WIFI_COUNTRY}" 2>/dev/null || true
    nmcli radio wifi on 2>/dev/null || true
fi

args=(connection add type wifi con-name "${CONN_NAME}" ifname '*' ssid "${WIFI_SSID}"
      connection.autoconnect yes connection.autoconnect-retries 0
      ipv4.method auto ipv6.method auto)
case "${WIFI_HIDDEN}" in
    true|TRUE|True|yes|1) args+=(802-11-wireless.hidden yes) ;;
esac
if [ -n "${WIFI_PASS}" ]; then
    args+=(wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${WIFI_PASS}")
fi

# NetworkManager ignores dotfiles in this directory, so the profile is built
# under a hidden temp name and renamed into place in one step.
# Every step of the save is checked: wifi.txt is only removed once the
# profile is verifiably in place, so a full disk or a read-only filesystem
# leaves the file on the card for the next boot instead of losing it.
save_failed() {
    rm -f "${tmp:-}"
    log "Could not save the network profile ($1), leaving wifi.txt in place"
    exit 0
}
mkdir -p "${CONN_DIR}" || save_failed "cannot create ${CONN_DIR}"
tmp="$(mktemp "${CONN_DIR}/.${CONN_NAME}.XXXXXX")" || save_failed "cannot write in ${CONN_DIR}"
if ! err="$(nmcli --offline "${args[@]}" 2>&1 >"${tmp}")"; then
    rm -f "${tmp}"
    log "NetworkManager rejected the settings, leaving wifi.txt in place: ${err}"
    exit 0
fi
[ -s "${tmp}" ] || save_failed "nmcli wrote an empty profile"
chmod 600 "${tmp}" || save_failed "chmod failed"
chown root:root "${tmp}" || save_failed "chown failed"
mv -f "${tmp}" "${CONN_FILE}" || save_failed "rename failed"
[ -s "${CONN_FILE}" ] || save_failed "profile missing after rename"
nmcli connection reload 2>/dev/null || true

# The profile is saved with the password inside it, root-only, so the
# plaintext copy on the FAT32 boot partition can go.
rm -f "${WIFI_FILE}"
log "Saved network '${WIFI_SSID}' and removed wifi.txt; NetworkManager keeps trying to connect from here"

if nmcli connection up "${CONN_NAME}" >/dev/null 2>&1; then
    log "Connected"
else
    log "Not connected yet, NetworkManager will keep trying"
fi
exit 0
WPEOF
chmod +x /opt/home-screens/bin/wifi-provision.sh

cat > /etc/systemd/system/home-screens-wifi.service << EOF
[Unit]
Description=Home Screens WiFi setup from wifi.txt
ConditionPathExists=/boot/firmware/wifi.txt
RequiresMountsFor=/boot/firmware
After=NetworkManager.service
Wants=NetworkManager.service
Before=home-screens.service

[Service]
Type=oneshot
ExecStart=/opt/home-screens/bin/wifi-provision.sh

[Install]
WantedBy=multi-user.target
EOF
systemctl enable home-screens-wifi.service

# ============================================================================
# Drop wifi.txt.example on the boot partition so users know the format
# ============================================================================
log_info "Creating wifi.txt.example on boot partition"
cat > /boot/firmware/wifi.txt.example << 'WIFIEOF'
# Home Screens WiFi Configuration
# Rename this file to wifi.txt and fill in your details.
# The Pi reads it when it boots, saves the network, and deletes this file.
# If something in it could not be used, the file stays; fix it and boot again.
#
# SSID     — Your WiFi network name (required)
# PASSWORD — Your WiFi password (omit for open networks). Everything after
#            the = sign is used as typed, spaces included; quotes around the
#            whole value are removed.
# COUNTRY  — Two-letter country code, e.g. US, GB, DK (optional, defaults to US).
#            Set it: it decides which WiFi channels the Pi may use.
# HIDDEN   — Set to true if your network is hidden (optional, defaults to false)

SSID=
PASSWORD=
COUNTRY=US
WIFIEOF

# ============================================================================
# Prepare filesystem for imaging
# ============================================================================
log_info "Preparing filesystem for imaging"

# Flush and vacuum journal
journalctl --flush --rotate 2>/dev/null || true
journalctl --vacuum-time=1s 2>/dev/null || true

# Trim filesystem
if command -v fstrim &> /dev/null; then
    fstrim -v / 2>/dev/null || true
    log_info "  Filesystem trimmed"
fi

# Zero free space for better image compression
log_info "Zeroing free space (improves compression, may take a few minutes)..."
dd if=/dev/zero of=/zero.fill bs=1M 2>/dev/null || true
rm -f /zero.fill
log_info "  Free space zeroed"

# Sync all pending writes
sync

# ============================================================================
# Final verification
# ============================================================================
log_info "Verifying installation before finalization"

VERIFY_OK=true

if [ ! -f "${APP_DIR}/server.js" ]; then
    log_warn "Warning: server.js not found"
    VERIFY_OK=false
fi

if [ ! -d "${APP_DIR}/.next" ]; then
    log_warn "Warning: .next build output not found"
    VERIFY_OK=false
fi

if [ ! -f /etc/systemd/system/home-screens.service ]; then
    log_warn "Warning: systemd service not installed"
    VERIFY_OK=false
fi

# The kiosk chain is getty@tty1 -> autologin -> ~/.bash_profile -> labwc ->
# chromium. Every link below has shipped broken in an image at least once, and
# each failure looks identical from the outside: a black screen, an empty
# journal, and green app diagnostics (those only cover the Next.js service,
# which is fine while the kiosk is dead). Assert them here so a base-image
# change cannot reintroduce any of them silently.
if [ ! -e /etc/systemd/system/getty.target.wants/getty@tty1.service ]; then
    log_warn "Warning: getty@tty1 not enabled — tty1 gets no login shell, kiosk will never start"
    VERIFY_OK=false
fi

# systemctl operates offline when it detects a chroot, so it can answer this
# properly rather than us inferring from a symlink. Both are kept: the symlink
# is an unambiguous filesystem fact, and this is systemd's own resolution.
# States are logged either way — a check whose command silently errors and
# falls through the comparison is worse than no check at all.
GETTY_STATE="$(systemctl is-enabled getty@tty1 2>&1 || true)"
log_info "getty@tty1 is-enabled: ${GETTY_STATE}"
case "${GETTY_STATE}" in
    enabled|enabled-runtime) ;;
    *)
        log_warn "Warning: getty@tty1 reports '${GETTY_STATE}', expected enabled"
        VERIFY_OK=false
        ;;
esac

if [ ! -f /etc/systemd/system/getty@tty1.service.d/autologin.conf ]; then
    log_warn "Warning: autologin drop-in missing — tty1 will sit at a login prompt"
    VERIFY_OK=false
fi

USERCONF_STATE="$(systemctl is-enabled userconfig.service 2>&1 || true)"
log_info "userconfig.service is-enabled: ${USERCONF_STATE}"
if [ "${USERCONF_STATE}" = "enabled" ]; then
    log_warn "Warning: userconfig.service still enabled — its wizard will hang on first boot"
    VERIFY_OK=false
fi

# The service runs as ${APP_USER} and reaches root through sudo for updates,
# WiFi changes and hostname changes; the updater's preflight runs `sudo -n true`
# before anything else. Pi OS only grants that to the account its first-boot
# wizard creates, so stage 01 writes the grant for ${APP_USER} itself. A
# missing or unparseable file is silently ignored by sudo and the image ships
# with an updater that cannot update (issue #47), so check all three: present,
# parses, carries the grant.
SUDOERS_DROPIN="/etc/sudoers.d/010_${APP_USER}-nopasswd"
if [ ! -f "${SUDOERS_DROPIN}" ]; then
    log_warn "Warning: ${SUDOERS_DROPIN} missing, ${APP_USER} cannot sudo without a password and in-app updates fail their preflight"
    VERIFY_OK=false
elif ! SUDOERS_CHECK="$(visudo -cf "${SUDOERS_DROPIN}" 2>&1)"; then
    log_warn "Warning: ${SUDOERS_DROPIN} does not parse, sudo will ignore it: ${SUDOERS_CHECK}"
    VERIFY_OK=false
elif ! grep -qE "^${APP_USER}[[:space:]]+ALL=\(ALL(:ALL)?\)[[:space:]]+NOPASSWD:[[:space:]]*ALL[[:space:]]*$" "${SUDOERS_DROPIN}"; then
    log_warn "Warning: ${SUDOERS_DROPIN} does not grant ${APP_USER} NOPASSWD: ALL:"
    sed 's/^/    /' "${SUDOERS_DROPIN}"
    VERIFY_OK=false
else
    log_info "${SUDOERS_DROPIN} grants ${APP_USER} passwordless sudo"
fi

# NetworkManager restores WirelessEnabled from this file on every boot. The
# stock base image says false, which leaves a Pi started on Ethernet unable to
# add WiFi from the editor; stage 01 flips it. Check the flag, not just the file.
NM_STATE="/var/lib/NetworkManager/NetworkManager.state"
if grep -qs '^WirelessEnabled=true' "${NM_STATE}"; then
    log_info "NetworkManager state has the WiFi radio enabled"
else
    log_warn "Warning: ${NM_STATE} does not enable the WiFi radio, the editor's Network page will find no networks on an Ethernet-first Pi"
    VERIFY_OK=false
fi

# WiFi provisioning: script present and parseable, unit enabled, unit verifies.
WIFI_SCRIPT="/opt/home-screens/bin/wifi-provision.sh"
if [ -x "${WIFI_SCRIPT}" ] && bash -n "${WIFI_SCRIPT}" 2>/dev/null; then
    log_info "wifi-provision.sh present and parses"
else
    log_warn "Warning: ${WIFI_SCRIPT} missing, not executable, or does not parse; wifi.txt would be ignored"
    VERIFY_OK=false
fi
if [ ! -e /etc/systemd/system/multi-user.target.wants/home-screens-wifi.service ]; then
    log_warn "Warning: home-screens-wifi.service not enabled; wifi.txt would be ignored"
    VERIFY_OK=false
fi
if command -v systemd-analyze >/dev/null 2>&1; then
    if WIFI_ANALYZE="$(systemd-analyze verify --man=false home-screens-wifi.service 2>&1)"; then
        log_info "systemd-analyze verify home-screens-wifi.service: clean"
    else
        log_warn "Warning: home-screens-wifi.service does not verify: ${WIFI_ANALYZE}"
        VERIFY_OK=false
    fi
fi

# Does the unit plus its drop-in actually parse? The existence check above
# passes a malformed drop-in happily, and the unit then fails to start with a
# parse error.
#
# --man=false is required, not cosmetic: verify otherwise resolves every
# Documentation= man page, and stage 02 strips man pages from the image, so it
# reports `Command 'man agetty(8)' failed with code 1` on a perfectly good unit.
if command -v systemd-analyze >/dev/null 2>&1; then
    if ANALYZE_OUT="$(systemd-analyze verify --man=false getty@tty1.service 2>&1)"; then
        log_info "systemd-analyze verify getty@tty1.service: clean"
    else
        log_warn "Warning: getty@tty1.service does not verify: ${ANALYZE_OUT}"
        VERIFY_OK=false
    fi
fi

for _d in "/home/${APP_USER}" "/home/${APP_USER}/.config"; do
    if [ -e "${_d}" ] && [ "$(stat -c %U "${_d}")" != "${APP_USER}" ]; then
        log_warn "Warning: ${_d} is owned by $(stat -c %U "${_d}"), not ${APP_USER} — Chromium cannot create its profile"
        VERIFY_OK=false
    fi
done

# Actually run the browser as the kiosk user.
#
# Every check above inspects a filesystem that has never booted. This is the
# one cheap thing that EXECUTES part of the kiosk chain, and it needs no
# display, compositor or kernel. On the image that shipped with a root-owned
# ~/.config it fails with exactly the diagnosis:
#
#   ERROR:chrome/app/chrome_main.cc:207] Failed to create headless user data
#   directory container.
#
# Two flags are load-bearing, not cosmetic:
#
#   HOME=/home/hs           the chroot runs with HOME=/root, so without this
#                           Chromium builds its profile under /root, succeeds,
#                           and proves nothing about the user running the kiosk
#   --disable-dev-shm-usage /dev/shm belongs to the build host and is not
#                           writable here, so Chromium dies on shared memory
#                           long before it reaches the profile. Sending it to
#                           /tmp keeps the check pointed at what we care about
if command -v chromium >/dev/null 2>&1 && command -v runuser >/dev/null 2>&1; then
    # timeout: a wedged Chromium in a chroot would otherwise stall the build
    # until the job's 120-minute limit.
    if CHROMIUM_OUT="$(timeout 120 runuser -u "${APP_USER}" -- \
            env HOME="/home/${APP_USER}" \
            chromium --headless --no-sandbox --disable-dev-shm-usage \
            --dump-dom about:blank 2>&1)"; then
        log_info "Chromium ran as ${APP_USER} and rendered a page"
    else
        log_warn "Warning: Chromium failed to run as ${APP_USER} — the kiosk will not start:"
        echo "${CHROMIUM_OUT}" | head -10 | sed 's/^/    /'
        VERIFY_OK=false
    fi
else
    log_warn "Warning: chromium or runuser missing — cannot verify the browser runs"
    VERIFY_OK=false
fi

if [ "$VERIFY_OK" = "true" ]; then
    log_info "All verifications passed"
else
    log_warn "Some verifications failed — image may not work correctly"
    exit 1
fi

# ============================================================================
# Remove build-time telemetry identity so each device generates its own UUID
# on first boot. Without this, every image flashed from this build would share
# the same installId.
# ============================================================================
rm -f "${APP_DIR}/data/telemetry.json"
log_info "Cleared telemetry identity"

# ============================================================================
# Clear cloud-init state so it treats the end-user's boot as a fresh first boot.
# Without this, cloud-init sees the cached instance-id from the build and skips
# first-boot modules (networking, user setup, etc.).
# ============================================================================
if [ -d /var/lib/cloud ]; then
    log_info "Clearing cloud-init state"
    rm -rf /var/lib/cloud
fi

# Strip builder's SSH authorized keys and enable password auth in user-data
if [ -f /boot/firmware/user-data ]; then
    sed -i '/^  ssh_authorized_keys:/,/^  [^ ]/{ /^  ssh_authorized_keys:/d; /^    - /d; }' /boot/firmware/user-data
    sed -i 's/^ssh_pwauth: false/ssh_pwauth: true/' /boot/firmware/user-data
    log_info "Removed SSH authorized keys and enabled password auth in user-data"
fi

# ============================================================================
# Clear WiFi credentials — LAST STEP before shutdown
# (Placed last because this will disconnect SSH-over-WiFi sessions)
# ============================================================================
log_info "Removing WiFi credentials"

# Netplan WiFi configs (Trixie — cloud-init generates these from network-config)
rm -f /etc/netplan/*wifi* /etc/netplan/*wlan* /etc/netplan/*wireless* 2>/dev/null || true
# Remove any netplan config containing a wifis: stanza (catch non-obvious filenames)
grep -rl '^  wifis:' /etc/netplan/ 2>/dev/null | xargs rm -f 2>/dev/null || true

# cloud-init network seed on the boot partition — strip WiFi, keep ethernet
if [ -f /boot/firmware/network-config ]; then
    cat > /boot/firmware/network-config << 'NETEOF'
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: true
      dhcp6: true
      optional: true
NETEOF
    log_info "  Reset /boot/firmware/network-config (WiFi removed)"
fi

# NetworkManager connection profiles (Bookworm+)
rm -f /etc/NetworkManager/system-connections/*.nmconnection 2>/dev/null || true

# Legacy wpa_supplicant (pre-Bookworm or manual config)
for f in /etc/wpa_supplicant/wpa_supplicant*.conf; do
    [ -f "$f" ] && : > "$f"
done

# ============================================================================
# Done
# ============================================================================
# Chroot builds have no init to shut down — /proc and /sys are the host's, so
# `shutdown -h now` here would power off the build machine mid-build. The
# driver (build-image-ci.sh) unmounts and packages once this returns.
if [ "${HS_CHROOT:-0}" = "1" ]; then
    log_info "Image preparation complete (chroot build)"
    echo ""
    echo "=============================================="
    echo "Image ready. The build driver will package it."
    echo "=============================================="
    exit 0
fi

log_info "Image preparation complete — shutting down"
echo ""
echo "=============================================="
echo "Image ready. System is shutting down."
echo ""
echo "NEXT STEPS (after power light goes off):"
echo "=============================================="
echo ""
echo "1. Remove SD card and insert into a Linux or macOS computer"
echo ""
echo "2. Create the image:"
echo "   Linux:  sudo dd if=/dev/sdX of=home-screens.img bs=4M status=progress"
echo "   macOS:  diskutil unmountDisk /dev/diskN"
echo "           sudo dd if=/dev/rdiskN of=home-screens.img bs=4m status=progress"
echo ""
echo "3. Shrink the image:"
echo "   ./shrink-image.sh home-screens.img"
echo ""
echo "4. Compress for distribution:"
echo "   xz -9 -T0 home-screens.img"
echo ""
echo "5. Upload to GitHub release:"
echo "   ./upload-image.sh v1.0.0 home-screens.img.xz"
echo ""
echo "=============================================="

shutdown -h now
