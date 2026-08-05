#!/usr/bin/env bash
# Home Screens - Chroot Image Builder
#
# Builds a flashable Raspberry Pi image on any arm64 Linux host, with no Pi and
# no SD card involved. Downloads a pinned Raspberry Pi OS Lite image, grows it,
# loop-mounts it, and runs the same image-creation/ stage scripts the on-Pi
# build runs — inside a chroot, with HS_CHROOT=1.
#
# The on-Pi path (build-image.sh, run on real hardware) remains supported and
# is the right tool for hardware bring-up. This is the path releases use.
#
# Usage:
#   sudo ./image-creation/build-image-ci.sh --version v1.2.3 --tarball path/to/app.tar.gz
#
# Host requirements (Debian/Ubuntu):
#   apt-get install -y parted dosfstools e2fsprogs zerofree xz-utils curl
#
# Must run on an arm64 host. There is no qemu path: Pi arm64 binaries run
# natively on an arm64 runner, which is why the in-chroot `npm run build` is
# fast and does not hit qemu's Node.js segfaults.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Base image ------------------------------------------------------------
# Pinned to an exact dated release. Raspberry Pi keeps old images online
# indefinitely, so a hard pin is safe (unlike upstreams that prune old builds).
#
# Note the directory date and the file date are NOT the same — the release
# directory is stamped a day after the image itself. Both must be bumped
# together, along with BASE_IMAGE_SHA256, which comes from the .sha256 sidecar
# published next to the image.
BASE_IMAGE_DIR_DATE="${BASE_IMAGE_DIR_DATE:-2026-06-19}"
BASE_IMAGE_DATE="${BASE_IMAGE_DATE:-2026-06-18}"
BASE_IMAGE_SUITE="${BASE_IMAGE_SUITE:-trixie}"
BASE_IMAGE_SHA256="${BASE_IMAGE_SHA256:-acff736ca7945e3b305f07cda4abdb870910e12634991da69783611756e381b3}"
BASE_IMAGE_NAME="${BASE_IMAGE_DATE}-raspios-${BASE_IMAGE_SUITE}-arm64-lite.img.xz"
BASE_IMAGE_URL="${BASE_IMAGE_URL:-https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-${BASE_IMAGE_DIR_DATE}/${BASE_IMAGE_NAME}}"

# --- Defaults --------------------------------------------------------------
VERSION=""
TARGET="pi5"
TARBALL=""
TARBALL_SHA256=""
SIZE_MB=6144
KEEP_WORK=false
SKIP_XZ=false
OUT_DIR="${SCRIPT_DIR}/.out"
CACHE_DIR="${SCRIPT_DIR}/.cache/base"
WORK_DIR="${SCRIPT_DIR}/.work"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[BUILD]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; }

usage() {
    cat <<EOF
Usage: sudo $0 --version <ver> [options]

  --version VER        Version string for the output filename (required)
  --tarball PATH       Pre-built release tarball to install (recommended)
  --tarball-sha256 HEX Expected SHA-256 of --tarball
  --target NAME        Platform label: pi5 (default), pi4, pizero2, pi
  --size-mb N          Work image size in MiB (default: ${SIZE_MB})
  --keep-work          Leave the work image and mounts for inspection
  --skip-xz            Produce a raw .img without compressing
  --out-dir DIR        Output directory (default: ${OUT_DIR})
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)        VERSION="${2:?--version requires a value}"; shift 2 ;;
        --tarball)        TARBALL="${2:?--tarball requires a path}"; shift 2 ;;
        --tarball-sha256) TARBALL_SHA256="${2:?--tarball-sha256 requires a value}"; shift 2 ;;
        --target)         TARGET="${2:?--target requires a value}"; shift 2 ;;
        --size-mb)        SIZE_MB="${2:?--size-mb requires a value}"; shift 2 ;;
        --out-dir)        OUT_DIR="${2:?--out-dir requires a path}"; shift 2 ;;
        --keep-work)      KEEP_WORK=true; shift ;;
        --skip-xz)        SKIP_XZ=true; shift ;;
        -h|--help)        usage; exit 0 ;;
        *) err "Unknown option: $1"; usage; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
[ -n "$VERSION" ] || { err "--version is required"; usage; exit 1; }
[ "$EUID" -eq 0 ] || { err "Must run as root (losetup, mount, chroot)"; exit 1; }

# Fail clearly here rather than with "exec format error" at the first chroot
# command. There is deliberately no qemu-user-static path.
if [ "$(uname -m)" != "aarch64" ]; then
    err "This builder requires an arm64 host (found: $(uname -m))."
    err "Pi arm64 binaries run natively there; there is no emulation path."
    exit 1
fi

for cmd in parted losetup e2fsck resize2fs zerofree mountpoint curl xz sha256sum truncate; do
    command -v "$cmd" >/dev/null 2>&1 || { err "Missing required command: $cmd"; exit 1; }
done

if [ -n "$TARBALL" ]; then
    [ -f "$TARBALL" ] || { err "--tarball not found: $TARBALL"; exit 1; }
    TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
fi

mkdir -p "$OUT_DIR" "$CACHE_DIR" "$WORK_DIR"

WORK_IMG="${WORK_DIR}/work.img"
ROOT_MNT="${WORK_DIR}/root"
LOOPDEV=""

# ---------------------------------------------------------------------------
# Teardown — runs on every exit path.
#
# A leaked loop device outlives the build, wedges the next run, and produces
# failures that look unrelated to the real cause. `umount -R` unwinds nested
# mounts in the right order without an explicit reverse list.
# ---------------------------------------------------------------------------
cleanup() {
    local rc=$?
    set +e
    if mountpoint -q "$ROOT_MNT" 2>/dev/null; then
        umount -R "$ROOT_MNT" 2>/dev/null || umount -Rl "$ROOT_MNT" 2>/dev/null
    fi
    if [ -n "$LOOPDEV" ] && losetup "$LOOPDEV" >/dev/null 2>&1; then
        losetup -d "$LOOPDEV" 2>/dev/null
    fi
    if [ "$KEEP_WORK" != "true" ] && [ "$rc" -eq 0 ]; then
        rm -rf "$WORK_DIR"
    elif [ "$rc" -ne 0 ]; then
        warn "Build failed — work files left at ${WORK_DIR}"
    fi
    return $rc
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Fetch and verify the base image
# ---------------------------------------------------------------------------
BASE_XZ="${CACHE_DIR}/${BASE_IMAGE_NAME}"
if [ -f "$BASE_XZ" ]; then
    log "Using cached base image: ${BASE_IMAGE_NAME}"
else
    log "Downloading base image: ${BASE_IMAGE_NAME}"
    curl -fSL --retry 3 -o "${BASE_XZ}.partial" "$BASE_IMAGE_URL"
    mv "${BASE_XZ}.partial" "$BASE_XZ"
fi

if [ -n "$BASE_IMAGE_SHA256" ]; then
    log "Verifying base image checksum"
    ACTUAL="$(sha256sum "$BASE_XZ" | awk '{print $1}')"
    if [ "$ACTUAL" != "$BASE_IMAGE_SHA256" ]; then
        err "Base image checksum mismatch"
        err "  expected: ${BASE_IMAGE_SHA256}"
        err "  actual:   ${ACTUAL}"
        rm -f "$BASE_XZ"
        exit 1
    fi
else
    warn "BASE_IMAGE_SHA256 is unset — base image is NOT being verified."
    warn "Set it before this pipeline is used for published releases."
fi

log "Decompressing base image"
rm -f "$WORK_IMG"
xz -dc "$BASE_XZ" > "$WORK_IMG"

# ---------------------------------------------------------------------------
# 2. Grow the image before filling it
#
# truncate shrinks as readily as it grows, and shrinking here would silently
# cut the tail off the root filesystem. Assert we are growing.
# ---------------------------------------------------------------------------
CURRENT_BYTES="$(stat -c%s "$WORK_IMG")"
TARGET_BYTES=$(( SIZE_MB * 1024 * 1024 ))
if [ "$TARGET_BYTES" -le "$CURRENT_BYTES" ]; then
    err "--size-mb ${SIZE_MB} is not larger than the base image"
    err "  base image: $(( CURRENT_BYTES / 1024 / 1024 )) MiB"
    exit 1
fi

log "Growing work image to ${SIZE_MB} MiB"
truncate -s "${TARGET_BYTES}" "$WORK_IMG"
parted -s "$WORK_IMG" resizepart 2 100%

# ---------------------------------------------------------------------------
# 3. Attach and grow the filesystem
# ---------------------------------------------------------------------------
log "Attaching loop device"
# --direct-io=on bypasses the host page cache, which otherwise thrashes badly
# on a multi-GB loop-mounted ext4.
LOOPDEV="$(losetup --show -f -P --direct-io=on "$WORK_IMG")"
log "Loop device: ${LOOPDEV}"

# e2fsck exits 1 when it successfully CORRECTS errors, and 2 when it corrected
# them and wants a reboot. Neither is a failure here; 4+ is.
e2fsck -fy "${LOOPDEV}p2" || [ $? -le 2 ]
resize2fs "${LOOPDEV}p2"

# ---------------------------------------------------------------------------
# 4. Mount and prepare the chroot
# ---------------------------------------------------------------------------
log "Mounting"
mkdir -p "$ROOT_MNT"
mount "${LOOPDEV}p2" "$ROOT_MNT"
mkdir -p "${ROOT_MNT}/boot/firmware"
mount "${LOOPDEV}p1" "${ROOT_MNT}/boot/firmware"

mount --bind /dev     "${ROOT_MNT}/dev"
mount --bind /dev/pts "${ROOT_MNT}/dev/pts"
mount --bind /proc    "${ROOT_MNT}/proc"
mount --bind /sys     "${ROOT_MNT}/sys"
# A fresh tmpfs, not a bind of the host's /run — binding it leaks the build
# machine's systemd state into the shipped image.
mount -t tmpfs tmpfs  "${ROOT_MNT}/run"

# DNS. Every apt-get and download in the build depends on this. The base
# image's resolv.conf is a symlink into /run/systemd/resolve/, which the fresh
# tmpfs above guarantees is empty.
RESOLV_BACKUP=""
if [ -e "${ROOT_MNT}/etc/resolv.conf" ] || [ -L "${ROOT_MNT}/etc/resolv.conf" ]; then
    RESOLV_BACKUP="${WORK_DIR}/resolv.conf.orig"
    cp -a "${ROOT_MNT}/etc/resolv.conf" "$RESOLV_BACKUP" 2>/dev/null || true
fi
cp --remove-destination /etc/resolv.conf "${ROOT_MNT}/etc/resolv.conf"

# Stop package postinst scripts from trying to start services. Standard
# practice in image builders (pi-gen does the same); without it, whether a
# package configures cleanly depends on how gracefully its maintainer scripts
# handle a dead init.
printf '#!/bin/sh\nexit 101\n' > "${ROOT_MNT}/usr/sbin/policy-rc.d"
chmod +x "${ROOT_MNT}/usr/sbin/policy-rc.d"

# ---------------------------------------------------------------------------
# 5. Stage build inputs
# ---------------------------------------------------------------------------
BUILD_IN="${ROOT_MNT}/tmp/hs-build"
rm -rf "$BUILD_IN"
mkdir -p "${BUILD_IN}/image-creation"

# Copy ONLY the files the stages need. A recursive copy of $SCRIPT_DIR would
# descend into .work/root — which is where $ROOT_MNT is mounted, i.e. the
# destination itself — and recurse until the image fills up. .cache also holds
# the 1.3GB base image. Naming the inputs explicitly avoids both.
cp "${SCRIPT_DIR}/build-image.sh" "${BUILD_IN}/image-creation/"
cp -r "${SCRIPT_DIR}/scripts" "${BUILD_IN}/image-creation/scripts"

CHROOT_TARBALL=""
if [ -n "$TARBALL" ]; then
    cp "$TARBALL" "${BUILD_IN}/app.tar.gz"
    CHROOT_TARBALL="/tmp/hs-build/app.tar.gz"
fi

# ---------------------------------------------------------------------------
# 6. Run the shared stage scripts inside the chroot
# ---------------------------------------------------------------------------
log "Running build stages in chroot (target: ${TARGET})"
chroot "$ROOT_MNT" /usr/bin/env -i \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    HOME=/root \
    HS_CHROOT=1 \
    HS_VERSION="$VERSION" \
    HS_TARBALL="$CHROOT_TARBALL" \
    HS_TARBALL_SHA256="$TARBALL_SHA256" \
    DEBIAN_FRONTEND=noninteractive \
    LC_ALL=C \
    bash /tmp/hs-build/image-creation/build-image.sh --img --target "$TARGET"

# ---------------------------------------------------------------------------
# 7. Remove build inputs and host artifacts from the image
# ---------------------------------------------------------------------------
log "Cleaning build inputs"
rm -rf "$BUILD_IN"
rm -f "${ROOT_MNT}/usr/sbin/policy-rc.d"

# Restore the image's own resolv.conf so it doesn't ship with the build
# machine's DNS servers baked in.
rm -f "${ROOT_MNT}/etc/resolv.conf"
if [ -n "$RESOLV_BACKUP" ] && [ -e "$RESOLV_BACKUP" ]; then
    cp -a "$RESOLV_BACKUP" "${ROOT_MNT}/etc/resolv.conf"
else
    ln -sf /run/systemd/resolve/stub-resolv.conf "${ROOT_MNT}/etc/resolv.conf"
fi

# ---------------------------------------------------------------------------
# 8. Unmount, then zero free space
#
# zerofree requires an unmounted (or read-only) filesystem, so it doubles as a
# check that teardown actually completed.
# ---------------------------------------------------------------------------
log "Unmounting"
sync
umount -R "$ROOT_MNT"

log "Zeroing free space (large compression win)"
zerofree "${LOOPDEV}p2"

losetup -d "$LOOPDEV"
LOOPDEV=""

# ---------------------------------------------------------------------------
# 9. Package
# ---------------------------------------------------------------------------
OUT_IMG="${OUT_DIR}/home-screens-${VERSION}-${TARGET}.img"
mv "$WORK_IMG" "$OUT_IMG"

if [ "$SKIP_XZ" = "true" ]; then
    FINAL="$OUT_IMG"
else
    log "Compressing (this takes a while)"
    xz -9 -T0 -f "$OUT_IMG"
    FINAL="${OUT_IMG}.xz"
fi

( cd "$(dirname "$FINAL")" && sha256sum "$(basename "$FINAL")" > "$(basename "$FINAL").sha256" )

log "Done"
echo ""
echo "  Image:    ${FINAL}"
echo "  Checksum: ${FINAL}.sha256"
echo "  Size:     $(du -h "$FINAL" | awk '{print $1}')"
echo ""
