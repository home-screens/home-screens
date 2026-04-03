# Home Screens - Raspberry Pi Image Builder

This directory contains scripts for building a custom Raspberry Pi image pre-loaded with Home Screens.

## Quick Start

### Prerequisites

1. Fresh Raspberry Pi OS Lite (64-bit) installed on SD card
   - Download from https://www.raspberrypi.com/software/operating-systems/
2. Pi connected to network (Ethernet recommended)
3. SSH access enabled

### Building on a Raspberry Pi

```bash
# SSH into your Pi
ssh pi@raspberrypi.local

# Make sure git is installed
sudo apt install git

# Clone the repo (or just the image-creation directory)
git clone https://github.com/home-screens/home-screens.git
cd home-screens/image-creation

# Development build (keeps build tools, good for testing)
sudo ./build-image.sh

# Distribution build (cleans up for smaller image)
sudo ./build-image.sh --img

# Build from a specific release tag
sudo HS_BRANCH=v1.0.0 ./build-image.sh --img

# Development: use local repo instead of downloading from GitHub
sudo HS_LOCAL=true ./build-image.sh
```

## Build Stages

| Stage | Script | Description |
|-------|--------|-------------|
| 01 | `01-base-setup.sh` | Hostname, user, SSH, locale, timezone |
| 02 | `02-package-cleanup.sh` | Remove unnecessary packages, disable services |
| 03 | `03-install-deps.sh` | Node.js, Chromium, labwc, fonts, Plymouth |
| 04 | `04-install-app.sh` | Download release tarball, install, configure |
| 05 | `05-configure.sh` | OS-level optimizations (journal, swap, tmpfs) |
| 99 | `99-finalize.sh` | Distribution cleanup (`--img` only) |

## How It Works

The build process downloads a pre-built release tarball from GitHub and uses the existing `scripts/upgrade.sh setup-system` for application-level configuration. The image-creation scripts handle:

1. **OS preparation** — Hostname (`home-screens`), user (`hs`), locale, SSH
2. **Package management** — Install display stack (Chromium, labwc), remove bloat
3. **App installation** — Download release tarball or build from local source
4. **System setup** — Delegates to `upgrade.sh setup-system` for services, kiosk, Plymouth, autologin
5. **Optimization** — Volatile journal, zram swap, tmpfs mounts, boot speed
6. **Finalize** — Clear caches, SSH keys, machine-id, first-boot service

## Creating a Distributable Image

After running `./build-image.sh --img`:

### 1. Shutdown the Pi

```bash
sudo shutdown -h now
```

### 2. Remove SD card and insert into your computer

### 3. Identify the device

**Linux:**
```bash
lsblk
# Look for your SD card size, e.g., /dev/sdc
```

**macOS:**
```bash
diskutil list
# Look for your SD card size, e.g., /dev/disk4
```

### 4. Create the image

**Linux:**
```bash
sudo dd if=/dev/sdX of=home-screens-v1.0.0.img bs=4M status=progress
```

**macOS:**
```bash
diskutil unmountDisk /dev/diskN
sudo dd if=/dev/rdiskN of=home-screens-v1.0.0.img bs=4m status=progress
```

### 5. Shrink the image

**macOS** (requires [PiShrink-macOS](https://github.com/lisanet/PiShrink-macOS)):
```bash
# Install once:
git clone https://github.com/lisanet/PiShrink-macOS.git
cd PiShrink-macOS && make && sudo make install

# Shrink:
./shrink-image.sh home-screens-v1.0.0.img
```

**Linux** (uses Podman/Docker automatically):
```bash
./shrink-image.sh home-screens-v1.0.0.img
```

### 6. Compress

```bash
# xz compression (smaller, recommended)
xz -9 -T0 home-screens-v1.0.0.img

# or zip (faster, larger)
zip -9 home-screens-v1.0.0.zip home-screens-v1.0.0.img
```

### 7. Upload to GitHub release

```bash
./upload-image.sh v1.0.0 home-screens-v1.0.0.img.xz
```

## Directory Structure

```
image-creation/
├── build-image.sh          # Main build orchestrator
├── shrink-image.sh         # PiShrink wrapper (native macOS / Podman Linux)
├── upload-image.sh         # Upload image to GitHub release
├── README.md               # This file
└── scripts/
    ├── 01-base-setup.sh    # System configuration
    ├── 02-package-cleanup.sh # Remove bloat
    ├── 03-install-deps.sh  # Install dependencies
    ├── 04-install-app.sh   # Install Home Screens
    ├── 05-configure.sh     # OS optimizations
    └── 99-finalize.sh      # Distribution cleanup
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HS_BRANCH` | (latest) | Git tag to download from GitHub |
| `HS_LOCAL` | `false` | Set to `true` to build from local repo |
| `HS_VERSION` | `dev` | Version string for logging |

### Source Selection

By default, the build downloads the latest release tarball from GitHub. This ensures production images don't include development artifacts.

```bash
# Production: build from release tag
sudo HS_BRANCH=v1.0.0 ./build-image.sh --img

# Production: build from latest release (default)
sudo ./build-image.sh --img

# Development: build from local source (use with caution)
sudo HS_LOCAL=true ./build-image.sh
```

When `HS_LOCAL=true`, the build uses the parent directory of `image-creation/` as the source. This runs `npm ci && npm run build` on the Pi and assembles the standalone output.

## What's on the Image

### User Account

- **Username:** `hs`
- **Password:** `screens`
- **SSH:** Enabled with password authentication

### Packages

**Installed:**
- Node.js 22 (Next.js server runtime)
- Chromium (kiosk browser)
- labwc (Wayland compositor)
- wtype, wlr-randr (display utilities)
- Plymouth (boot splash)
- Fonts (Noto Color Emoji, Noto Core)

**Removed in distribution build:**
- Git, build-essential, gcc, make

### Services

- `home-screens.service` — Next.js server (port 3000)
- labwc → Chromium kiosk (auto-launches on TTY1)
- Plymouth boot splash

### Optimizations

- **Journal:** Volatile (RAM), 16MB max
- **Swap:** Disabled (zram enabled, 25% of RAM)
- **tmpfs:** /tmp (256MB), /var/tmp (128MB)
- **Boot:** Quiet, no logo, no cursor, splash screen
- **Display:** Portrait 1080x1920 (90° rotation, configurable via editor)

### First Boot

The image includes a first-boot service that:
- Regenerates SSH host keys (unique per device)
- Regenerates machine-id
- Expands filesystem to fill the SD card

## Supported Platforms

- Raspberry Pi 5 (recommended)
- Raspberry Pi 4 (2GB+ RAM)
- Raspberry Pi Zero 2 W (limited, 512MB RAM)

## Troubleshooting

### Build fails at package installation

```bash
sudo apt-get update
sudo apt-get -f install
```

### Service won't start

```bash
systemctl status home-screens
journalctl -u home-screens -f
```

### Display not showing

```bash
# Check labwc is running
ps aux | grep labwc

# Check kiosk config
cat /opt/home-screens/current/data/kiosk.conf

# Check autologin
cat /etc/systemd/system/getty@tty1.service.d/autologin.conf
```

## References

- [Home Screens install.sh](../scripts/install.sh) — Standard installation script
- [upgrade.sh setup-system](../scripts/upgrade.sh) — System configuration (services, kiosk, Plymouth)
- [PiShrink-macOS](https://github.com/lisanet/PiShrink-macOS) — Native macOS image shrinking (no VM needed)
- [PiShrink](https://github.com/Drewsif/PiShrink) — Original PiShrink (Linux, used via Podman container)
- [Raspberry Pi docs](https://homescreens.dev/docs/raspberry-pi) — Kiosk deployment guide
