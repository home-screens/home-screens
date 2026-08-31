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

log_info "Creating home-screens user"
if ! id "hs" &>/dev/null; then
    useradd -m -s /bin/bash hs
    echo "hs:screens" | chpasswd
    usermod -aG video,render,audio,sudo hs
    log_info "User 'hs' created with password 'screens'"
else
    log_info "User 'hs' already exists"
fi

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
