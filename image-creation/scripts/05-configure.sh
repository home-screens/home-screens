#!/bin/bash
# Stage 05: System Configuration
# Applies OS-level optimizations for production kiosk use.
#
# NOTE: Service configs (systemd, kiosk, Plymouth, autologin) are handled
# by upgrade.sh setup-system in stage 04. This script only handles
# OS-level tuning that setup-system doesn't cover.

set -e

log_info() {
    echo "[INFO] $1"
}

log_warn() {
    echo "[WARN] $1"
}

log_info "Applying OS-level optimizations for production"

# ============================================================================
# Systemd Journal — reduce disk writes and size
# ============================================================================
log_info "Configuring systemd journal (volatile, 16MB max)"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/home-screens.conf << 'EOF'
[Journal]
# Use volatile storage (RAM) to reduce SD card writes
Storage=volatile
# Limit journal size
RuntimeMaxUse=16M
RuntimeMaxFileSize=4M
# Reduce sync frequency
SyncIntervalSec=5min
EOF

# ============================================================================
# Swap — use Pi OS's native rpi-swap (zram-generator based)
# Pi OS ships with rpi-swap which manages a zram swap device via
# systemd-zram-setup@zram0.service.  No extra packages needed.
# We just remove the legacy dphys-swapfile (disk-backed) if present, and
# apply sysctl tuning for compressed-RAM swap.
# ============================================================================
log_info "Configuring swap (using native rpi-swap / zram-generator)"

# Remove zram-tools if present — it conflicts with the native zram-generator
if dpkg -l zram-tools &>/dev/null; then
    apt-get -y purge zram-tools 2>/dev/null || true
    log_info "  Removed conflicting zram-tools package"
fi

cat > /etc/sysctl.d/99-home-screens-zram.conf << 'EOF'
# Swap tuning for zram (compressed RAM swap)
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF

# Remove legacy disk-backed swap
if systemctl is-active --quiet dphys-swapfile 2>/dev/null; then
    systemctl stop dphys-swapfile
fi
if systemctl is-enabled --quiet dphys-swapfile 2>/dev/null; then
    systemctl disable dphys-swapfile
fi
apt-get -y purge dphys-swapfile 2>/dev/null || true
rm -f /var/swap
log_info "  Swap configured (native rpi-swap + sysctl tuning)"

# ============================================================================
# Disable unnecessary services
# ============================================================================
log_info "Disabling unnecessary services"

SERVICES_DISABLE="
    apt-daily.service
    apt-daily-upgrade.service
    apt-daily.timer
    apt-daily-upgrade.timer
    man-db.timer
    dpkg-db-backup.timer
    rsyslog.service
    syslog.service
    bluetooth.service
    hciuart.service
    bthelper@.service
    ModemManager.service
    triggerhappy.service
    triggerhappy.socket
    systemd-journal-flush.service
    smartmontools.service
    smartd.service
    serial-getty@ttyAMA0.service
    serial-getty@ttyS0.service
"

for service in $SERVICES_DISABLE; do
    if systemctl list-unit-files | grep -q "^$service"; then
        systemctl disable "$service" 2>/dev/null || true
        systemctl stop "$service" 2>/dev/null || true
        log_info "  Disabled: $service"
    fi
done

# Mask services that might get re-enabled by dependencies
SERVICES_MASK="
    rsyslog.service
    ModemManager.service
    bluetooth.service
"

for service in $SERVICES_MASK; do
    if systemctl list-unit-files | grep -q "^$service"; then
        systemctl mask "$service" 2>/dev/null || true
        log_info "  Masked: $service"
    fi
done

# Mask suspend/hibernate — brcmfmac can't recover from suspend, and a kiosk
# device should never sleep.
for target in sleep.target suspend.target hibernate.target hybrid-sleep.target; do
    systemctl mask "$target" 2>/dev/null || true
done
log_info "  Masked suspend/hibernate targets"

# ============================================================================
# Storage-specific optimizations
# ============================================================================
log_info "Configuring storage-specific services"

ROOT_PART=$(findmnt -n -o SOURCE / 2>/dev/null || echo "")
ROOT_DISK=$(lsblk -no PKNAME "$ROOT_PART" 2>/dev/null || echo "")

if [[ "$ROOT_DISK" == mmcblk* ]]; then
    log_info "  Detected SD card storage ($ROOT_DISK)"
    systemctl disable fstrim.timer 2>/dev/null || true
    systemctl disable e2scrub_all.timer 2>/dev/null || true
    log_info "  Disabled fstrim/e2scrub (SD card)"
elif [[ -n "$ROOT_DISK" ]]; then
    log_info "  Detected non-SD storage ($ROOT_DISK)"
    systemctl enable fstrim.timer 2>/dev/null || true
    systemctl enable e2scrub_all.timer 2>/dev/null || true
    log_info "  Enabled fstrim/e2scrub (SSD/NVMe)"
else
    log_warn "  Could not detect storage type, defaulting to SD card behavior"
    systemctl disable fstrim.timer 2>/dev/null || true
    systemctl disable e2scrub_all.timer 2>/dev/null || true
fi

# ============================================================================
# File descriptor limits
# ============================================================================
log_info "Configuring file descriptor limits"
cat > /etc/security/limits.d/99-home-screens.conf << 'EOF'
# Home Screens file descriptor limits
hs soft nofile 65536
hs hard nofile 65536
EOF

# ============================================================================
# Configure tmpfs for volatile directories
# ============================================================================
log_info "Configuring tmpfs mounts"

if ! grep -q "# Home Screens tmpfs" /etc/fstab; then
    cat >> /etc/fstab << 'EOF'

# Home Screens tmpfs mounts — reduce SD card writes
tmpfs /tmp tmpfs defaults,noatime,nosuid,nodev,size=256M,mode=1777 0 0
tmpfs /var/tmp tmpfs defaults,noatime,nosuid,nodev,size=128M,mode=1777 0 0
EOF
    log_info "  Added tmpfs mounts to fstab"
else
    log_info "  tmpfs mounts already configured"
fi

# ============================================================================
# WiFi — brcmfmac driver stability (BCM43455 on Pi 4/5)
# ============================================================================
# Official RPi Foundation fix: https://github.com/RPi-Distro/firmware-nonfree/commit/40dea60
# Also adopted by Home Assistant OS (PR #4056).
log_info "Configuring brcmfmac driver options"
mkdir -p /etc/modprobe.d
cat > /etc/modprobe.d/brcmfmac.conf << 'EOF'
# roamoff=1: Disable firmware internal roaming — on mesh networks the AP
# should control roaming, not the client. The firmware roaming engine fights
# with AP-initiated BSS transitions and causes disconnects.
# feature_disable=0x282000: Disable three buggy firmware features:
#   - FWSUP (firmware WPA supplicant offload) — conflicts with host wpa_supplicant
#   - MONITOR_FMT_HW_RX_HDR — unnecessary hardware RX header formatting
#   - DUMP_OBSS (overlapping BSS scan) — causes "set chanspec fail, reason -52"
#     errors and 5GHz crashes on kernel 6.6+
options brcmfmac roamoff=1 feature_disable=0x282000
EOF

# ============================================================================
# WiFi — reserve kernel memory for network buffers
# ============================================================================
# Under memory pressure, network packet allocation can fail, manifesting as
# WiFi drops. Reserve 16MB for kernel allocations (default ~3MB is too low).
log_info "Configuring kernel memory reservation for WiFi stability"
cat > /etc/sysctl.d/98-wifi-memory.conf << 'EOF'
vm.min_free_kbytes = 16384
EOF

# ============================================================================
# WiFi — disable power management (causes latency spikes and disconnects)
# ============================================================================
log_info "Configuring WiFi reliability"
mkdir -p /etc/NetworkManager/conf.d
cat > /etc/NetworkManager/conf.d/wifi-powersave.conf << 'EOF'
[connection]
# Disable WiFi power save — the brcmfmac driver aggressively sleeps the radio,
# causing 500-800ms latency spikes and repeated association failures on boot.
# No benefit on a wall-powered kiosk device.
# Values: 1=default, 2=disable, 3=enable
wifi.powersave = 2

[device-wifi]
match-device=type:wifi
# Disable scan MAC randomization — mesh APs (Google/Nest WiFi) can reject
# or get confused by randomized MACs, causing association failures.
wifi.scan-rand-mac-address=no

[connection-wifi-default]
match-device=type:wifi
wifi.cloned-mac-address=preserve
# Disable IPv6 — brcmfmac handles IPv6 multicast poorly; neighbor discovery
# traffic triggers radio issues and confuses NM connectivity state.
ipv6.method=disabled
EOF
log_info "  WiFi power management, MAC randomization, and IPv6 configured"

# ============================================================================
# WiFi — infinite autoconnect retries
# ============================================================================
# NM default is 4 retries then give up permanently. On mesh networks,
# AP steering causes brief disconnects that burn through
# all retries in seconds, leaving a headless display offline until reboot.
# A NetworkManager dispatcher script sets retries=0 (infinite) on any WiFi
# connection that activates — this covers the "preconfigured" connection
# from Pi Imager and any user-created connections.
log_info "Configuring WiFi autoconnect retries (infinite)"
mkdir -p /etc/NetworkManager/dispatcher.d
cat > /etc/NetworkManager/dispatcher.d/99-wifi-autoconnect << 'DISPEOF'
#!/bin/bash
# Set infinite autoconnect retries on WiFi connections.
# Runs when any interface comes up; only acts on wifi type.
[ "$2" != "up" ] && exit 0
CONN_TYPE=$(nmcli -g connection.type connection show "$CONNECTION_UUID" 2>/dev/null)
[ "$CONN_TYPE" != "802-11-wireless" ] && exit 0
CURRENT=$(nmcli -g connection.autoconnect-retries connection show "$CONNECTION_UUID" 2>/dev/null)
[ "$CURRENT" = "0" ] && exit 0
nmcli connection modify "$CONNECTION_UUID" connection.autoconnect-retries 0 2>/dev/null
nmcli connection modify "$CONNECTION_UUID" 802-11-wireless.powersave 2 2>/dev/null
DISPEOF
chmod +x /etc/NetworkManager/dispatcher.d/99-wifi-autoconnect
log_info "  WiFi autoconnect retries set to infinite"

# ============================================================================
# WiFi — connectivity watchdog
# ============================================================================
# Pings the default gateway every 2 minutes. If unreachable, escalates through
# NM reconnect → interface cycle → driver reload.
log_info "Installing WiFi watchdog"
cat > /usr/local/bin/wifi-watchdog.sh << 'WDEOF'
#!/bin/bash
# WiFi watchdog for Home Screens display
GATEWAY=$(ip route show default 2>/dev/null | awk '/default via/ {print $3; exit}')
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
logger -t $LOG_TAG "Driver reloaded, connection attempt sent"
WDEOF
chmod +x /usr/local/bin/wifi-watchdog.sh

cat > /etc/systemd/system/wifi-watchdog.service << 'EOF'
[Unit]
Description=WiFi connectivity watchdog
After=NetworkManager.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/wifi-watchdog.sh
EOF

cat > /etc/systemd/system/wifi-watchdog.timer << 'EOF'
[Unit]
Description=Run WiFi watchdog every 2 minutes

[Timer]
OnBootSec=60
OnUnitActiveSec=120

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable wifi-watchdog.timer
log_info "  WiFi watchdog installed and enabled"

# ============================================================================
# Boot optimization — disable wait for network
# ============================================================================
log_info "Configuring boot optimizations"

if systemctl is-enabled --quiet systemd-networkd-wait-online.service 2>/dev/null; then
    systemctl disable systemd-networkd-wait-online.service 2>/dev/null || true
    log_info "  Disabled systemd-networkd-wait-online"
fi

if systemctl is-enabled --quiet NetworkManager-wait-online.service 2>/dev/null; then
    systemctl disable NetworkManager-wait-online.service 2>/dev/null || true
    log_info "  Disabled NetworkManager-wait-online"
fi

# Use NetworkManager instead of dhcpcd (if both exist)
if systemctl is-enabled --quiet dhcpcd.service 2>/dev/null; then
    if systemctl is-enabled --quiet NetworkManager.service 2>/dev/null; then
        systemctl disable dhcpcd.service 2>/dev/null || true
        log_info "  Disabled dhcpcd (using NetworkManager)"
    fi
fi

# ============================================================================
# Apply sysctl settings
# ============================================================================
log_info "Applying sysctl settings"
sysctl --system > /dev/null 2>&1 || true

# ============================================================================
# Reload systemd and start service
# ============================================================================
log_info "Reloading systemd daemon"
systemctl daemon-reload

if systemctl is-enabled --quiet home-screens 2>/dev/null; then
    systemctl restart home-screens 2>/dev/null || log_warn "  home-screens failed to start (may need config)"
    log_info "  home-screens service restarted"
else
    log_warn "  home-screens service not enabled"
fi

log_info "System configuration complete"
