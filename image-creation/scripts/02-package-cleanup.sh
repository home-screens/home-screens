#!/bin/bash
# Stage 02: Package Cleanup
# Removes unnecessary packages to slim down the image

set -e

log_info() {
    echo "[INFO] $1"
}

log_warn() {
    echo "[WARN] $1"
}

# apt-get update and upgrade are handled by build-image.sh before stages run.

log_info "Removing unnecessary packages"

# Packages to remove — conservative, only remove what we're sure about
PACKAGES_REMOVE=""

# Triggerhappy (keyboard shortcut daemon — not needed)
PACKAGES_REMOVE="$PACKAGES_REMOVE triggerhappy"

# Man pages and documentation
PACKAGES_REMOVE="$PACKAGES_REMOVE man-db manpages"

# Remove packages that exist
for pkg in $PACKAGES_REMOVE; do
    if dpkg -l | grep -q "^ii  $pkg "; then
        log_info "Removing: $pkg"
        apt-get -y purge "$pkg" || log_warn "Failed to remove $pkg"
    fi
done

log_info "Running autoremove to clean up dependencies"
apt-get -y autoremove --purge

# Service disabling is handled in stage 05 (configure.sh) which also masks
# critical services. No need to duplicate the list here.

log_info "Package cleanup complete"
