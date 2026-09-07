#!/bin/bash
# Stage 01: Base System Setup
# Configures hostname, locale, timezone, user, and SSH

set -e

log_info() {
    echo "[INFO] $1"
}

log_info "Setting hostname to 'home-screens'"
if [ "${HS_CHROOT:-0}" = "1" ]; then
    # hostnamectl needs systemd-hostnamed over D-Bus. Write the file it would
    # write; the transient hostname is meaningless for an image that has not
    # booted yet.
    echo "home-screens" > /etc/hostname
else
    hostnamectl set-hostname home-screens
fi

# Update /etc/hosts
if ! grep -q "home-screens" /etc/hosts; then
    sed -i 's/127.0.1.1.*/127.0.1.1\thome-screens/' /etc/hosts
fi
# If no 127.0.1.1 entry existed, append one
if ! grep -q "127.0.1.1" /etc/hosts; then
    echo "127.0.1.1	home-screens" >> /etc/hosts
fi

# Stop cloud-init from re-applying its cached hostname on every boot.
# Without this, /etc/hostname gets rewritten from /boot/firmware/user-data
# every reboot, silently undoing any hostnamectl change made by the editor.
log_info "Disabling cloud-init hostname management"
mkdir -p /etc/cloud/cloud.cfg.d
echo "preserve_hostname: true" > /etc/cloud/cloud.cfg.d/99-home-screens-hostname.cfg

# Same fix for network config: cloud-init's network module rewrites
# /etc/netplan from the NoCloud datasource on every boot, deleting any
# Wi-Fi profile NetworkManager added via the editor (stored as
# /etc/netplan/90-NM-<uuid>.yaml on this stack).
log_info "Disabling cloud-init network management"
echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-home-screens-network.cfg

# Pi OS ships NetworkManager with the WiFi radio switched off
# (WirelessEnabled=false in its state file) and leaves it to the first-boot
# wizard or Imager to turn it on when a country is chosen. On this image the
# only thing that ever did that was the wifi.txt path, so a Pi started on
# Ethernet had no way to add WiFi from the editor: scans returned nothing.
# NetworkManager persists this flag and restores it on every boot, so the
# image ships with it on. The regulatory domain is set when a network is
# joined (wifi.txt today, the editor's Network page later), not here.
log_info "Enabling the WiFi radio in NetworkManager's saved state"
NM_STATE="/var/lib/NetworkManager/NetworkManager.state"
mkdir -p "$(dirname "${NM_STATE}")"
if [ -f "${NM_STATE}" ]; then
    sed -i '/^WirelessEnabled=/d' "${NM_STATE}"
    grep -q '^\[main\]' "${NM_STATE}" || printf '[main]\n' >> "${NM_STATE}"
else
    printf '[main]\n' > "${NM_STATE}"
fi
sed -i '/^\[main\]/a WirelessEnabled=true' "${NM_STATE}"

log_info "Creating home-screens user"
if ! id "hs" &>/dev/null; then
    useradd -m -s /bin/bash hs
    echo "hs:screens" | chpasswd
    usermod -aG video,render,audio,sudo hs
    log_info "User 'hs' created with password 'screens'"
else
    log_info "User 'hs' already exists"
fi

# Pi OS gives the account its first-boot wizard creates passwordless sudo
# through /etc/sudoers.d/010_pi-nopasswd (userconf-pi renames the entry to
# that account). hs comes from useradd and never goes through the wizard, so
# it only gets the %sudo group rule, which asks for a password. The
# home-screens service runs as hs and calls sudo for updates (systemctl
# restart, setup-system), WiFi changes and hostname changes; the updater's
# preflight runs `sudo -n true` first and refuses to start without this.
# Same shape and name as the Pi OS file so it reads as the standard grant.
log_info "Granting hs passwordless sudo (the service runs updates and network changes through sudo)"
SUDOERS_DROPIN="/etc/sudoers.d/010_hs-nopasswd"
mkdir -p /etc/sudoers.d
echo "hs ALL=(ALL) NOPASSWD: ALL" > "${SUDOERS_DROPIN}"
chmod 0440 "${SUDOERS_DROPIN}"
# A sudoers file that does not parse is silently ignored by sudo, which would
# put the image right back where it started. Fail the build instead.
visudo -cf "${SUDOERS_DROPIN}" >/dev/null

# Raspberry Pi OS ships getty@tty1 DISABLED and userconfig.service ENABLED:
# the first-boot wizard is what enables getty@tty1 once an account exists (see
# `systemctl disable userconfig` / `systemctl enable getty@tty1` in
# /usr/bin/cancel-rename). We create 'hs' with useradd above, so that wizard
# never runs. Left alone it hangs forever on a whiptail dialog nobody can see,
# tty1 never gets a login shell, autologin never fires, and the kiosk never
# starts — a black screen with a clean journal.
#
# Do NOT call cancel-rename to do this. It routes through
# `raspi-config nonint do_boot_behaviour B1` (console, no autologin), which
# deletes /etc/systemd/system/getty@tty1.service.d/ and takes the autologin
# drop-in that stage 04's setup-system writes with it.
#
# Both calls only write symlinks, so they are legal under HS_CHROOT.
log_info "Enabling console login on tty1 (Pi OS leaves it disabled for its wizard)"
systemctl disable userconfig.service 2>/dev/null || true
systemctl enable getty@tty1.service

log_info "Configuring SSH for password authentication"
# Remove any drop-in configs that override PasswordAuthentication
# (Pi OS Bookworm ships with sshd_config.d/ files that set it to 'no')
rm -f /etc/ssh/sshd_config.d/*.conf
# Replace any existing PasswordAuthentication line (commented or not)
sed -i 's/^#\?PasswordAuthentication\b.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
# If no line existed at all, append it
if ! grep -q "^PasswordAuthentication" /etc/ssh/sshd_config; then
    echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config
fi
systemctl enable ssh

log_info "Setting locale to en_US.UTF-8"
sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
locale-gen
update-locale LANG=en_US.UTF-8

log_info "Setting timezone to UTC (configurable via web editor)"
if [ "${HS_CHROOT:-0}" = "1" ]; then
    # timedatectl needs systemd-timedated over D-Bus. These two writes are what
    # it does.
    ln -sf /usr/share/zoneinfo/UTC /etc/localtime
    echo "UTC" > /etc/timezone
else
    timedatectl set-timezone UTC
fi

log_info "Configuring kernel parameters"
cat > /etc/sysctl.d/99-home-screens.conf << 'EOF'
# Home Screens kernel parameters

# Increase inotify watches for file monitoring
fs.inotify.max_user_watches=524288
EOF

# In a chroot, /proc is the BUILD HOST's — `sysctl --system` would apply these
# settings to the build machine, not the image. The .conf file above is what
# matters; it takes effect when the device boots.
if [ "${HS_CHROOT:-0}" = "1" ]; then
    log_info "Chroot build — sysctl settings apply on first boot"
else
    sysctl --system
fi

log_info "Base setup complete"
