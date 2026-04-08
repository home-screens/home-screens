---
title: Raspberry Pi
nextjs:
  metadata:
    title: Raspberry Pi Deployment
    description: Deploy Home Screens as a fullscreen kiosk display on Raspberry Pi. Turnkey install with auto-start, OTA updates, and rollback.
---

Home Screens is designed to run as a dedicated kiosk display on a Raspberry Pi. The install script handles the full setup from a fresh Raspberry Pi OS installation.

{% callout %}
For the fastest setup, consider using a [pre-built image](/docs/getting-started#pre-built-image) instead — flash to an SD card and boot directly with no manual installation required. Images are available for major and minor releases.
{% /callout %}

## Requirements

- Raspberry Pi 4 or 5 (2 GB+ RAM recommended)
- [Raspberry Pi OS Lite 64-bit (Trixie)](https://www.raspberrypi.com/software/operating-systems/) recommended (Desktop also supported)
- A display connected via HDMI
- Network connection (Ethernet or Wi-Fi)

## Install

### Raspberry Pi OS Lite (recommended)

Clone the repo and run the install script:

```bash
sudo apt install git
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh
```

### Raspberry Pi OS with Desktop

If you're running the full Desktop image, pass the `--desktop` flag:

```bash
sudo apt install git
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh --desktop
```

## Post-Install

Reboot to start the kiosk:

```bash
sudo reboot
```

After reboot, the display should automatically show the fullscreen view. To configure your screens, visit `http://<pi-ip>:3000/editor` from another device on your network.

### Configuring API Keys

API keys are configured through the editor UI, not environment files. Open the editor and go to **Settings > Integrations** to enter your API keys for weather providers, Unsplash, Todoist, TomTom, and other services.

## Display Orientation

During installation, the script prompts you to choose your display orientation:

```
How is your display oriented?
1) Portrait (default, rotated 90° clockwise)
2) Portrait (rotated 90° counter-clockwise)
3) Landscape (no rotation)
4) Inverted (rotated 180°)
```

It also asks for your display resolution, or auto-detects the native resolution from the connected display if you leave it blank.

To change the orientation after installation, use the display transform setting in the editor (**Settings > Display**).

## Upgrading

You can upgrade from the editor's **System Panel > Check for Updates**. The upgrade downloads the latest release from GitHub and restarts the service. No build step is needed on the Pi.

## Rolling Back

If an upgrade causes problems, roll back to the previous version from the editor's **System Panel > Rollback**.

## Troubleshooting

### Display is blank

1. Check the service is running: `sudo systemctl status home-screens`
2. Check logs: `journalctl -u home-screens -f`
3. Verify the app is accessible: `curl http://localhost:3000/display`
4. Check if the sleep schedule is active — disable it temporarily in settings

### Chromium won't start

1. Make sure you're logged in (autologin should handle this)
2. Check that labwc is running: `pgrep labwc`
3. Check `.bash_profile` has the kiosk block: `grep 'Home Screens Kiosk' ~/.bash_profile`
4. Try starting manually: `bash scripts/start-display.sh`
5. On Lite installs, verify D-Bus is available: `echo $DBUS_SESSION_BUS_ADDRESS`

### Screen keeps going black

The Wayland compositor (labwc) should prevent screen blanking. If it persists, check for DPMS settings:

```bash
# Check current display power state
wlr-randr
```

### Can't reach the editor from another device

1. Find the Pi's IP: `hostname -I`
2. Make sure port 3000 is not blocked by a firewall
3. Access `http://<pi-ip>:3000/editor` from a browser on the same network

### High memory usage

If the Pi runs low on memory:

- Use a Pi with 4 GB+ RAM
- Close any other running applications
- Consider reducing the number of modules that make API calls
- Increase swap: `sudo dphys-swapfile swapoff && sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile && sudo dphys-swapfile setup && sudo dphys-swapfile swapon`

---

## Reference

### Installer flags

| Flag | Description |
|---|---|
| `--desktop` | Use Desktop mode instead of Lite |
| `--version v1.2.0` | Install a specific release instead of the latest |
| `--port 8080` | Run the server on a custom port instead of the default 3000 |
| `--non-interactive` | Skip all prompts and use defaults (portrait 90° rotation, auto-detected resolution) |
| `--display-only` | Install as a display-only spoke that points at an existing Home Screens hub. Skips Node.js, the app tarball, and the systemd service — installs only Chromium, labwc, wtype, wlr-randr, and the kiosk launcher. Requires `--backend`. |
| `--backend <url>` | Hub URL the display-only kiosk should point at (e.g. `--backend http://192.168.1.100:3000`). Required with `--display-only`. |
| `--display-id <id>` | Optional display ID this spoke registers under. Must be lowercase letters, digits, and hyphens, max 64 characters. If omitted, the installer auto-generates one from the hostname plus a 4-character random suffix (e.g. `home-screens-hysd`) so two Pis with the same hostname don't collide. |

### Display-only spokes

To set up a Pi as a display-only spoke pointing at an existing hub:

```bash
# Auto-generated display ID
~/home-screens/scripts/install.sh --display-only --backend http://192.168.1.100:3000

# Explicit display ID
~/home-screens/scripts/install.sh --display-only --backend http://hub:3000 --display-id kitchen
```

After install and reboot, the spoke contacts the hub and appears in the editor's **Settings > Per display > All displays** page under **Unadopted Displays**, ready to be adopted. See the [Multi-display guide](/docs/multi-display) for the full hub-and-spoke flow.

### What the installer does

1. **Node.js** — installs the runtime needed to run the server
2. **Latest release** — downloads the pre-built app from GitHub
3. **Browser** — installs Chromium and the labwc Wayland compositor for fullscreen kiosk display with proper cursor hiding on touchscreens
4. **Background service** — sets up Home Screens to start automatically on boot
5. **Autologin** — configures the Pi to log in and launch the display without interaction
6. **Boot splash** — shows a clean loading screen instead of terminal text during startup
7. **WiFi hardening** — applies reliability fixes for headless displays (infinite reconnect retries, connectivity watchdog, disabled suspend; see [Networking > WiFi reliability](/docs/networking#wifi-reliability))

### Managing services

```bash
# Start/stop the server
sudo systemctl start home-screens
sudo systemctl stop home-screens

# Check status
sudo systemctl status home-screens

# View logs (follow mode)
journalctl -u home-screens -f

# Restart everything
sudo systemctl restart home-screens
```

### Manual start

To run without the background service (useful for debugging):

```bash
bash scripts/start-display.sh
```

### Upgrade and rollback via API

```bash
# Upgrade to a specific version
curl -X POST http://localhost:3000/api/system/upgrade -H 'Content-Type: application/json' -d '{"tag":"v0.14.0"}'

# Roll back to the previous version
curl -X POST http://localhost:3000/api/system/rollback
```

### Changing orientation via command line

```bash
bash scripts/rotate-display.sh
```

The available transforms are: `normal`, `90`, `180`, `270`.
