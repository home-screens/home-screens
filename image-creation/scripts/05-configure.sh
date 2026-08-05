#!/bin/bash
# Stage 05: System Configuration
# OS-level kiosk optimizations (journal, swap, services, tmpfs, boot speed,
# WiFi hardening) are handled by upgrade.sh setup-system, which stage 04
# already invokes. This stage restarts the service so stage 99 can verify it.

set -e

log_info() {
    echo "[INFO] $1"
}

log_warn() {
    echo "[WARN] $1"
}

# Chroot builds have no running init: daemon-reload and restart both fail, and
# this script runs under `set -e`. Units are read fresh when the device boots,
# so there is nothing to reload. 99-finalize.sh's verification is filesystem
# checks only, so skipping the restart costs no coverage here — the built image
# is exercised by the boot smoke test instead.
if [ "${HS_CHROOT:-0}" = "1" ]; then
    log_info "Chroot build — skipping daemon-reload and service start"
else
    # Reload systemd in case setup-system added new unit files
    systemctl daemon-reload

    # Start the service so 99-finalize.sh can verify it
    if systemctl is-enabled --quiet home-screens 2>/dev/null; then
        systemctl restart home-screens 2>/dev/null || log_warn "home-screens failed to start (may need config)"
        log_info "home-screens service restarted"
    else
        log_warn "home-screens service not enabled"
    fi
fi

log_info "System configuration complete"
