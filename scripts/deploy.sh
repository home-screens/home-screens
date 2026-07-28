#!/usr/bin/env bash
set -euo pipefail

# Home Screens - DEVELOPMENT deploy convenience script.
#
# This is a workstation tool for fast iterating against a Pi via SSH/rsync.
# It is NOT the production upgrade mechanism — production devices upgrade
# themselves via the on-device tarball pipeline (scripts/upgrade.sh, driven
# by the editor's Updates page or POST /api/upgrade). Releases tagged via
# scripts/release.sh build a tarball in CI that the on-device pipeline
# consumes; this script is a separate dev-only path.
#
# Use this when you have SSH access to a Pi and want to push uncommitted
# work without going through a release tag.
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

# --- SSH multiplexing (single login for all ssh/rsync calls) ---
SSH_SOCK="/tmp/deploy-ssh-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_SOCK} -o ControlPersist=yes"
export RSYNC_RSH="ssh ${SSH_OPTS}"
ssh_cmd() { ssh ${SSH_OPTS} "$HOST" "$@"; }

# Open the master connection once, clean up on exit
ssh ${SSH_OPTS} -MNf "$HOST"
trap 'ssh ${SSH_OPTS} -O exit "$HOST" 2>/dev/null; rm -f "${SSH_SOCK}"' EXIT

info "Deploying to ${HOST}:${REMOTE_DIR}"

# --- Restart only ---
if [ "$RESTART_ONLY" = true ]; then
  step "Restarting service..."
  ssh_cmd "sudo systemctl restart home-screens"
  info "Service restarted."
  exit 0
fi

# --- Sync files ---
step "Syncing files..."
# Code only. Device state (installed plugins, secrets, tokens, uploaded
# backgrounds, .env files) is never synced or deleted — mirrors .gitignore:
# data/* and public/backgrounds/* are state except the tracked entries below.
rsync -azP --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '.worktrees' \
  --exclude '*.tsbuildinfo' \
  --exclude '.env*' \
  --include 'data/secrets.example.json' \
  --exclude 'data/*' \
  --include 'public/backgrounds/default.svg' \
  --include 'public/backgrounds/themes/' \
  --include 'public/backgrounds/themes/**' \
  --exclude 'public/backgrounds/*' \
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

# --- Bundle config-check CLI ---
# The Pi installs with --omit=dev (no tsx), so ship the self-contained bundle
# that the launcher (scripts/check-config.mjs) prefers when present.
step "Bundling config-check CLI..."
CHECK_CONFIG_TMPDIR="$(mktemp -d -t check-config)"
(cd "$PROJECT_DIR" && npx esbuild scripts/check-config.ts --bundle --platform=node \
  --format=cjs --outfile="$CHECK_CONFIG_TMPDIR/check-config.cjs" --log-level=warning)
rsync -azP "$CHECK_CONFIG_TMPDIR/check-config.cjs" "$HOST:$REMOTE_DIR/scripts/check-config.cjs"
rm -rf "$CHECK_CONFIG_TMPDIR"

# --- Install dependencies ---
if [ "$SKIP_INSTALL" = false ]; then
  step "Installing dependencies..."
  # .npmrc ships engine-strict=true, so the Pi's npm must meet the
  # engines floor in package.json before npm install can run.
  ssh_cmd "cd $REMOTE_DIR && bash scripts/upgrade.sh ensure-npm && npm install --omit=dev"
fi

# --- Apply system config ---
step "Applying system configuration..."
ssh_cmd "cd $REMOTE_DIR && bash scripts/upgrade.sh setup-system"

# --- Restart service ---
step "Restarting service..."
ssh_cmd "sudo systemctl restart home-screens"

# --- Verify ---
step "Verifying..."
info "Kiosk browser will auto-reload when it detects the new build."
if ssh_cmd "systemctl is-active --quiet home-screens"; then
  echo ""
  REMOTE_IP="${HOST#*@}"
  REMOTE_PORT=$(ssh_cmd "cat ${REMOTE_DIR}/data/port.conf 2>/dev/null || echo 3000" | tr -d '[:space:]')
  info "Deploy complete!"
  echo -e "  ${DIM}Display:${NC}  http://${REMOTE_IP}:${REMOTE_PORT}/display"
  echo -e "  ${DIM}Editor:${NC}   http://${REMOTE_IP}:${REMOTE_PORT}/editor"
  echo ""
else
  warn "Service may not have started correctly."
  ssh_cmd "journalctl -u home-screens -n 20 --no-pager"
fi
