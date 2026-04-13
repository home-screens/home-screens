#!/bin/bash
# Home Screens - Raspberry Pi Image Builder
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/home-screens/home-screens/main/image-creation/build-image.sh | sudo bash
#   curl -fsSL <url> | sudo bash -s -- --img
#
#   Or from a clone:
#     sudo ./build-image.sh [--img]
#
# This script must be run ON the Raspberry Pi that will become the image.
# Start with a fresh Raspberry Pi OS Lite (64-bit) installation.

set -e

# --- Self-download guard (enables: curl -fsSL <url> | sudo bash) ────────
# When running standalone without stage scripts, download them from GitHub
# to a temp directory and re-launch from there.
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd 2>/dev/null || echo "")"
if [ -z "${_SCRIPT_DIR}" ] || [ ! -f "${_SCRIPT_DIR}/scripts/01-base-setup.sh" ]; then
  # Ensure curl is available (bare Trixie Lite may not have it)
  if ! command -v curl &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq curl
  fi
  _TMP="$(mktemp -d)"
  _REPO="home-screens/home-screens"
  _BRANCH="main"
  _BASE="https://raw.githubusercontent.com/${_REPO}/${_BRANCH}/image-creation"
  printf '\n  Downloading image builder files...\n\n'
  mkdir -p "${_TMP}/scripts"
  curl -fsSL "${_BASE}/build-image.sh" -o "${_TMP}/build-image.sh"
  for _f in 01-base-setup.sh 02-package-cleanup.sh 03-install-deps.sh 04-install-app.sh 05-configure.sh 99-finalize.sh; do
    curl -fsSL "${_BASE}/scripts/${_f}" -o "${_TMP}/scripts/${_f}"
  done
  _HS_BOOTSTRAP_TMP="${_TMP}" exec bash "${_TMP}/build-image.sh" "$@"
fi

# Clean up bootstrap temp dir if we were re-launched by the guard above.
if [ -n "${_HS_BOOTSTRAP_TMP:-}" ]; then
  trap 'rm -rf "${_HS_BOOTSTRAP_TMP}"' EXIT
  unset _HS_BOOTSTRAP_TMP
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HS_VERSION="${HS_VERSION:-dev}"
BUILD_IMG=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --img)
            BUILD_IMG=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (sudo ./build-image.sh)"
    exit 1
fi

# Detect platform
detect_platform() {
    MODEL="(not detected)"
    if [ -f /proc/device-tree/model ]; then
        MODEL=$(cat /proc/device-tree/model | tr -d '\0')
        if [[ "$MODEL" == *"Raspberry Pi 5"* ]]; then
            PLATFORM="pi5"
        elif [[ "$MODEL" == *"Raspberry Pi 4"* ]]; then
            PLATFORM="pi4"
        elif [[ "$MODEL" == *"Raspberry Pi Zero 2"* ]]; then
            PLATFORM="pizero2"
        else
            PLATFORM="pi"
        fi
    else
        PLATFORM="unknown"
    fi
    log_info "Detected platform: $PLATFORM ($MODEL)"
}

# Run a build stage
run_stage() {
    local stage_script="$1"
    local stage_name=$(basename "$stage_script" .sh)

    if [ ! -f "$stage_script" ]; then
        log_warn "Stage script not found: $stage_script"
        return 0
    fi

    echo ""
    echo "=============================================="
    log_info "Running stage: $stage_name"
    echo "=============================================="

    if bash "$stage_script"; then
        log_info "Stage $stage_name completed successfully"
    else
        log_error "Stage $stage_name failed!"
        exit 1
    fi
}

# Main build process
main() {
    echo ""
    echo "╔════════════════════════════════════════════════╗"
    printf "║   Home Screens - Image Builder  %-13s ║\n" "$HS_VERSION"
    echo "╚════════════════════════════════════════════════╝"
    echo ""

    detect_platform

    if [ "$PLATFORM" == "unknown" ]; then
        log_error "Unknown platform. This script must run on a Raspberry Pi."
        exit 1
    fi

    # Ensure base system is fully up to date before building.
    # Trixie Lite ships without git/vim — install prerequisites here so
    # the README clone step works on a bare image.
    echo ""
    echo "=============================================="
    log_info "Updating base system"
    echo "=============================================="
    apt-get update
    apt-get -y upgrade
    apt-get -y install --no-install-recommends git vim curl
    log_info "Base system updated"

    # Export variables for stage scripts
    export SCRIPT_DIR
    export BUILD_IMG

    # Run build stages in order
    for script in "$SCRIPT_DIR/scripts/"[0-9]*.sh; do
        # Skip finalize stage unless building image
        if [[ "$script" == *"99-"* ]] && [ "$BUILD_IMG" != "true" ]; then
            log_info "Skipping finalize stage (not building image)"
            continue
        fi
        run_stage "$script"
    done

    echo ""
    echo "=============================================="
    if [ "$BUILD_IMG" == "true" ]; then
        log_info "Image build complete!"
        log_info "Shutdown the Pi and create image from SD card"
    else
        log_info "Development build complete!"
        log_info "Home Screens should now be running at http://$(hostname -I | awk '{print $1}'):3000"
    fi
    echo "=============================================="
}

main "$@"
