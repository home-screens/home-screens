#!/bin/bash
# Stage 03: Install Dependencies
# Installs all system packages required by Home Screens
# Targets Raspberry Pi OS Lite (64-bit) — Bookworm or Trixie

set -e

log_info() {
    echo "[INFO] $1"
}

log_warn() {
    echo "[WARN] $1"
}

log_info "Installing Home Screens system dependencies"

log_info "Updating package lists"
apt-get update

# ============================================================================
# Package lists
# ============================================================================

# Core system packages
PACKAGES_CORE="
    curl
    git
    ca-certificates
    cloud-guest-utils
    e2fsprogs
"

# Display and kiosk packages
PACKAGES_DISPLAY="
    chromium
    labwc
    wtype
    wlr-randr
"

# Fonts
PACKAGES_FONTS="
    fonts-noto-color-emoji
    fonts-noto-core
"

# Boot splash
PACKAGES_BOOT="
    plymouth
    plymouth-themes
"

# Pi OS Lite extras (not present on Lite by default)
PACKAGES_LITE="
    libpam-systemd
    dbus-user-session
"

# ============================================================================
# Install packages
# ============================================================================

log_info "Installing core packages"
apt-get -y install --no-install-recommends $PACKAGES_CORE

log_info "Installing display and kiosk packages"
apt-get -y install --no-install-recommends $PACKAGES_DISPLAY

log_info "Installing fonts"
apt-get -y install --no-install-recommends $PACKAGES_FONTS

log_info "Installing boot splash packages"
apt-get -y install --no-install-recommends $PACKAGES_BOOT

log_info "Installing Pi OS Lite extras"
apt-get -y install --no-install-recommends $PACKAGES_LITE

# Verify critical Lite packages — kiosk won't work without them
for pkg in libpam-systemd dbus-user-session; do
    if ! dpkg -s "$pkg" &>/dev/null; then
        echo "[ERROR] Required package $pkg is not installed"
        exit 1
    fi
done

# ============================================================================
# Node.js — install version 22 from NodeSource
# ============================================================================
log_info "Checking Node.js version"

NEED_NODEJS=false
NODE_MAJOR=22

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt "$NODE_MAJOR" ]; then
        log_info "Node.js version $NODE_VERSION is too old (need $NODE_MAJOR+)"
        NEED_NODEJS=true
    else
        log_info "Node.js version $NODE_VERSION is sufficient"
    fi
else
    log_info "Node.js not installed"
    NEED_NODEJS=true
fi

if [ "$NEED_NODEJS" = "true" ]; then
    log_info "Installing Node.js $NODE_MAJOR from NodeSource"

    # Install dependencies for HTTPS apt sources
    apt-get -y install --no-install-recommends ca-certificates gnupg

    # Create keyrings directory
    mkdir -p /etc/apt/keyrings

    # Download and verify NodeSource GPG key
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
        gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

    # Add NodeSource repository
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | \
        tee /etc/apt/sources.list.d/nodesource.list

    apt-get update
    apt-get -y install --no-install-recommends nodejs
fi

# Verify Node.js
if command -v node &> /dev/null; then
    log_info "Node.js installed: $(node -v)"
else
    echo "[ERROR] Node.js installation failed"
    exit 1
fi

# ============================================================================
# Cleanup
# ============================================================================
log_info "Cleaning up package cache"
apt-get clean

log_info "Dependencies installed successfully"
