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

# Configure WiFi from /boot/firmware/wifi.txt if present.
# Users create this file on the FAT32 boot partition after flashing the image.
# Format: SSID=..., PASSWORD=..., COUNTRY=... (one per line, PASSWORD optional
# for open networks, COUNTRY optional — defaults to US).
WIFI_FILE="/boot/firmware/wifi.txt"
if [ -f "${WIFI_FILE}" ]; then
    log "Found wifi.txt — configuring WiFi"
    WIFI_SSID="" WIFI_PASS="" WIFI_COUNTRY="" WIFI_HIDDEN=""
    while IFS= read -r line; do
        # Skip comments and blank lines
        case "$line" in \#*|"") continue ;; esac
        key="${line%%=*}"
        value="${line#*=}"
        key=$(echo "$key" | tr -d '[:space:]')
        value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        case "$key" in
            SSID)     WIFI_SSID="$value" ;;
            PASSWORD) WIFI_PASS="$value" ;;
            COUNTRY)  WIFI_COUNTRY="$value" ;;
            HIDDEN)   WIFI_HIDDEN="$value" ;;
        esac
    done < "${WIFI_FILE}"

    if [ -n "${WIFI_SSID}" ]; then
        IMAGER_CUSTOM="/usr/lib/raspberrypi-sys-mods/imager_custom"
        if [ -x "${IMAGER_CUSTOM}" ]; then
            WLAN_ARGS=""
            [ "${WIFI_HIDDEN}" = "true" ] && WLAN_ARGS="${WLAN_ARGS} --hidden"
            if [ -n "${WIFI_PASS}" ]; then
                "${IMAGER_CUSTOM}" set_wlan ${WLAN_ARGS} --plain \
                    "${WIFI_SSID}" "${WIFI_PASS}" ${WIFI_COUNTRY:+"${WIFI_COUNTRY}"} \
                    && log "WiFi configured via imager_custom" \
                    || log "imager_custom set_wlan failed"
            else
                "${IMAGER_CUSTOM}" set_wlan ${WLAN_ARGS} --plain \
                    "${WIFI_SSID}" "" ${WIFI_COUNTRY:+"${WIFI_COUNTRY}"} \
                    && log "WiFi configured via imager_custom (open network)" \
                    || log "imager_custom set_wlan failed"
            fi
        else
            # Fallback: write the nmconnection file directly
            log "imager_custom not found — writing nmconnection directly"
            CONNFILE="/etc/NetworkManager/system-connections/preconfigured.nmconnection"
            cat > "${CONNFILE}" << NMEOF
[connection]
id=preconfigured
uuid=$(cat /proc/sys/kernel/random/uuid)
type=wifi
[wifi]
mode=infrastructure
ssid=${WIFI_SSID}
hidden=${WIFI_HIDDEN:-false}
[ipv4]
method=auto
[ipv6]
addr-gen-mode=default
method=auto
[proxy]
NMEOF
            if [ -n "${WIFI_PASS}" ]; then
                cat >> "${CONNFILE}" << NMEOF
[wifi-security]
key-mgmt=wpa-psk
psk=${WIFI_PASS}
NMEOF
            fi
            chmod 600 "${CONNFILE}"
        fi

        # Tell NetworkManager to pick up the new connection and activate it
        nmcli connection reload 2>/dev/null || true
        nmcli connection up preconfigured 2>/dev/null \
            && log "WiFi connection activated" \
            || log "WiFi activation deferred — will connect on next boot"
    else
        log "wifi.txt found but SSID is empty — skipping"
    fi

    # Remove wifi.txt (contains plaintext credentials on the FAT32 partition)
    rm -f "${WIFI_FILE}"
    log "Removed wifi.txt from boot partition"
else
    log "No wifi.txt found — skipping WiFi provisioning"
fi

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
# Drop wifi.txt.example on the boot partition so users know the format
# ============================================================================
log_info "Creating wifi.txt.example on boot partition"
cat > /boot/firmware/wifi.txt.example << 'WIFIEOF'
# Home Screens WiFi Configuration
# Rename this file to wifi.txt and fill in your details.
# The Pi will connect to WiFi on first boot and delete this file.
#
# SSID     — Your WiFi network name (required)
# PASSWORD — Your WiFi password (omit for open networks)
# COUNTRY  — Two-letter country code, e.g. US, GB, DE (optional, defaults to US)
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
