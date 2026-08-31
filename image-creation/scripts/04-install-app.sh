#!/bin/bash
# Stage 04: Install Home Screens
# Downloads a release tarball from GitHub (or uses local source) and installs it.
#
# Environment variables:
#   HS_BRANCH         - Git tag/branch for release download (default: latest)
#   HS_LOCAL          - Set to "true" to use local repo instead of downloading
#   HS_TARBALL        - Path to an already-built release tarball. Skips both the
#                       download and the local build. Used by CI, where the
#                       release workflow has already built and checksummed the
#                       exact artifact users will download.
#   HS_TARBALL_SHA256 - Expected SHA-256 of HS_TARBALL. Verified when set.
#
# The script downloads from GitHub by default to ensure a clean build.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_CREATION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

REPO="home-screens/home-screens"
INSTALL_BASE="/opt/home-screens"
APP_DIR="${INSTALL_BASE}/current"
HS_BRANCH="${HS_BRANCH:-}"
HS_LOCAL="${HS_LOCAL:-false}"
HS_TARBALL="${HS_TARBALL:-}"
HS_TARBALL_SHA256="${HS_TARBALL_SHA256:-}"

# The user created in stage 01
APP_USER="hs"

log_info() {
    echo "[INFO] $1"
}

log_warn() {
    echo "[WARN] $1"
}

log_error() {
    echo "[ERROR] $1"
}

# ============================================================================
# Create install directory
# ============================================================================
log_info "Creating install directory at ${INSTALL_BASE}"
mkdir -p "${INSTALL_BASE}"
chown "${APP_USER}:${APP_USER}" "${INSTALL_BASE}"

# ============================================================================
# Install Home Screens
# ============================================================================
if [[ -n "$HS_TARBALL" ]]; then
    # Install from an already-built tarball (CI path).
    log_info "Installing from tarball: ${HS_TARBALL}"

    if [[ ! -f "$HS_TARBALL" ]]; then
        log_error "HS_TARBALL does not exist: ${HS_TARBALL}"
        exit 1
    fi

    if [[ -n "$HS_TARBALL_SHA256" ]]; then
        log_info "Verifying checksum..."
        ACTUAL_HASH=$(sha256sum "$HS_TARBALL" | awk '{print $1}')
        if [[ "$ACTUAL_HASH" != "$HS_TARBALL_SHA256" ]]; then
            log_error "Checksum verification FAILED for ${HS_TARBALL}"
            log_error "  expected: ${HS_TARBALL_SHA256}"
            log_error "  actual:   ${ACTUAL_HASH}"
            exit 1
        fi
        log_info "Checksum OK"
    else
        log_warn "No HS_TARBALL_SHA256 given — skipping verification"
    fi

    # Extract to staging, then swap into place. The caller owns HS_TARBALL, so
    # unlike the download path we must not delete it.
    STAGING_DIR=$(mktemp -d /tmp/home-screens-staging.XXXXXX)
    trap 'rm -rf "${STAGING_DIR}" 2>/dev/null' EXIT

    log_info "Extracting..."
    tar -xzf "${HS_TARBALL}" -C "${STAGING_DIR}"

    rm -rf "${APP_DIR}"
    mv "${STAGING_DIR}" "${APP_DIR}"
    trap - EXIT

    log_info "Tarball installed to ${APP_DIR}"

elif [[ "$HS_LOCAL" == "true" ]]; then
    # Use local repository (for development testing)
    REPO_DIR="$(cd "$IMAGE_CREATION_DIR/.." && pwd)"
    log_warn "Using LOCAL repository at $REPO_DIR"
    log_warn "This may include uncommitted changes — use HS_LOCAL=false for production"

    if [[ ! -f "$REPO_DIR/package.json" ]]; then
        log_error "Local repository not found or incomplete"
        log_error "Expected package.json at $REPO_DIR"
        exit 1
    fi

    # Build in a temp copy to avoid creating root-owned files in the dev repo
    log_info "Building from local source..."
    BUILD_DIR=$(mktemp -d /tmp/home-screens-build.XXXXXX)
    trap 'rm -rf "${BUILD_DIR}" 2>/dev/null' EXIT
    cp -a "$REPO_DIR/." "${BUILD_DIR}/"
    cd "${BUILD_DIR}"

    npm ci
    npm run build

    # Assemble standalone output into a staging dir, then move into place
    STAGING_DIR=$(mktemp -d /tmp/home-screens-staging.XXXXXX)
    trap 'rm -rf "${BUILD_DIR}" "${STAGING_DIR}" 2>/dev/null' EXIT

    cp -a .next/standalone/. "${STAGING_DIR}/"
    cp -r public "${STAGING_DIR}/public"
    cp -r .next/static "${STAGING_DIR}/.next/static"
    cp -r scripts "${STAGING_DIR}/scripts"
    [ -f .node-version ] && cp .node-version "${STAGING_DIR}/.node-version"

    # Create seed config
    mkdir -p "${STAGING_DIR}/data"
    node -e "
      const seed = {
        version: 1,
        settings: {
          rotationIntervalMs: 30000,
          displayWidth: 0, displayHeight: 0,
          latitude: 0, longitude: 0,
          weather: { provider: 'open-meteo', latitude: 0, longitude: 0, units: 'imperial' },
          calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 }
        },
        screens: [{ id: 'default', name: 'Screen 1', backgroundImage: '', modules: [] }]
      };
      require('fs').writeFileSync(process.argv[1], JSON.stringify(seed, null, 2));
    " "${STAGING_DIR}/data/config.json"

    # Fix package.json start script
    node -e "
      const pkg = require(process.argv[1]);
      pkg.scripts.start = 'node server.js';
      require('fs').writeFileSync(process.argv[1], JSON.stringify(pkg, null, 2));
    " "${STAGING_DIR}/package.json"

    # Swap into place atomically
    rm -rf "${APP_DIR}"
    mv "${STAGING_DIR}" "${APP_DIR}"

    rm -rf "${BUILD_DIR}"
    trap - EXIT

    log_info "Local build installed to ${APP_DIR}"

else
    # Download release tarball from GitHub
    if [[ -n "$HS_BRANCH" ]]; then
        LATEST_TAG="$HS_BRANCH"
        log_info "Using specified version: $LATEST_TAG"
    else
        log_info "Fetching latest release..."
        LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | \
            node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ try { console.log(JSON.parse(d).tag_name); } catch { process.exit(1); } });")

        if [[ -z "$LATEST_TAG" ]]; then
            log_error "Could not determine latest release tag"
            exit 1
        fi
    fi

    ASSET_NAME="home-screens-${LATEST_TAG}.tar.gz"
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${ASSET_NAME}"

    log_info "Downloading ${LATEST_TAG}..."
    TARBALL=$(mktemp /tmp/home-screens-dl.XXXXXX.tar.gz)
    trap 'rm -f "${TARBALL}" 2>/dev/null' EXIT

    if ! curl -fSL --speed-limit 1024 --speed-time 60 -o "${TARBALL}" "${DOWNLOAD_URL}"; then
        log_error "Failed to download release tarball"
        log_error "URL: ${DOWNLOAD_URL}"
        exit 1
    fi

    # Verify SHA-256 checksum if a sidecar is published
    CHECKSUM_NAME="${ASSET_NAME}.sha256"
    CHECKSUM_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${CHECKSUM_NAME}"
    CHECKSUM_FILE=$(mktemp /tmp/home-screens-checksum.XXXXXX)
    if curl -fsSL --max-time 30 -o "${CHECKSUM_FILE}" "${CHECKSUM_URL}" 2>/dev/null; then
        log_info "Verifying checksum..."
        TARBALL_DIR=$(dirname "${TARBALL}")
        TARBALL_BASE=$(basename "${TARBALL}")
        # Rewrite the checksum file to reference our temp filename
        EXPECTED_HASH=$(awk '{print $1}' "${CHECKSUM_FILE}")
        echo "${EXPECTED_HASH}  ${TARBALL_BASE}" > "${CHECKSUM_FILE}"
        if (cd "${TARBALL_DIR}" && sha256sum -c "${CHECKSUM_FILE}" >/dev/null 2>&1); then
            log_info "Checksum OK"
        else
            rm -f "${TARBALL}" "${CHECKSUM_FILE}"
            log_error "Checksum verification FAILED for ${ASSET_NAME}"
            exit 1
        fi
    else
        log_warn "No checksum sidecar for ${LATEST_TAG} — skipping verification"
    fi
    rm -f "${CHECKSUM_FILE}"

    # Extract to staging, then swap into place
    STAGING_DIR=$(mktemp -d /tmp/home-screens-staging.XXXXXX)
    trap 'rm -f "${TARBALL}" 2>/dev/null; rm -rf "${STAGING_DIR}" 2>/dev/null' EXIT

    log_info "Extracting..."
    tar -xzf "${TARBALL}" -C "${STAGING_DIR}"
    rm -f "${TARBALL}"

    rm -rf "${APP_DIR}"
    mv "${STAGING_DIR}" "${APP_DIR}"
    trap - EXIT

    log_info "Installed ${LATEST_TAG} to ${APP_DIR}"
fi

# ============================================================================
# Set ownership
# ============================================================================
chown -R "${APP_USER}:${APP_USER}" "${INSTALL_BASE}"

# ============================================================================
# Patch seed config defaults
# ============================================================================
# The image is generic — display detection happens at boot via firstboot.
# Seed with 0x0 dimensions so setup-system omits DISPLAY_MODE and labwc
# auto-detects the connected display's native resolution.
log_info "Configuring seed defaults"

if [[ -f "${APP_DIR}/data/config.json" ]]; then
    node -e "
      const fs = require('fs');
      const f = process.argv[1];
      const c = JSON.parse(fs.readFileSync(f, 'utf-8'));
      const s = c.settings = c.settings || {};
      if (!s.piVariant) s.piVariant = 'lite';
      if (!s.displayTransform) s.displayTransform = '90';
      if (!s.calendar) s.calendar = {};
      if (!s.calendar.icalSources) s.calendar.icalSources = [];
      fs.writeFileSync(f, JSON.stringify(c, null, 2) + '\n');
    " "${APP_DIR}/data/config.json"
fi

# ============================================================================
# Run setup-system
# ============================================================================
# setup-system uses $USER/$HOME to configure the systemd service, autologin,
# and kiosk block. We run as root (since we're in the image build) but set
# USER/HOME so setup-system targets the hs user. kiosk.conf is generated
# from config.json by setup-system (step 7), so no manual write needed.
log_info "Running setup-system (services, kiosk, boot config)"
USER="${APP_USER}" HOME="/home/${APP_USER}" bash "${APP_DIR}/scripts/upgrade.sh" setup-system

# setup-system runs as root here, so anything it creates under the home
# directory lands root-owned unless it chowns explicitly. It does, but this
# sweep is the backstop for the whole class: a single root-owned dotfile
# directory is enough to break the kiosk (a root-owned ~/.config stopped
# Chromium creating its profile and aborted it at startup), and the failure
# surfaces as a black screen with nothing in any log.
chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}"

# ============================================================================
# Verify installation
# ============================================================================
log_info "Verifying installation"

CHECKS_PASSED=true

if [[ -f "${APP_DIR}/server.js" ]]; then
    log_info "✓ Server entry point installed"
else
    log_warn "✗ server.js not found at ${APP_DIR}"
    CHECKS_PASSED=false
fi

if [[ -f "${APP_DIR}/package.json" ]]; then
    log_info "✓ package.json installed"
else
    log_warn "✗ package.json not found"
    CHECKS_PASSED=false
fi

if [[ -d "${APP_DIR}/.next" ]]; then
    log_info "✓ Next.js build output present"
else
    log_warn "✗ .next directory not found"
    CHECKS_PASSED=false
fi

if [[ -f "${APP_DIR}/data/config.json" ]]; then
    log_info "✓ Seed config present"
else
    log_warn "✗ data/config.json not found"
    CHECKS_PASSED=false
fi

if systemctl is-enabled home-screens &>/dev/null; then
    log_info "✓ Systemd service enabled"
else
    log_warn "✗ home-screens service not enabled"
    CHECKS_PASSED=false
fi

if [[ "$CHECKS_PASSED" == "true" ]]; then
    log_info "All installation checks passed"
else
    log_warn "Some installation checks failed — review warnings above"
    exit 1
fi

log_info "Home Screens installation stage complete"
