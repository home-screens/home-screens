#!/usr/bin/env bash
set -euo pipefail

# Home Screens - Deploy to Raspberry Pi
# Syncs code, installs dependencies, builds, and restarts the service.
#
# Usage:
#   ./scripts/deploy.sh                          # deploy to default host
#   ./scripts/deploy.sh -h signal@192.168.86.50  # deploy to specific host
#   ./scripts/deploy.sh --skip-install            # skip npm install
#   ./scripts/deploy.sh --restart-only            # just restart the service

DEFAULT_HOST="signal@192.168.86.175"
REMOTE_DIR="/opt/home-screens/current"
SKIP_INSTALL=false
RESTART_ONLY=false
HOST=""

# --- Shared functions ---
source "$(dirname "$0")/lib/common.sh"

usage() {
  echo "Usage: $0 [options]"
  echo ""
  echo "Options:"
  echo "  -h, --host HOST    Deploy target (default: ${DEFAULT_HOST})"
  echo "  --skip-install     Skip npm install on remote"
  echo "  --restart-only     Just restart the service, no sync"
  echo "  --help             Show this help"
  exit 0
}

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--host)       HOST="$2"; shift 2 ;;
    --skip-install)  SKIP_INSTALL=true; shift ;;
    --restart-only)  RESTART_ONLY=true; shift ;;
    --help)          usage ;;
    *)               error "Unknown option: $1" ;;
  esac
done

HOST="${HOST:-$DEFAULT_HOST}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

info "Deploying to ${HOST}:${REMOTE_DIR}"

# --- Restart only ---
if [ "$RESTART_ONLY" = true ]; then
  step "Restarting service..."
  ssh "$HOST" "sudo systemctl restart home-screens"
  info "Service restarted."
  exit 0
fi

# --- Sync files ---
step "Syncing files..."
rsync -azP --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '*.tsbuildinfo' \
  --exclude '.env.local' \
  --exclude 'data/config.json' \
  --exclude 'data/google-tokens.json' \
  --exclude 'data/client*' \
  --exclude 'data/secrets.json' \
  --exclude 'data/auth.json' \
  --exclude 'data/backups' \
  --exclude 'data/background-cache.json' \
  --exclude 'data/chores.json' \
  --exclude 'data/chore-completions.json' \
  --exclude 'data/kiosk.conf' \
  --exclude 'data/port.conf' \
  --exclude 'public/backgrounds/*.jpg' \
  --exclude 'public/backgrounds/*.jpeg' \
  --exclude 'public/backgrounds/*.png' \
  --exclude 'public/backgrounds/*.webp' \
  --exclude '.emulate' \
  --exclude 'scripts/emulate-install.sh' \
  "$PROJECT_DIR/" "$HOST:$REMOTE_DIR/"

# --- Build locally ---
step "Building locally..."
cd "$PROJECT_DIR" && npm run build

# --- Sync build output ---
step "Syncing build output..."
rsync -azP --delete \
  --exclude 'cache' \
  --exclude 'standalone' \
  --exclude '/node_modules' \
  "$PROJECT_DIR/.next/" "$HOST:$REMOTE_DIR/.next/"

# --- Install dependencies ---
if [ "$SKIP_INSTALL" = false ]; then
  step "Installing dependencies..."
  ssh "$HOST" "cd $REMOTE_DIR && npm install --omit=dev"
fi

# --- Apply system config ---
step "Applying system configuration..."
ssh "$HOST" "cd $REMOTE_DIR && bash scripts/upgrade.sh setup-system"

# --- Restart service ---
step "Restarting service..."
ssh "$HOST" "sudo systemctl restart home-screens"

# --- Verify ---
step "Verifying..."
info "Kiosk browser will auto-reload when it detects the new build."
if ssh "$HOST" "systemctl is-active --quiet home-screens"; then
  echo ""
  REMOTE_IP="${HOST#*@}"
  REMOTE_PORT=$(ssh "$HOST" "cat ${REMOTE_DIR}/data/port.conf 2>/dev/null || echo 3000" | tr -d '[:space:]')
  info "Deploy complete!"
  echo -e "  ${DIM}Display:${NC}  http://${REMOTE_IP}:${REMOTE_PORT}/display"
  echo -e "  ${DIM}Editor:${NC}   http://${REMOTE_IP}:${REMOTE_PORT}/editor"
  echo ""
else
  warn "Service may not have started correctly."
  ssh "$HOST" "journalctl -u home-screens -n 20 --no-pager"
fi
