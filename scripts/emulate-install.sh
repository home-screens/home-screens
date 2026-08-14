#!/usr/bin/env bash
set -euo pipefail

# Home Screens - Install Emulation
# Boots a Debian 12 ARM64 cloud image in QEMU on Apple Silicon, runs install.sh,
# and verifies the installation with comprehensive checks.
#
# Debian 12 (Bookworm) is the same base as Raspberry Pi OS — same apt repos,
# same systemd, same aarch64 architecture. The only difference is the kernel
# (Pi OS builds for bcm2711 hardware). For testing install.sh, which operates
# entirely in userspace, they are functionally identical.
#
# Two scenarios:
#
#   hub (default)     Full install: Node, the release tarball, the systemd
#                     service. Verifies the server comes up and serves.
#
#   --display-only    Spoke install pointed at a hub, plus the whole display
#                     self-update path: the sudoers grant, the privileged
#                     helper, the update timer, and the one-time migration
#                     command for a Pi that predates self-update.
#
#                     This is the only place that layer can be tested. The
#                     shell tests in scripts/__tests__ deliberately stop at the
#                     systemd/sudo boundary, and macOS has neither — so
#                     "does the NOPASSWD grant actually parse and match?" is
#                     answerable here and nowhere else short of real hardware.
#
#                     In this mode the VM talks to a hub started from YOUR
#                     WORKING TREE (not a GitHub release), with a sandboxed
#                     data/ dir so nothing touches your real config.
#
# Prerequisites: brew install qemu cdrtools
#                npm run build   (--display-only serves the local build)
#
# Usage:
#   ./scripts/emulate-install.sh                      # Test latest release
#   ./scripts/emulate-install.sh --version v0.20.0    # Test specific version
#   ./scripts/emulate-install.sh --keep --verbose      # Debug mode (VM stays up)
#   ./scripts/emulate-install.sh --display-only        # Test a spoke + self-update
#   ./scripts/emulate-install.sh --display-only --hub http://10.0.2.2:3000
#                                                      # ...against your own dev server

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
EMULATE_DIR="${PROJECT_DIR}/.emulate"
WORK_DIR="${EMULATE_DIR}/work"

IMAGE_URL="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-arm64.qcow2"
IMAGE_FILE="${EMULATE_DIR}/debian-12-genericcloud-arm64.qcow2"

VM_CORES=2
VM_RAM="2G"
VM_DISK_SIZE="8G"
SSH_PORT=2222
APP_PORT=3333
GUEST_PORT=3000

# Port the sandboxed hub listens on for --display-only runs. Deliberately not
# 3000: you will usually have your own dev server there, and this hub gets a
# throwaway data/ dir that should not be confused with it.
HUB_PORT=3010
# QEMU's user-mode networking maps this fixed address to the host, so a guest
# reaches a server on your Mac's loopback with no bridging or extra VM.
HOST_FROM_GUEST="10.0.2.2"

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Parse flags ─────────────────────────────────────────────────────────────

VERSION_FLAG=""
KEEP_VM=false
NO_CACHE=false
VERBOSE=false
CURL_INSTALL=false
DISPLAY_ONLY=false
HUB_URL=""
SPOKE_DISPLAY_ID="vm-spoke"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      if [ -z "${2:-}" ]; then echo -e "${RED}[x]${NC} --version requires a tag"; exit 1; fi
      VERSION_FLAG="$2"; shift 2 ;;
    --keep)       KEEP_VM=true; shift ;;
    --display-only) DISPLAY_ONLY=true; shift ;;
    --hub)
      if [ -z "${2:-}" ]; then echo -e "${RED}[x]${NC} --hub requires a URL"; exit 1; fi
      HUB_URL="$2"; shift 2 ;;
    --display-id)
      if [ -z "${2:-}" ]; then echo -e "${RED}[x]${NC} --display-id requires a value"; exit 1; fi
      SPOKE_DISPLAY_ID="$2"; shift 2 ;;
    --no-cache)   NO_CACHE=true; shift ;;
    --verbose)    VERBOSE=true; shift ;;
    --curl)       CURL_INSTALL=true; shift ;;
    -h|--help)
      echo "Usage: $(basename "$0") [options]"
      echo ""
      echo "Boots a Debian 12 ARM64 VM, runs install.sh, verifies the install."
      echo ""
      echo "Options:"
      echo "  --version TAG    Install a specific release (default: latest)"
      echo "  --keep           Don't destroy VM after tests (SSH in to debug)"
      echo "  --no-cache       Re-download the base image"
      echo "  --verbose        Show all SSH command output"
      echo "  --curl           Test curl|bash install path (instead of git clone)"
      echo "  --display-only   Test a spoke install plus the display self-update path"
      echo "  --hub URL        Hub the spoke points at (default: sandboxed local build)"
      echo "  --display-id ID  Display id for the spoke (default: vm-spoke)"
      echo "  -h, --help       Show this help"
      echo ""
      echo "Prerequisites: brew install qemu cdrtools"
      echo "               npm run build   (for --display-only)"
      echo ""
      echo "Examples:"
      echo "  $0                          # test latest release"
      echo "  $0 --version v0.20.0        # test specific version"
      echo "  $0 --keep --verbose         # debug mode"
      echo "  $0 --curl                       # test curl|bash install"
      echo "  $0 --display-only               # test a spoke + self-update + migration"
      echo "  $0 --display-only --hub http://10.0.2.2:3000  # ...against your dev server"
      echo "  ssh -i .emulate/work/id_ed25519 -p 2222 hs@localhost  # SSH in (with --keep)"
      exit 0 ;;
    *) echo -e "${RED}[x]${NC} Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Logging ─────────────────────────────────────────────────────────────────

info()  { echo -e "${GREEN}[*]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[x]${NC} $1"; }
step()  { echo -e "\n${BOLD}==> $1${NC}"; }

# ─── SSH helper ──────────────────────────────────────────────────────────────

ssh_cmd() {
  local opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
  opts+=(-o LogLevel=ERROR -o ServerAliveInterval=15 -o ServerAliveCountMax=40)
  opts+=(-i "${WORK_DIR}/id_ed25519" -p "${SSH_PORT}")

  if [ "${VERBOSE}" = true ]; then
    ssh "${opts[@]}" hs@localhost "$@"
  else
    ssh "${opts[@]}" hs@localhost "$@" 2>&1
  fi
}

# Run a script piped on stdin inside the VM. Saves the quoting nightmare of
# passing multi-line shell through ssh's single argument.
ssh_script() {
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR -o ServerAliveInterval=15 -o ServerAliveCountMax=40 \
      -i "${WORK_DIR}/id_ed25519" -p "${SSH_PORT}" hs@localhost "bash -s" 2>&1
}

# Copy a directory from the working tree into the VM.
#
# `dest` is expanded by the REMOTE shell, so it may contain $HOME. Do not
# quote it in the remote command — single quotes there would create a
# directory literally named "$HOME".
push_dir() {
  local src="$1" dest="$2"
  tar -czf - -C "$(dirname "${src}")" "$(basename "${src}")" \
    | ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
          -o LogLevel=ERROR -i "${WORK_DIR}/id_ed25519" -p "${SSH_PORT}" \
          hs@localhost "mkdir -p ${dest} && tar -xzf - -C ${dest}" 2>&1
}

# ─── Cleanup ─────────────────────────────────────────────────────────────────

HUB_SANDBOX=""
HUB_PID=""

cleanup() {
  local exit_code=$?

  # --keep must survive a FAILED run — that is the run you actually want to
  # SSH into. Leave the VM AND the hub up, since inspecting the spoke means
  # being able to re-run an update against the hub it was installed against.
  if [ "${KEEP_VM}" = true ]; then
    info "Left running for inspection (--keep):"
    [ -f "${WORK_DIR}/qemu.pid" ] && \
      echo "  ssh -i ${WORK_DIR}/id_ed25519 -p ${SSH_PORT} hs@localhost" || true
    [ -n "${HUB_SANDBOX}" ] && echo "  hub:  http://localhost:${HUB_PORT}  (data: ${HUB_SANDBOX}/data)" || true
    echo "  stop: kill \$(cat ${WORK_DIR}/qemu.pid 2>/dev/null) ${HUB_PID}"
    exit "${exit_code}"
  fi

  if [ -n "${HUB_PID}" ] && kill -0 "${HUB_PID}" 2>/dev/null; then
    info "Stopping sandboxed hub (PID ${HUB_PID})..."
    kill "${HUB_PID}" 2>/dev/null || true
  fi
  # The sandbox is symlinks plus its own data/ dir, so removing it can never
  # reach the real repo — but only ever rm a path we created ourselves.
  if [ -n "${HUB_SANDBOX}" ]; then
    case "${HUB_SANDBOX}" in
      */hs-emulate-hub.*) rm -rf "${HUB_SANDBOX}" ;;
    esac
  fi

  if [ -f "${WORK_DIR}/qemu.pid" ]; then
    local pid
    pid=$(cat "${WORK_DIR}/qemu.pid" 2>/dev/null || true)
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
      info "Shutting down VM (PID ${pid})..."
      kill "${pid}" 2>/dev/null || true
      for _ in $(seq 1 10); do
        kill -0 "${pid}" 2>/dev/null || break
        sleep 0.5
      done
      kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" 2>/dev/null || true
    fi
  fi

  if [ "${KEEP_VM}" = true ]; then
    info "VM artifacts preserved in ${WORK_DIR}"
    info "SSH in: ssh -i ${WORK_DIR}/id_ed25519 -p ${SSH_PORT} hs@localhost"
  elif [ -d "${WORK_DIR}" ]; then
    rm -rf "${WORK_DIR}"
  fi

  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

# ─── Preflight checks ───────────────────────────────────────────────────────

check_prerequisites() {
  step "Checking prerequisites"
  local missing=false

  # Apple Silicon check
  if [ "$(uname -m)" != "arm64" ]; then
    err "This script requires Apple Silicon (arm64). Detected: $(uname -m)"
    exit 1
  fi

  # QEMU
  if ! command -v qemu-system-aarch64 &>/dev/null; then
    err "qemu not found. Install with: brew install qemu"
    missing=true
  else
    info "qemu $(qemu-system-aarch64 --version | head -1 | awk '{print $NF}')"
  fi

  # mkisofs (for cloud-init seed ISO)
  if ! command -v mkisofs &>/dev/null; then
    err "mkisofs not found. Install with: brew install cdrtools"
    missing=true
  fi

  # UEFI firmware
  local fw_dir
  fw_dir="$(dirname "$(command -v qemu-system-aarch64 2>/dev/null || echo /opt/homebrew/bin/qemu-system-aarch64)")/../share/qemu"
  UEFI_CODE="${fw_dir}/edk2-aarch64-code.fd"

  if [ ! -f "${UEFI_CODE}" ]; then
    for candidate in \
      /opt/homebrew/share/qemu/edk2-aarch64-code.fd \
      /usr/local/share/qemu/edk2-aarch64-code.fd; do
      if [ -f "${candidate}" ]; then
        UEFI_CODE="${candidate}"
        break
      fi
    done
  fi

  if [ ! -f "${UEFI_CODE}" ]; then
    err "UEFI firmware not found. Reinstall qemu: brew reinstall qemu"
    missing=true
  else
    info "UEFI firmware: ${UEFI_CODE}"
  fi

  if [ "${missing}" = true ]; then
    exit 1
  fi

  # Port availability
  for port_info in "${SSH_PORT}:SSH" "${APP_PORT}:App"; do
    local port="${port_info%%:*}"
    local label="${port_info##*:}"
    if lsof -i :"${port}" -sTCP:LISTEN &>/dev/null; then
      err "${label} port ${port} is already in use."
      exit 1
    fi
  done

  info "Ports ${SSH_PORT} (SSH) and ${APP_PORT} (app) are available."
}

# ─── Base image ──────────────────────────────────────────────────────────────

ensure_base_image() {
  step "Preparing base image"
  mkdir -p "${EMULATE_DIR}"

  if [ "${NO_CACHE}" = true ] && [ -f "${IMAGE_FILE}" ]; then
    info "Removing cached image (--no-cache)..."
    rm -f "${IMAGE_FILE}"
  fi

  if [ -f "${IMAGE_FILE}" ]; then
    info "Using cached image: $(basename "${IMAGE_FILE}")"
  else
    info "Downloading Debian 12 ARM64 cloud image..."
    info "${DIM}${IMAGE_URL}${NC}"
    curl -fSL --progress-bar -o "${IMAGE_FILE}.tmp" "${IMAGE_URL}"
    mv "${IMAGE_FILE}.tmp" "${IMAGE_FILE}"
    info "Download complete."
  fi

  if ! qemu-img info "${IMAGE_FILE}" &>/dev/null; then
    err "Downloaded image is not valid QCOW2. Delete and retry: rm ${IMAGE_FILE}"
    exit 1
  fi
}

# ─── Working copy ────────────────────────────────────────────────────────────

create_work_dir() {
  step "Creating working environment"

  rm -rf "${WORK_DIR}"
  mkdir -p "${WORK_DIR}"

  # Copy and resize disk
  info "Copying base image and resizing to ${VM_DISK_SIZE}..."
  cp "${IMAGE_FILE}" "${WORK_DIR}/disk.qcow2"
  qemu-img resize "${WORK_DIR}/disk.qcow2" "${VM_DISK_SIZE}" >/dev/null

  # Generate ephemeral SSH key
  info "Generating ephemeral SSH key..."
  ssh-keygen -t ed25519 -f "${WORK_DIR}/id_ed25519" -N "" -q

  # Create writable UEFI vars
  local vars_src
  vars_src="$(dirname "${UEFI_CODE}")/edk2-arm-vars.fd"
  if [ -f "${vars_src}" ]; then
    cp "${vars_src}" "${WORK_DIR}/efi-vars.fd"
  else
    dd if=/dev/zero of="${WORK_DIR}/efi-vars.fd" bs=1M count=64 2>/dev/null
  fi

  info "Working directory: ${WORK_DIR}"
}

# ─── Cloud-init seed ─────────────────────────────────────────────────────────

create_seed_iso() {
  step "Creating cloud-init seed"

  local seed_dir="${WORK_DIR}/seed"
  mkdir -p "${seed_dir}"

  local ssh_pub_key
  ssh_pub_key=$(cat "${WORK_DIR}/id_ed25519.pub")

  cat > "${seed_dir}/meta-data" <<EOF
instance-id: home-screens-emulate
local-hostname: home-screens
EOF

  cat > "${seed_dir}/user-data" <<EOF
#cloud-config
users:
  - name: hs
    plain_text_passwd: screens
    lock_passwd: false
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: sudo
    ssh_authorized_keys:
      - ${ssh_pub_key}
ssh_pwauth: true
package_update: true
packages:
  - git
  - curl
  - vim
  - sudo
EOF

  mkisofs -output "${WORK_DIR}/seed.iso" -volid cidata -joliet -rock \
    "${seed_dir}/meta-data" "${seed_dir}/user-data" 2>/dev/null

  info "Seed ISO created."
}

# ─── Boot VM ─────────────────────────────────────────────────────────────────

boot_vm() {
  step "Booting ARM64 VM (QEMU + HVF)"

  qemu-system-aarch64 \
    -M virt \
    -accel hvf \
    -cpu host \
    -smp "${VM_CORES}" \
    -m "${VM_RAM}" \
    -drive if=pflash,format=raw,file="${UEFI_CODE}",readonly=on \
    -drive if=pflash,format=raw,file="${WORK_DIR}/efi-vars.fd" \
    -drive if=virtio,format=qcow2,file="${WORK_DIR}/disk.qcow2" \
    -drive if=virtio,format=raw,file="${WORK_DIR}/seed.iso",media=cdrom \
    -netdev user,id=net0,hostfwd=tcp::${SSH_PORT}-:22,hostfwd=tcp::${APP_PORT}-:${GUEST_PORT} \
    -device virtio-net-pci,netdev=net0 \
    -nographic \
    -monitor none \
    -serial file:"${WORK_DIR}/console.log" \
    -pidfile "${WORK_DIR}/qemu.pid" &

  QEMU_PID=$!

  sleep 1
  if ! kill -0 "${QEMU_PID}" 2>/dev/null; then
    err "QEMU failed to start. Check console log:"
    tail -20 "${WORK_DIR}/console.log" 2>/dev/null || true
    exit 1
  fi

  info "VM booting (PID ${QEMU_PID})..."
  info "${DIM}Console log: ${WORK_DIR}/console.log${NC}"
}

# ─── Wait for SSH ────────────────────────────────────────────────────────────

wait_for_ssh() {
  step "Waiting for SSH"

  local max_attempts=60  # 60 * 2s = 120s
  local attempt=0

  while [ "${attempt}" -lt "${max_attempts}" ]; do
    if ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
       -o LogLevel=ERROR -o PreferredAuthentications=publickey \
       -i "${WORK_DIR}/id_ed25519" -p "${SSH_PORT}" hs@localhost true 2>/dev/null; then
      info "SSH ready (attempt ${attempt})."
      return 0
    fi

    # Check QEMU is still running
    if [ -f "${WORK_DIR}/qemu.pid" ]; then
      local pid
      pid=$(cat "${WORK_DIR}/qemu.pid" 2>/dev/null || true)
      if [ -n "${pid}" ] && ! kill -0 "${pid}" 2>/dev/null; then
        err "QEMU process died. Last console output:"
        tail -30 "${WORK_DIR}/console.log" 2>/dev/null || true
        exit 1
      fi
    fi

    sleep 2
    attempt=$((attempt + 1))

    if [ $((attempt % 10)) -eq 0 ]; then
      info "${DIM}Still waiting... (${attempt}/${max_attempts})${NC}"
    fi
  done

  err "SSH did not become available within 120 seconds."
  err "Last console output:"
  tail -30 "${WORK_DIR}/console.log" 2>/dev/null || true
  exit 1
}

# ─── Wait for cloud-init ────────────────────────────────────────────────────

wait_for_cloud_init() {
  step "Waiting for cloud-init to finish"

  local max_attempts=60  # 60 * 5s = 300s
  local attempt=0

  while [ "${attempt}" -lt "${max_attempts}" ]; do
    if ssh_cmd "cloud-init status --wait" &>/dev/null; then
      info "Cloud-init complete."
      return 0
    fi
    if ssh_cmd "test -f /run/cloud-init/result.json" &>/dev/null; then
      info "Cloud-init complete."
      return 0
    fi
    sleep 5
    attempt=$((attempt + 1))
    if [ $((attempt % 6)) -eq 0 ]; then
      info "${DIM}Still waiting for cloud-init... (${attempt}/${max_attempts})${NC}"
    fi
  done

  warn "Cloud-init may not have finished. Continuing anyway..."
}

# ─── Run install ─────────────────────────────────────────────────────────────

run_install() {
  step "Running install.sh inside VM"

  # Ensure packages are available
  info "Ensuring packages are available..."
  ssh_cmd "sudo apt-get update -qq && sudo apt-get install -y -qq curl" || {
    err "Failed to install prerequisite packages."
    exit 1
  }

  # Build the install flags
  local install_flags="--non-interactive"
  if [ -n "${VERSION_FLAG}" ]; then
    install_flags="${install_flags} --version ${VERSION_FLAG}"
    info "Installing version ${VERSION_FLAG}..."
  else
    info "Installing latest release..."
  fi

  if [ "${CURL_INSTALL}" = true ]; then
    # Pipe install: curl | bash (tests the self-download guard)
    info "Testing curl | bash install path..."
    local curl_url="https://raw.githubusercontent.com/home-screens/home-screens/main/scripts/install.sh"
    local install_cmd="curl -fsSL ${curl_url} | bash -s -- ${install_flags}"
  else
    # Clone install: traditional path
    info "Cloning home-screens repo..."
    ssh_cmd "sudo apt-get install -y -qq git" || {
      err "Failed to install git."
      exit 1
    }
    ssh_cmd "git clone --depth 1 https://github.com/home-screens/home-screens.git ~/home-screens" || {
      err "Failed to clone repository."
      exit 1
    }
    local install_cmd="bash ~/home-screens/scripts/install.sh ${install_flags}"
  fi

  # Run install
  if [ "${VERBOSE}" = true ]; then
    ssh_cmd "${install_cmd}" || {
      err "install.sh failed. See output above."
      exit 1
    }
  else
    local install_output
    if install_output=$(ssh_cmd "${install_cmd}" 2>&1); then
      info "install.sh completed successfully."
    else
      err "install.sh failed. Output:"
      echo "${install_output}"
      exit 1
    fi
  fi
}

# ─── Start service + health check ───────────────────────────────────────────

start_and_health_check() {
  step "Starting service and running health check"

  info "Starting home-screens service..."
  ssh_cmd "sudo systemctl start home-screens" || {
    err "Failed to start service. Checking journal..."
    ssh_cmd "sudo journalctl -u home-screens --no-pager -n 30" || true
    exit 1
  }

  info "Waiting for server to respond (up to 60s)..."
  local health_output
  if health_output=$(ssh_cmd "bash /opt/home-screens/current/scripts/upgrade.sh health-check" 2>&1); then
    info "Health check passed: ${health_output}"
  else
    err "Health check failed: ${health_output}"
    info "Service status:"
    ssh_cmd "sudo systemctl status home-screens --no-pager" || true
    info "Recent logs:"
    ssh_cmd "sudo journalctl -u home-screens --no-pager -n 20" || true
    exit 1
  fi
}

# ─── Verification ────────────────────────────────────────────────────────────

run_verification() {
  step "Running verification checks"

  local pass=0
  local fail=0
  local total=12

  check() {
    local name="$1"
    shift
    local result
    if result=$("$@" 2>&1); then
      echo -e "  ${GREEN}PASS${NC}  ${name}"
      pass=$((pass + 1))
    else
      echo -e "  ${RED}FAIL${NC}  ${name}"
      if [ "${VERBOSE}" = true ] && [ -n "${result}" ]; then
        echo -e "        ${DIM}${result}${NC}"
      fi
      fail=$((fail + 1))
    fi
  }

  echo ""

  check "Service active" \
    ssh_cmd "systemctl is-active home-screens"

  check "Service enabled" \
    ssh_cmd "systemctl is-enabled home-screens"

  check "API /api/config responds" \
    ssh_cmd "curl -sf localhost:${GUEST_PORT}/api/config | node -e \"JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))\""

  check "server.js exists" \
    ssh_cmd "test -f /opt/home-screens/current/server.js"

  check "config.json valid" \
    ssh_cmd "node -e \"JSON.parse(require('fs').readFileSync('/opt/home-screens/current/data/config.json','utf8'))\""

  check "kiosk.conf exists" \
    ssh_cmd "test -f /opt/home-screens/current/data/kiosk.conf"

  check "Node.js v22" \
    ssh_cmd "node -v | grep -q '^v22'"

  check "/display serves HTML" \
    ssh_cmd "curl -sf localhost:${GUEST_PORT}/display | grep -qi html"

  check "/editor serves HTML" \
    ssh_cmd "curl -sf localhost:${GUEST_PORT}/editor | grep -qi html"

  check "Display config correct" \
    ssh_cmd "node -e \"
      const c = JSON.parse(require('fs').readFileSync('/opt/home-screens/current/data/config.json','utf8'));
      const s = c.settings;
      if (s.displayTransform !== '90') { console.error('transform:', s.displayTransform); process.exit(1); }
      if (s.displayWidth !== 1080) { console.error('width:', s.displayWidth); process.exit(1); }
      if (s.displayHeight !== 1920) { console.error('height:', s.displayHeight); process.exit(1); }
    \""

  check "Unit file exists" \
    ssh_cmd "test -f /etc/systemd/system/home-screens.service"

  check "Host port forwarding" \
    curl -sf "localhost:${APP_PORT}/api/config" -o /dev/null

  echo ""
  echo -e "─────────────────────────────────────"
  if [ "${fail}" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}  All ${total} checks passed${NC}"
  else
    echo -e "${RED}${BOLD}  ${fail}/${total} checks failed${NC}"
  fi
  echo -e "─────────────────────────────────────"
  echo ""

  if [ "${fail}" -gt 0 ]; then
    VERIFY_EXIT=1
  else
    VERIFY_EXIT=0
  fi
}

# ─── Sandboxed hub (--display-only) ─────────────────────────────────────────
#
# The spoke has to talk to a real hub, and it must be the hub built from YOUR
# working tree — the whole point is testing unreleased code. Rather than make
# you run a dev server (and rather than pointing the VM at your real data/),
# mirror the repo into a temp dir by symlink with a private data/ dir, the
# same trick e2e/helpers/sandbox.ts uses. Every path the app writes resolves
# through process.cwd(), so the hub reads your real build and writes nowhere
# near your config.

start_sandbox_hub() {
  step "Starting a hub from your working tree (sandboxed data dir)"

  if [ ! -f "${PROJECT_DIR}/.next/BUILD_ID" ]; then
    err "No production build found. Run: npm run build"
    exit 1
  fi

  HUB_SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/hs-emulate-hub.XXXXXX")"

  # ls -A, not a glob: .next is a dotfile and is the one directory we can't
  # do without.
  local name
  while IFS= read -r name; do
    case "${name}" in data|.git) continue ;; esac
    ln -s "${PROJECT_DIR}/${name}" "${HUB_SANDBOX}/${name}"
  done < <(ls -A "${PROJECT_DIR}")
  mkdir -p "${HUB_SANDBOX}/data"

  # Seed from the real config so the hub is guaranteed to boot on a valid
  # document, then add the spoke as an adopted display. The read is the only
  # contact with your data/ dir; the write lands in the sandbox.
  if [ ! -f "${PROJECT_DIR}/data/config.json" ]; then
    err "No data/config.json to seed the sandbox hub from."
    exit 1
  fi
  node -e "
    const fs = require('fs');
    const c = JSON.parse(fs.readFileSync('${PROJECT_DIR}/data/config.json', 'utf8'));
    c.displays = Array.isArray(c.displays) && c.displays.length ? c.displays : [
      { id: 'main', name: 'Main', screens: [] },
    ];
    if (!c.displays.some((d) => d.id === '${SPOKE_DISPLAY_ID}')) {
      c.displays.push({ id: '${SPOKE_DISPLAY_ID}', name: 'VM Spoke', screens: [] });
    }
    fs.writeFileSync('${HUB_SANDBOX}/data/config.json', JSON.stringify(c, null, 2));
  " || { err "Failed to seed the sandbox config."; exit 1; }

  ( cd "${HUB_SANDBOX}" && npx next start -p "${HUB_PORT}" >"${HUB_SANDBOX}/hub.log" 2>&1 ) &
  HUB_PID=$!

  local attempt=0
  while [ "${attempt}" -lt 60 ]; do
    if curl -fsS --max-time 2 "http://127.0.0.1:${HUB_PORT}/api/system/build-id" >/dev/null 2>&1; then
      info "Hub up on port ${HUB_PORT} (data: ${HUB_SANDBOX}/data)"
      HUB_URL="http://${HOST_FROM_GUEST}:${HUB_PORT}"
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  err "Sandboxed hub did not come up. Log:"
  tail -30 "${HUB_SANDBOX}/hub.log" 2>/dev/null || true
  exit 1
}

# The hub's own version, used to assert the spoke converges onto it.
hub_version() {
  node -e "console.log(require('${PROJECT_DIR}/package.json').version)"
}

# ─── Spoke install (--display-only) ─────────────────────────────────────────

push_local_scripts() {
  step "Pushing the working tree's scripts/ into the VM"
  # Deliberately NOT a git clone: the point is to test the code you have now.
  # install.sh finds lib/common.sh and boot-splash/ relative to itself, so
  # shipping the whole scripts/ dir is enough to make it self-sufficient.
  push_dir "${PROJECT_DIR}/scripts" "\$HOME/home-screens" >/dev/null || {
    err "Failed to copy scripts into the VM."
    exit 1
  }
  ssh_cmd "chmod +x \$HOME/home-screens/scripts/*.sh" >/dev/null || true
}

stub_gui_packages() {
  step "Standing in for the graphical packages Debian 12 lacks"
  # install.sh installs the Pi OS kiosk stack. Two problems here, neither of
  # them a defect in our code:
  #   - labwc does not exist in Debian 12 at all (it landed in Debian 13);
  #     Raspberry Pi OS ships it from its own archive.
  #   - none of them can run on a headless cloud image anyway, and every one
  #     is replaced by an argv-logging stub below.
  # Satisfy apt with empty equivs packages so install.sh runs UNMODIFIED.
  #
  # Said out loud rather than quietly narrowing what the run covers: this rig
  # does NOT verify that the kiosk packages install on Raspberry Pi OS.
  warn "chromium/labwc/wtype/wlr-randr are stubbed — package install is NOT covered here."
  # dpkg-deb, not equivs: equivs shells out to dpkg-buildpackage once per
  # package, which took longer inside the emulated VM than the entire rest of
  # the run. A hand-built control file is the same result in a second.
  local out
  if ! out=$(ssh_script <<'GUIPKGS'
set -e
rm -rf ~/stubpkgs && mkdir -p ~/stubpkgs && cd ~/stubpkgs
for pkg in chromium labwc wtype wlr-randr fonts-noto-color-emoji; do
  mkdir -p "${pkg}/DEBIAN"
  cat > "${pkg}/DEBIAN/control" <<EOF
Package: ${pkg}
Version: 99.0
Section: misc
Priority: optional
Architecture: all
Maintainer: Home Screens Emulator <noreply@example.com>
Description: Emulator stand-in for ${pkg}
 Headless test rig placeholder. The real binary is replaced by an
 argv-logging stub in /usr/local/bin.
EOF
  dpkg-deb --build "${pkg}" "${pkg}.deb" >/dev/null
done
sudo dpkg -i ./*.deb
GUIPKGS
  ); then
    err "Failed to install the stand-in packages:"
    echo "${out}"
    exit 1
  fi
}

install_kiosk_stubs() {
  step "Installing headless stubs for the graphical binaries"
  # A cloud image has no GPU, so a real chromium would hang and wlr-randr
  # would fail. Stubs that log their argv let the launcher run to completion
  # and turn "what command would it have run?" into an assertable fact —
  # which is exactly the question behind the missing-flags bug.
  # /usr/local/bin precedes /usr/bin, so these shadow the apt-installed ones.
  local out
  if ! out=$(ssh_script <<'STUBS'
set -e
for b in chromium wlr-randr wtype labwc; do
  printf '#!/bin/sh\necho "$(basename $0) $*" >> /tmp/kiosk-argv.log\nexit 0\n' > "/tmp/stub-${b}"
  sudo install -m 0755 "/tmp/stub-${b}" "/usr/local/bin/${b}"
done
: > /tmp/kiosk-argv.log
chmod 666 /tmp/kiosk-argv.log
STUBS
  ); then
    err "Failed to install the headless stubs:"
    echo "${out}"
    exit 1
  fi
}

run_display_only_install() {
  step "Running install.sh --display-only inside VM"
  info "Backend: ${HUB_URL}, display id: ${SPOKE_DISPLAY_ID}"

  ssh_cmd "sudo apt-get update -qq && sudo apt-get install -y -qq curl" >/dev/null || {
    err "Failed to install prerequisite packages."
    exit 1
  }

  local cmd="bash \$HOME/home-screens/scripts/install.sh --display-only --non-interactive"
  cmd="${cmd} --backend ${HUB_URL} --display-id ${SPOKE_DISPLAY_ID}"

  local out
  if out=$(ssh_cmd "${cmd}" 2>&1); then
    info "Spoke install completed."
    [ "${VERBOSE}" = true ] && echo "${out}" || true
  else
    err "install.sh --display-only failed. Output:"
    echo "${out}"
    exit 1
  fi
}

# ─── Spoke verification (--display-only) ────────────────────────────────────

SPOKE_PASS=0
SPOKE_FAIL=0

spoke_check() {
  local name="$1"
  shift
  local result
  if result=$("$@" 2>&1); then
    echo -e "  ${GREEN}PASS${NC}  ${name}"
    SPOKE_PASS=$((SPOKE_PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}  ${name}"
    [ -n "${result}" ] && echo -e "        ${DIM}${result}${NC}" || true
    SPOKE_FAIL=$((SPOKE_FAIL + 1))
  fi
}

APP="/opt/home-screens/current"
HELPER="/usr/local/lib/home-screens/kiosk-update-privileged.sh"

run_spoke_verification() {
  step "Verifying the spoke install"
  echo ""

  spoke_check "kiosk.conf names the hub and this display" \
    ssh_cmd "grep -q '^BACKEND_URL=' ${APP}/data/kiosk.conf && grep -q '^DISPLAY_ID=\"${SPOKE_DISPLAY_ID}\"' ${APP}/data/kiosk.conf"

  spoke_check "launcher installed at the path .bash_profile execs" \
    ssh_cmd "test -x ${APP}/scripts/kiosk-launcher.sh"

  spoke_check "updater installed and executable" \
    ssh_cmd "test -x ${APP}/scripts/kiosk-update.sh"

  spoke_check "splash page installed" \
    ssh_cmd "test -f ${APP}/share/connecting.html"

  # --- The layer no other test can reach ---------------------------------

  spoke_check "privileged helper is root-owned" \
    ssh_cmd "test -x ${HELPER} && [ \"\$(stat -c '%U:%G %a' ${HELPER})\" = 'root:root 755' ]"

  spoke_check "sudoers drop-in exists with 0440 root:root" \
    ssh_cmd "[ \"\$(sudo stat -c '%U:%G %a' /etc/sudoers.d/home-screens-kiosk-update)\" = 'root:root 440' ]"

  spoke_check "sudoers drop-in parses (visudo -c)" \
    ssh_cmd "sudo visudo -cf /etc/sudoers.d/home-screens-kiosk-update"

  # THE check. Everything else about the grant can look right while this
  # fails on a path mismatch or a bad user, and nothing short of real sudo
  # can tell you.
  spoke_check "sudo -n runs the privileged helper without a password" \
    ssh_cmd "sudo -n ${HELPER}"

  # What we can assert is the content of OUR drop-in: one grant, naming the
  # helper by absolute path, never a blanket NOPASSWD: ALL.
  #
  # Note what is deliberately NOT asserted: that the kiosk account lacks
  # broader sudo. It has it — cloud-init grants the default user
  # ALL=(ALL) NOPASSWD:ALL, and so does Raspberry Pi OS, which is the only
  # reason install.sh can call sudo throughout without prompting. Our grant
  # is a subset of what the account can already do; it exists so the
  # capability is written down and reviewable, not as a containment boundary.
  spoke_check "our sudoers drop-in grants exactly one command, not blanket root" \
    ssh_script <<'SUDOERS'
set -e
body="$(sudo grep -v '^\s*#' /etc/sudoers.d/home-screens-kiosk-update | grep -v '^\s*$')"
[ "$(printf '%s\n' "${body}" | wc -l)" -eq 1 ]
printf '%s' "${body}" | grep -q 'NOPASSWD: /usr/local/lib/home-screens/kiosk-update-privileged.sh$'
! printf '%s' "${body}" | grep -qE 'NOPASSWD:\s*ALL'
SUDOERS

  spoke_check "update service runs as the kiosk user (User= drop-in)" \
    ssh_cmd "systemctl cat home-screens-kiosk-update.service | grep -q '^User=hs'"

  spoke_check "update timer is enabled and armed" \
    ssh_cmd "systemctl is-enabled home-screens-kiosk-update.timer && systemctl list-timers --all | grep -q home-screens-kiosk-update"

  spoke_check "reporter timer is active" \
    ssh_cmd "systemctl is-active home-screens-reporter.timer"

  # --- One full update cycle through systemd -----------------------------

  spoke_check "update service completes (systemd honours SuccessExitStatus=10)" \
    ssh_cmd "sudo systemctl start home-screens-kiosk-update.service; ! systemctl is-failed --quiet home-screens-kiosk-update.service"

  spoke_check "version stamp now matches the hub" \
    ssh_cmd "[ \"\$(cat ${APP}/data/kiosk-bundle.version)\" = '$(hub_version)' ]"

  spoke_check "privileged half ran: reporter installed from the bundle" \
    ssh_cmd "test -x /usr/local/bin/home-screens-reporter.sh"

  spoke_check "no lock left behind" \
    ssh_cmd "! test -d ${APP}/data/.kiosk-update.lock"

  # --- The launcher actually launches ------------------------------------

  spoke_check "launcher execs chromium with the flags that started all this" \
    ssh_script <<LAUNCH
set -e
: > /tmp/kiosk-argv.log
HS_KIOSK_RELAUNCHED=1 timeout 60 ${APP}/scripts/kiosk-launcher.sh >/dev/null 2>&1 || true
grep -q 'chromium' /tmp/kiosk-argv.log
grep -q -- '--overscroll-history-navigation=0' /tmp/kiosk-argv.log
grep -q -- '--autoplay-policy=no-user-gesture-required' /tmp/kiosk-argv.log
grep -q -- '--remote-debugging-port=9222' /tmp/kiosk-argv.log
grep -q -- "--app=${HUB_URL}/display/${SPOKE_DISPLAY_ID}" /tmp/kiosk-argv.log
LAUNCH

  # --- The hub's view of it ----------------------------------------------

  spoke_check "reporter posts the display-software version to the hub" \
    ssh_cmd "sudo systemctl start home-screens-reporter.service"

  spoke_check "hub reports this display as up to date" \
    check_hub_sees_current
}

check_hub_sees_current() {
  local expected
  expected="$(hub_version)"
  local attempt=0
  while [ "${attempt}" -lt 15 ]; do
    if curl -fsS --max-time 3 "http://127.0.0.1:${HUB_PORT}/api/displays" 2>/dev/null \
      | node -e "
          let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
            const p=JSON.parse(d);
            const e=(p.displays||[]).find(x=>x.id==='${SPOKE_DISPLAY_ID}');
            const ok = e && e.displaySoftware
              && e.displaySoftware.updater === true
              && e.displaySoftware.version === '${expected}';
            process.exit(ok?0:1);
          });"
    then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  echo "hub never reported ${SPOKE_DISPLAY_ID} as updater:true version:${expected}"
  return 1
}

# ─── How the update is actually invoked ─────────────────────────────────────
#
# The checks above prove the update logic works when something runs it. These
# prove the three ways it actually gets run in the field, none of which is a
# human typing `systemctl start`:
#   - the nightly timer firing on its own
#   - the launcher applying an update at boot and relaunching itself
#   - the restart policy actually restarting a display that is asleep
#
# The last one matters most: `pkill -TERM chromium` is the single line that
# turns "files on disk" into "the change is on the screen", and until now only
# the branch that declines to restart had ever executed.

# Tell the hub what state the display's browser is in. The spoke's chromium is
# a stub here, so there is no real heartbeat — this is the same synthetic post
# the E2E suite uses.
post_display_state() {
  local state="$1"
  curl -fsS -X POST \
    "http://127.0.0.1:${HUB_PORT}/api/display/status?display=${SPOKE_DISPLAY_ID}" \
    -H 'Content-Type: application/json' \
    -d "{\"displayId\":\"${SPOKE_DISPLAY_ID}\",\"currentScreen\":{\"index\":0,\"id\":\"s\",\"name\":\"S\"},\"screenCount\":1,\"activeProfile\":null,\"displayState\":\"${state}\",\"timestamp\":$(date +%s)000}" \
    >/dev/null
}

manifest_restart_advised() {
  curl -fsS "http://127.0.0.1:${HUB_PORT}/api/display/kiosk-bundle?display=${SPOKE_DISPLAY_ID}&manifest=1" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
        process.stdout.write(String(JSON.parse(d).restartAdvised));});"
}

check_restart_when_asleep() {
  post_display_state asleep
  local advised
  advised="$(manifest_restart_advised)"
  if [ "${advised}" != "true" ]; then
    echo "hub did not advise a restart for a sleeping display (restartAdvised=${advised})"
    return 1
  fi

  # Give pkill something real to match. It has to be an executable literally
  # NAMED chromium: pkill matches on comm (the executable name), not argv[0],
  # so `exec -a chromium sleep` would still be a process called "sleep" and
  # the real `pkill -TERM chromium` would sail straight past it.
  ssh_script <<UPDATE_ASLEEP
set -e
rm -f ${APP}/data/kiosk-bundle.version
mkdir -p /tmp/fakekiosk && cp /bin/sleep /tmp/fakekiosk/chromium
setsid /tmp/fakekiosk/chromium 300 >/dev/null 2>&1 &
sleep 1
pgrep -x chromium >/dev/null || { echo "could not stage a chromium process"; exit 1; }
${APP}/scripts/kiosk-update.sh --restart-if-advised --timeout 20 || [ \$? -eq 10 ]
sleep 2
# The whole point: a sleeping display gets restarted, so the update reaches
# the screen tonight instead of whenever someone power-cycles it.
if pgrep -x chromium >/dev/null; then
  echo "chromium survived — the restart branch did not fire"
  exit 1
fi
UPDATE_ASLEEP
}

check_timer_fires() {
  # Override the nightly schedule with a few seconds so the timer's own
  # firing is observable. Everything else about the unit stays as shipped.
  ssh_script <<TIMER >/dev/null
set -e
sudo mkdir -p /etc/systemd/system/home-screens-kiosk-update.timer.d
sudo tee /etc/systemd/system/home-screens-kiosk-update.timer.d/99-test.conf >/dev/null <<EOF
[Timer]
OnCalendar=
Persistent=false
OnActiveSec=5s
# systemd defaults AccuracySec to 1 minute, so a 5s timer may legitimately
# fire a minute late. Tighten it or this check races the scheduler.
AccuracySec=1s
# The shipped timer spreads load with RandomizedDelaySec=45min, and a drop-in
# INHERITS it — leaving it set adds up to 45 minutes to the 5s trigger above.
RandomizedDelaySec=0
EOF
sudo systemctl daemon-reload
rm -f ${APP}/data/kiosk-bundle.version
sudo systemctl restart home-screens-kiosk-update.timer
TIMER

  # Nobody runs anything from here on: wait for the timer to do it.
  local attempt=0 stamp
  while [ "${attempt}" -lt 40 ]; do
    stamp="$(ssh_cmd "cat ${APP}/data/kiosk-bundle.version 2>/dev/null || true" | tr -d '[:space:]')"
    if [ "${stamp}" = "$(hub_version)" ]; then
      ssh_script <<'UNTIMER' >/dev/null
sudo rm -rf /etc/systemd/system/home-screens-kiosk-update.timer.d
sudo systemctl daemon-reload
UNTIMER
      return 0
    fi
    sleep 3
    attempt=$((attempt + 1))
  done
  echo "timer never applied an update on its own (stamp: '${stamp}')"
  # Say why, rather than leaving the next person to re-run a 10-minute VM
  # boot just to find out whether the timer never fired or the service failed.
  ssh_cmd "systemctl list-timers --all | grep -i kiosk-update; systemctl status home-screens-kiosk-update.service --no-pager -n 15 2>&1 | tail -20" || true
  ssh_script <<'UNTIMER' >/dev/null || true
sudo rm -rf /etc/systemd/system/home-screens-kiosk-update.timer.d
sudo systemctl daemon-reload
UNTIMER
  return 1
}

check_launcher_relaunch() {
  # No HS_KIOSK_RELAUNCHED this time: the launcher should find an update,
  # apply it, exec itself, and start Chromium on the second pass.
  ssh_script <<RELAUNCH
set -e
rm -f ${APP}/data/kiosk-bundle.version
: > /tmp/kiosk-argv.log
timeout 90 ${APP}/scripts/kiosk-launcher.sh >/dev/null 2>&1 || true
[ "\$(cat ${APP}/data/kiosk-bundle.version 2>/dev/null)" = "$(hub_version)" ] \
  || { echo "launcher did not apply the pending update"; exit 1; }
# Exactly once. Zero means it never reached the browser; more than one means
# HS_KIOSK_RELAUNCHED failed to stop a re-exec loop, which on a real display
# is an endless flicker.
n=\$(grep -c '^chromium ' /tmp/kiosk-argv.log || true)
[ "\${n}" -eq 1 ] || { echo "chromium launched \${n} times, expected exactly 1"; exit 1; }
RELAUNCH
}

run_invocation_checks() {
  step "Verifying how the update actually gets invoked"
  echo ""

  spoke_check "a sleeping display is restarted so the update reaches the screen" \
    check_restart_when_asleep

  # Leave the display awake again: the remaining checks should not inherit a
  # restart-advised hub.
  post_display_state active

  spoke_check "the nightly timer applies an update with nobody running it" \
    check_timer_fires

  spoke_check "the launcher applies a pending update and relaunches exactly once" \
    check_launcher_relaunch
}

# ─── Migration test: a Pi that predates self-update ─────────────────────────
#
# The highest-value scenario in this file, and the one I could not reach from
# macOS. It strips the machinery back to what a Pi flashed before self-update
# existed actually has, confirms the hub notices, then runs the one-time
# command from the editor and confirms the Pi converges on its own.

run_migration_test() {
  step "Migration: a pre-self-update spoke adopts automatic updates"
  echo ""

  info "Rolling the VM back to a pre-self-update state..."
  ssh_script <<ROLLBACK >/dev/null
set -e
sudo systemctl disable --now home-screens-kiosk-update.timer 2>/dev/null || true
sudo rm -f /etc/systemd/system/home-screens-kiosk-update.{service,timer}
sudo rm -rf /etc/systemd/system/home-screens-kiosk-update.service.d
sudo rm -f /etc/sudoers.d/home-screens-kiosk-update
sudo rm -rf /usr/local/lib/home-screens
sudo systemctl daemon-reload
rm -f ${APP}/scripts/kiosk-update.sh ${APP}/data/kiosk-bundle.version
rm -rf ${APP}/scripts/.prev
# The frozen launcher these Pis actually carry: no update hook, and missing
# the three Chromium flags added after they were flashed.
cat > ${APP}/scripts/kiosk-launcher.sh <<'OLD'
#!/usr/bin/env bash
APP_DIR="\$(cd "\$(dirname "\$0")/.." && pwd)"
source "\${APP_DIR}/data/kiosk.conf"
exec chromium --app="\${DISPLAY_URL}" --noerrdialogs --no-first-run --ozone-platform=wayland
OLD
chmod +x ${APP}/scripts/kiosk-launcher.sh
ROLLBACK

  spoke_check "hub sees a pre-self-update display (needs setup)" \
    check_hub_sees_needs_setup

  spoke_check "the old launcher is genuinely missing the newer flags" \
    ssh_script <<OLDFLAGS
set -e
: > /tmp/kiosk-argv.log
timeout 30 ${APP}/scripts/kiosk-launcher.sh >/dev/null 2>&1 || true
! grep -q -- '--remote-debugging-port=9222' /tmp/kiosk-argv.log
OLDFLAGS

  info "Running the one-time setup command from the editor..."
  local out
  if out=$(ssh_cmd "curl -fsS '${HUB_URL}/api/display/kiosk-bootstrap?display=${SPOKE_DISPLAY_ID}' | bash" 2>&1); then
    info "Bootstrap completed."
    [ "${VERBOSE}" = true ] && echo "${out}" || true
  else
    err "Bootstrap failed. Output:"
    echo "${out}"
    SPOKE_FAIL=$((SPOKE_FAIL + 1))
  fi

  spoke_check "machinery is back (helper, sudoers, timer)" \
    ssh_cmd "test -x ${HELPER} && sudo visudo -cf /etc/sudoers.d/home-screens-kiosk-update && systemctl is-enabled home-screens-kiosk-update.timer"

  spoke_check "bootstrap applied a version, not just the machinery" \
    ssh_cmd "[ \"\$(cat ${APP}/data/kiosk-bundle.version)\" = '$(hub_version)' ]"

  spoke_check "launcher is current again, with the newer flags" \
    ssh_script <<NEWFLAGS
set -e
: > /tmp/kiosk-argv.log
HS_KIOSK_RELAUNCHED=1 timeout 60 ${APP}/scripts/kiosk-launcher.sh >/dev/null 2>&1 || true
grep -q -- '--remote-debugging-port=9222' /tmp/kiosk-argv.log
NEWFLAGS

  # The one that proves the migration is *visible*: the editor must stop
  # showing "Needs setup" with no further action from the user.
  spoke_check "hub now reports the display as up to date" \
    spoke_recheck_current
}

spoke_recheck_current() {
  ssh_cmd "sudo systemctl start home-screens-reporter.service" >/dev/null 2>&1 || true
  check_hub_sees_current
}

check_hub_sees_needs_setup() {
  local attempt=0
  ssh_cmd "sudo systemctl start home-screens-reporter.service" >/dev/null 2>&1 || true
  while [ "${attempt}" -lt 15 ]; do
    if curl -fsS --max-time 3 "http://127.0.0.1:${HUB_PORT}/api/displays" 2>/dev/null \
      | node -e "
          let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
            const p=JSON.parse(d);
            const e=(p.displays||[]).find(x=>x.id==='${SPOKE_DISPLAY_ID}');
            process.exit(e && e.displaySoftware && e.displaySoftware.updater === false ? 0 : 1);
          });"
    then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  echo "hub never reported ${SPOKE_DISPLAY_ID} as needing setup"
  return 1
}

report_spoke_results() {
  local total=$((SPOKE_PASS + SPOKE_FAIL))
  echo ""
  echo -e "─────────────────────────────────────"
  if [ "${SPOKE_FAIL}" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}  All ${total} spoke checks passed${NC}"
  else
    echo -e "${RED}${BOLD}  ${SPOKE_FAIL}/${total} spoke checks failed${NC}"
  fi
  echo -e "─────────────────────────────────────"
  echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BOLD}Home Screens — Install Emulation${NC}"
  echo -e "${DIM}Debian 12 ARM64 via QEMU/HVF on Apple Silicon${NC}"
  [ "${DISPLAY_ONLY}" = true ] && echo -e "${DIM}Scenario: display-only spoke + self-update${NC}" || true
  echo ""

  check_prerequisites
  ensure_base_image
  create_work_dir
  create_seed_iso

  if [ "${DISPLAY_ONLY}" = true ]; then
    # Start the hub before the VM: the spoke install health-checks the backend
    # during its very first launcher run, so it should already be answering.
    if [ -n "${HUB_URL}" ]; then
      info "Using the hub you specified: ${HUB_URL}"
      warn "Adopt display '${SPOKE_DISPLAY_ID}' on that hub, or the endpoints will 403."
    else
      start_sandbox_hub
    fi
    boot_vm
    wait_for_ssh
    wait_for_cloud_init
    push_local_scripts
    stub_gui_packages
    run_display_only_install
    install_kiosk_stubs
    run_spoke_verification
    run_invocation_checks
    run_migration_test
    report_spoke_results

    if [ "${KEEP_VM}" = true ]; then
      info "VM still running. SSH in:"
      echo "  ssh -i ${WORK_DIR}/id_ed25519 -p ${SSH_PORT} hs@localhost"
      [ -n "${HUB_SANDBOX}" ] && info "Hub: http://localhost:${HUB_PORT} (data: ${HUB_SANDBOX}/data)" || true
      rm -f "${WORK_DIR}/qemu.pid"
    fi
    exit $([ "${SPOKE_FAIL}" -eq 0 ] && echo 0 || echo 1)
  fi

  boot_vm
  wait_for_ssh
  wait_for_cloud_init
  run_install
  start_and_health_check

  VERIFY_EXIT=0
  run_verification

  if [ "${KEEP_VM}" = true ]; then
    info "VM is still running. SSH in with:"
    echo "  ssh -i ${WORK_DIR}/id_ed25519 -p ${SSH_PORT} hs@localhost"
    echo ""
    info "App accessible at: http://localhost:${APP_PORT}"
    info "Kill VM manually: kill \$(cat ${WORK_DIR}/qemu.pid)"
    rm -f "${WORK_DIR}/qemu.pid"
  fi

  exit "${VERIFY_EXIT}"
}

main
