---
title: Raspberry Pi
nextjs:
  metadata:
    title: Raspberry Pi Deployment
    description: Deploy Home Screens as a kiosk display on Raspberry Pi.
---

Home Screens is designed to run as a dedicated kiosk display on a Raspberry Pi. The install script handles the full setup from a fresh Raspberry Pi OS installation.

## Requirements

- Raspberry Pi 4 or 5 (2 GB+ RAM recommended)
- [Raspberry Pi OS Lite 64-bit (Trixie)](https://www.raspberrypi.com/software/operating-systems/) recommended (Desktop also supported)
- A display connected via HDMI
- Network connection (Ethernet or Wi-Fi)

## Install

### Raspberry Pi OS Lite (recommended)

Clone the repo and run the install script:

```bash
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh
```

### Raspberry Pi OS with Desktop

If you're running the full Desktop image, pass the `--desktop` flag:

```bash
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh --desktop
```

### Installer Flags

| Flag | Description |
|---|---|
| `--desktop` | Use Desktop mode instead of Lite (configures kiosk via autostart instead of cage on TTY1) |
| `--version v1.2.0` | Install a specific release instead of the latest |
| `--port 8080` | Run the server on a custom port instead of the default 3000 |

### What the installer does

1. **Node.js 22** — installs via NodeSource
2. **Latest release** — downloads the pre-built tarball from GitHub Releases to `/opt/home-screens/`
3. **Chromium + cage** — installs the browser and Wayland kiosk compositor
4. **systemd service** — creates and enables the `home-screens` server
5. **Kiosk auto-launch** — configures Chromium in fullscreen kiosk mode via cage on TTY1
6. **Autologin** — configures automatic login for the kiosk user
7. **Boot splash** — Plymouth theme with quiet boot (no kernel text, no rainbow screen)

### Boot Splash

The installer configures a clean boot experience with a Plymouth splash screen. Kernel text output and the rainbow screen are suppressed for a polished, appliance-like startup. This applies to both Desktop and Lite installs.

On Lite installs, additional packages are installed: `fonts-noto-core` (base fonts), `libpam-systemd` (session management), and `dbus-user-session` (D-Bus session bus).

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

It also asks for your display resolution, or auto-detects the native resolution from the connected display if you leave it blank. These choices are saved to `config.json` and `data/kiosk.conf` so that the kiosk launches with the correct orientation and resolution from first boot.

To change the orientation after installation, use the display transform setting in the editor (**Settings > Display**), or run:

```bash
bash scripts/rotate-display.sh
```

The available transforms are: `normal`, `90`, `180`, `270`.

## Managing Services

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

## Manual Start

To run without systemd (useful for debugging):

```bash
bash scripts/start-display.sh
```

This starts the Next.js server and opens Chromium in kiosk mode.

## Upgrading

You can upgrade from the editor's **System Panel > Check for Updates**, or via the API:

```bash
curl -X POST http://localhost:3000/api/system/upgrade -H 'Content-Type: application/json' -d '{"tag":"v0.14.0"}'
```

The upgrade process downloads the pre-built release tarball from GitHub, atomically swaps the application directory, and restarts the service. No build step is needed on the Pi.

## Rolling Back

If an upgrade causes problems, roll back to the previous version:

- From the editor's **System Panel > Rollback**
- Or via the API: `curl -X POST http://localhost:3000/api/system/rollback`

## Troubleshooting

### Display is blank

1. Check the service is running: `sudo systemctl status home-screens`
2. Check logs: `journalctl -u home-screens -f`
3. Verify the app is accessible: `curl http://localhost:3000/display`
4. Check if the sleep schedule is active — disable it temporarily in settings

### Chromium won't start

1. Make sure you're logged in (autologin should handle this)
2. Check that cage is running: `pgrep cage`
3. Check `.bash_profile` has the kiosk block: `grep 'Home Screens Kiosk' ~/.bash_profile`
4. Try starting manually: `bash scripts/start-display.sh`
5. On Lite installs, verify D-Bus is available: `echo $DBUS_SESSION_BUS_ADDRESS`

### Screen keeps going black

The Wayland compositor (cage) should prevent screen blanking. If it persists, check for DPMS settings:

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
