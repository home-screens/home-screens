#!/bin/bash
# Stage 01: Base System Setup
# Configures hostname, locale, timezone, user, and SSH

set -e

log_info() {
    echo "[INFO] $1"
}

log_info "Setting hostname to 'home-screens'"
hostnamectl set-hostname home-screens

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

log_info "Creating home-screens user"
if ! id "hs" &>/dev/null; then
    useradd -m -s /bin/bash hs
    echo "hs:screens" | chpasswd
    usermod -aG video,render,audio,sudo hs
    log_info "User 'hs' created with password 'screens'"
else
    log_info "User 'hs' already exists"
fi

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
timedatectl set-timezone UTC

log_info "Configuring kernel parameters"
cat > /etc/sysctl.d/99-home-screens.conf << 'EOF'
# Home Screens kernel parameters

# Increase inotify watches for file monitoring
fs.inotify.max_user_watches=524288
EOF

sysctl --system

log_info "Base setup complete"
