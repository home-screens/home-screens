---
title: Raspberry Pi internals
nextjs:
  metadata:
    title: Raspberry Pi internals
    description: What the Home Screens installer does to a Raspberry Pi, its flags, the services it sets up, and how to drive it from a terminal.
    alternates:
      canonical: /docs/raspberry-pi
---

Everyday tasks on the Pi are done in the editor, listed first. The rest of this page is for people who are comfortable with a terminal and want to know what the installer set up. {% .lead %}

## Without a terminal

- **Orientation:** Settings > Screen > Rotation & appearance. The picture turns straight away, no reboot.
- **Update or roll back:** Settings > System & updates. **Check for Updates** installs the latest release; the list under **If an update caused trouble** goes back to any earlier one.
- **Restart:** the same page has **Restart Home Screens** (a few seconds) and **Restart the whole device** (a minute or two).
- **When something is wrong:** Settings > Status shows the display's state and the Pi's temperature, memory and storage, and its **Diagnostics bundle** button packs up logs and settings, with passwords and keys removed, for a bug report.
- **Everything else** is in [Troubleshooting](/docs/troubleshooting), which starts every answer from the editor.

---

## Installer flags

The install command is on the [Install](/docs/getting-started#install-script) page. It accepts:

| Flag | Description |
|---|---|
| `--desktop` | Use Desktop mode instead of Lite |
| `--version v1.2.0` | Install a specific release instead of the latest |
| `--port 8080` | Run the server on a custom port instead of the default 3000 |
| `--non-interactive` | Skip all prompts and use defaults (portrait 90° rotation, auto-detected resolution) |
| `--display-only` | Install as a display-only Pi that points at an existing Home Screens hub. Skips Node.js, the app, and the server service. Installs Chromium, labwc and the kiosk launcher, the boot splash, autologin, and the hardware reporter. Requires `--backend`. |
| `--backend <url>` | Hub URL the display-only Pi should point at (for example `--backend http://192.168.1.100:3000`). Required with `--display-only`. |
| `--display-id <id>` | Optional display ID this Pi registers under. Lowercase letters, digits, and hyphens, max 64 characters. If omitted, the installer generates one from the hostname plus a 4-character random suffix (for example `home-screens-hysd`) so two Pis with the same hostname do not collide. |

During an interactive install the script asks how the screen is mounted:

```
How is your display oriented?
1) Portrait (default, rotated 90° clockwise)
2) Portrait (rotated 90° counter-clockwise)
3) Landscape (no rotation)
4) Inverted (rotated 180°)
```

It also asks for the resolution, or reads the native resolution from the connected screen if you leave it blank. Both can be changed later in Settings > Screen.

## Display-only Pis

To set up a Pi as a display-only Pi pointing at an existing hub:

```bash
# Auto-generated display ID
~/home-screens/scripts/install.sh --display-only --backend http://192.168.1.100:3000

# Explicit display ID
~/home-screens/scripts/install.sh --display-only --backend http://hub:3000 --display-id kitchen
```

After install and reboot, the Pi contacts the hub and appears in the editor under **Settings > Displays** as waiting to be added. See the [Multi-display guide](/docs/multi-display).

Once added, a display-only Pi keeps its own software up to date on its own: it checks the hub nightly and at every start, downloads updates only when the hub has a newer version, verifies the download before applying it, and keeps the previous version for rollback. A display that is awake and in use is never restarted to finish an update. Pis installed before this existed show a one-line setup command in the editor next to their display.

## What the installer does

1. **Node.js**: installs the runtime needed to run the server (full install only)
2. **Latest release**: downloads the pre-built app from GitHub (full install only)
3. **Browser**: installs Chromium and the labwc Wayland compositor for fullscreen kiosk display with proper cursor hiding on touchscreens
4. **Background service**: sets up `home-screens.service` to start automatically on boot (full install only)
5. **Autologin**: configures the Pi to log in and launch the display without interaction
6. **Plymouth boot splash**: installs the Home Screens-branded theme so the Pi boots through a clean splash instead of the rainbow, black screen, kiosk sequence. Display-only installs get the splash too
7. **WiFi hardening** (full install only): applies reliability fixes for headless displays (infinite reconnect retries, connectivity watchdog, disabled suspend; see [Networking > WiFi reliability](/docs/networking#wi-fi-reliability))
8. **systemd-journal group** (full install only): adds the service user to `systemd-journal` so `journalctl -u home-screens` works without sudo and the diagnostics bundle can capture logs
9. **Hardware reporter** (display-only Pis only): installs `/usr/local/bin/home-screens-reporter.sh`, the `home-screens-reporter.service` unit, and a 30-second timer that POSTs CPU load, temperature, throttling state, memory and disk usage to the hub's `/api/display/hw-stats` endpoint. No token; the hub authorizes by checking the display ID against `config.displays`
10. **SD card wear reduction** (full install only): keeps the system journal in memory instead of writing it to the card, removes the swap file and tunes the kernel instead, and disables background services a kiosk does not need

Steps marked "full install only" are skipped on display-only Pis, which finish their setup earlier and never reach the system-tuning stage.

## Managing services

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

The systemd unit uses `TimeoutStopSec=15` and `KillMode=mixed` so that `systemctl stop home-screens` completes in at most 15 seconds. Without these settings, the npm wrapper can take up to 90 seconds to stop because it does not forward `SIGTERM` to its Node.js child. The `mixed` kill mode sends a polite `SIGTERM` to the main process, then escalates to `SIGKILL` on the entire cgroup if it has not exited within the timeout, so no orphan processes survive a restart.

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

## Upgrade and rollback via API

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

## Changing orientation from the command line

Change orientation in the editor under **Settings > Screen** where you can. It applies straight away with no reboot, and it is saved.

If you need to do it from the command line:

```bash
XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 \
  bash /opt/home-screens/current/scripts/rotate-display.sh 90
```

The accepted values are `0`, `90`, `180`, and `270`. The two environment variables are required; without them the script cannot talk to the display and exits without changing anything, which over SSH it will do every time.

Treat this as a stopgap. It does not update your saved settings, so the next upgrade puts the orientation back to whatever **Settings > Screen** says.

## Chromium won't start

1. Make sure you're logged in (autologin should handle this)
2. Check that labwc is running: `pgrep labwc`
3. Check `.bash_profile` has the kiosk block: `grep 'Home Screens Kiosk' ~/.bash_profile`
4. Try launching the browser by hand, from a keyboard attached to the Pi rather than over SSH: `bash /opt/home-screens/current/scripts/kiosk-launcher.sh`
5. On Lite installs, verify D-Bus is available: `echo $DBUS_SESSION_BUS_ADDRESS`

## Screen keeps going black

First check whether the screen is genuinely powered off or just showing black. Home Screens dims and sleeps by drawing a black layer over the page; the monitor stays on and lit the whole time. So if the panel is still backlit, this is the sleep schedule, and you can change it in **Settings > Screen > Sleep & dimming**. If the panel has actually powered down, that is your monitor or the Wayland compositor, not Home Screens.

The compositor (labwc) should prevent screen blanking. To inspect the display state, run:

```bash
# Check current display power state
XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 wlr-randr
```

Those two environment variables are required. Over SSH they are not set for you, and a bare `wlr-randr` fails with no useful message.
