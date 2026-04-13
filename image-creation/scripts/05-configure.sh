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

# Reload systemd in case setup-system added new unit files
systemctl daemon-reload

# Start the service so 99-finalize.sh can verify it
if systemctl is-enabled --quiet home-screens 2>/dev/null; then
    systemctl restart home-screens 2>/dev/null || log_warn "home-screens failed to start (may need config)"
    log_info "home-screens service restarted"
else
    log_warn "home-screens service not enabled"
fi

log_info "System configuration complete"
