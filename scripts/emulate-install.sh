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
# Prerequisites: brew install qemu cdrtools
#
# Usage:
#   ./scripts/emulate-install.sh                      # Test latest release
#   ./scripts/emulate-install.sh --version v0.20.0    # Test specific version
#   ./scripts/emulate-install.sh --keep --verbose      # Debug mode (VM stays up)

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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      if [ -z "${2:-}" ]; then echo -e "${RED}[x]${NC} --version requires a tag"; exit 1; fi
      VERSION_FLAG="$2"; shift 2 ;;
    --keep)       KEEP_VM=true; shift ;;
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
      echo "  -h, --help       Show this help"
      echo ""
      echo "Prerequisites: brew install qemu cdrtools"
      echo ""
      echo "Examples:"
      echo "  $0                          # test latest release"
      echo "  $0 --version v0.20.0        # test specific version"
      echo "  $0 --keep --verbose         # debug mode"
      echo "  $0 --curl                       # test curl|bash install"
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

# ─── Cleanup ─────────────────────────────────────────────────────────────────

cleanup() {
  local exit_code=$?

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

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BOLD}Home Screens — Install Emulation${NC}"
  echo -e "${DIM}Debian 12 ARM64 via QEMU/HVF on Apple Silicon${NC}"
  echo ""

  check_prerequisites
  ensure_base_image
  create_work_dir
  create_seed_iso
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
