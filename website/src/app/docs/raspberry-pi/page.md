---
title: Raspberry Pi
nextjs:
  metadata:
    title: Raspberry Pi Deployment
    description: Deploy Home Screens as a fullscreen kiosk display on Raspberry Pi. Turnkey install with auto-start, OTA updates, and rollback.
    alternates:
      canonical: /docs/raspberry-pi
---

Home Screens is designed to run as a dedicated kiosk display on a Raspberry Pi. The install script handles the full setup from a fresh Raspberry Pi OS installation.

{% callout %}
For the fastest setup, consider using a [pre-built image](/docs/getting-started#pre-built-image) instead — flash to an SD card and boot directly with no manual installation required. Images are available for major and minor releases.
{% /callout %}

## Requirements

- Raspberry Pi 4 or 5 (2 GB+ RAM recommended)
- [Raspberry Pi OS Lite 64-bit (Trixie)](https://www.raspberrypi.com/software/operating-systems/) recommended (Desktop also supported). In Raspberry Pi Imager, look under **Raspberry Pi OS (other)** to find the Lite image.
- A display connected via HDMI
- Network connection (Ethernet or Wi-Fi)

## Install

The install command lives on the [Installation page](/docs/getting-started#install-script), along with the Desktop variant and how to pass flags through `curl`. Come back here for what to do afterwards.

Two options worth knowing about: `--display-only` turns this Pi into a spoke pointing at an existing hub (see the [Multi-display guide](/docs/multi-display)), and the full list is under [Installer flags](#installer-flags) below.

## Post-Install

Reboot to start the kiosk:

```bash
sudo reboot
```

After reboot, the display should automatically show the fullscreen view. To configure your screens, visit `http://<pi-ip>:3000/editor` from another device on your network.

### Configuring API Keys

API keys are configured through the editor UI, not environment files. Open the editor and go to **Settings > API keys** to enter your API keys for weather providers, Unsplash, Todoist, TomTom, and other services.

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

To change the orientation after installation, use the display transform setting in the editor (**Settings > Screen**).

## Upgrading

You can upgrade from the editor's **Settings > System & updates > Check for Updates**. The upgrade downloads the latest release from GitHub and restarts the service. No build step is needed on the Pi.

## Rolling Back

If an upgrade causes problems, roll back to the previous version from the editor's **Settings > System & updates > Rollback**.

## Troubleshooting

Pi-specific problems are covered below. Everything else — blank displays, modules not updating, memory pressure, WiFi drops, rotation, upgrades — lives on the [Troubleshooting page](/docs/troubleshooting).

Before digging in, grab a **diagnostics bundle** from **Settings > Status**. One click packages your configuration (with passwords and keys removed), recent logs, the state of every display, and a list of installed plugins into a single zip file you can attach to a GitHub issue. It saves a lot of back-and-forth, and it often shows you the answer directly.

### Chromium won't start

1. Make sure you're logged in (autologin should handle this)
2. Check that labwc is running: `pgrep labwc`
3. Check `.bash_profile` has the kiosk block: `grep 'Home Screens Kiosk' ~/.bash_profile`
4. Try launching the browser by hand, from a keyboard attached to the Pi rather than over SSH: `bash /opt/home-screens/current/scripts/kiosk-launcher.sh`
5. On Lite installs, verify D-Bus is available: `echo $DBUS_SESSION_BUS_ADDRESS`

### Screen keeps going black

First check whether the screen is genuinely powered off or just showing black. Home Screens dims and sleeps by drawing a black layer over the page; the monitor stays on and lit the whole time. So if the panel is still backlit, this is the sleep schedule, and you can change it in **Settings > Screen**. If the panel has actually powered down, that is your monitor or the Wayland compositor, not Home Screens.

The compositor (labwc) should prevent screen blanking. To inspect the display state, run:

```bash
# Check current display power state
XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 wlr-randr
```

Those two environment variables are required. Over SSH they are not set for you, and a bare `wlr-randr` fails with no useful message.

---

## Reference

### Installer flags

| Flag | Description |
|---|---|
| `--desktop` | Use Desktop mode instead of Lite |
| `--version v1.2.0` | Install a specific release instead of the latest |
| `--port 8080` | Run the server on a custom port instead of the default 3000 |
| `--non-interactive` | Skip all prompts and use defaults (portrait 90° rotation, auto-detected resolution) |
| `--display-only` | Install as a display-only spoke that points at an existing Home Screens hub. Skips Node.js, the app tarball, and the Home Screens server service. Installs Chromium, labwc and the kiosk launcher, the boot splash, autologin, and the hardware reporter. Requires `--backend`. |
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

Once adopted, a spoke keeps its own software up to date automatically: it checks the hub nightly and at every start, downloads updates only when the hub has a newer version, verifies the download before applying it, and keeps the previous version for rollback. A spoke that's awake and in use is never restarted to finish an update. Pis installed before this existed show a one-line setup command in the editor next to their display.

### What the installer does

1. **Node.js** — installs the runtime needed to run the server (full install only; display-only spokes skip this)
2. **Latest release** — downloads the pre-built app from GitHub (full install only)
3. **Browser** — installs Chromium and the labwc Wayland compositor for fullscreen kiosk display with proper cursor hiding on touchscreens
4. **Background service** — sets up `home-screens.service` to start automatically on boot (full install only)
5. **Autologin** — configures the Pi to log in and launch the display without interaction
6. **Plymouth boot splash** — installs the Home Screens-branded theme so the Pi boots through a clean splash instead of the Raspberry rainbow → black-screen → kiosk transition. The display-only install path invokes the same helper so spokes get the splash too
7. **WiFi hardening** (full install only) — applies reliability fixes for headless displays (infinite reconnect retries, connectivity watchdog, disabled suspend; see [Networking > WiFi reliability](/docs/networking#wi-fi-reliability))
8. **systemd-journal group** (full install only) — adds the service user to `systemd-journal` so `journalctl -u home-screens` works without sudo and the diagnostics bundle can capture logs
9. **Hardware reporter** (display-only spokes only) — installs `/usr/local/bin/home-screens-reporter.sh`, the `home-screens-reporter.service` unit, and a 30-second timer that POSTs CPU load, temperature, throttling state, memory and disk usage to the hub's `/api/display/hw-stats` endpoint. No token — the hub authorizes by checking the spoke's display ID against `config.displays`
10. **SD card wear reduction** (full install only) — keeps the system journal in memory instead of writing it to the card, removes the swap file and tunes the kernel instead, and disables background services a kiosk does not need

Steps marked "full install only" are skipped on display-only spokes, which finish their setup earlier and never reach the system-tuning stage.

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

### Service stop behavior

The systemd unit uses `TimeoutStopSec=15` and `KillMode=mixed` so that `systemctl stop home-screens` completes in at most 15 seconds. Without these settings, the npm wrapper can take up to 90 seconds to stop because it does not forward `SIGTERM` to its Node.js child. The `mixed` kill mode sends a polite `SIGTERM` to the main process, then escalates to `SIGKILL` on the entire cgroup if it hasn't exited within the timeout — ensuring no orphan processes survive a restart.

### Manual start

To run the server in the foreground instead of as a background service, which puts its output straight on your screen while you debug:

```bash
sudo systemctl stop home-screens
cd /opt/home-screens/current && PORT=3000 node server.js
```

To launch the kiosk browser by hand, from a keyboard attached to the Pi rather than over SSH:

```bash
bash /opt/home-screens/current/scripts/kiosk-launcher.sh
```

{% callout %}
`scripts/start-display.sh` is for developers working from a source checkout only. It rebuilds the app before starting, and an installed Pi has no build tools, so it cannot work there.
{% /callout %}

### Upgrade and rollback via API

```bash
# Upgrade to a specific version
curl -X POST http://localhost:3000/api/system/upgrade \
  -H 'Content-Type: application/json' \
  -d '{"tag":"v1.2.0"}'

# Roll back to a previously-installed version (tag required)
curl -X POST http://localhost:3000/api/system/rollback \
  -H 'Content-Type: application/json' \
  -d '{"tag":"v1.1.0"}'
```

Three things to know about these:

- If you have set a password, both need a logged-in editor session. The display token used for `/api/display/*` commands is not accepted here.
- A success response means the job **started**, not that it finished. Watch progress with `journalctl -u home-screens -f`, or poll `/api/system/status`.
- Calling either one while an upgrade is already running returns `409` and does nothing.

### Changing orientation via command line

Change orientation in the editor under **Settings > Screen** where you can. It applies straight away with no reboot, and it is saved.

If you need to do it from the command line:

```bash
XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 \
  bash /opt/home-screens/current/scripts/rotate-display.sh 90
```

The accepted values are `0`, `90`, `180`, and `270`. The two environment variables are required; without them the script cannot talk to the display and exits without changing anything, which over SSH it will do every time.

Treat this as a stopgap. It does not update your saved settings, so the next upgrade puts the orientation back to whatever **Settings > Screen** says.
