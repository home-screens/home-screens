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
- **Update or roll back:** Settings > System & updates. **Check for Updates** installs the latest release; the list under **If an update caused trouble** goes back to any earlier one. Sometimes a big update needs a smaller one installed first. Home Screens offers that one, and then offers the big one when it is done. An earlier version that can no longer read your saved settings is listed but not offered. An update that changed the Pi's own setup says **Restart to finish the update** and offers **Restart now** until the device restarts.
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
| `--display-only` | Install as a display-only Pi that points at an existing Home Screens hub. Skips Node.js, the app, and the server service. Installs Chromium, labwc and the programs the kiosk uses with them (kanshi, wlopm, wlr-randr, wtype), the kiosk launcher and its hourly self-update, the boot splash, autologin, and the hardware reporter. Requires `--backend`. |
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

Once added, a display-only Pi keeps its own software up to date on its own: it checks the hub every hour and at every start, downloads updates only when the hub has a newer version, verifies the download before applying it, and keeps the previous version for rollback. A display that is awake and in use is never restarted to finish an update: it waits until the screen is asleep or, with no sleep schedule, the middle of the night in your home's time zone. Pis installed before this existed show a one-line setup command in the editor next to their display.

## What the installer does

1. **Node.js**: installs the runtime needed to run the server (full install only)
2. **Latest release**: downloads the pre-built app from GitHub (full install only)
3. **Browser**: installs Chromium, the labwc Wayland compositor and its helpers (kanshi for rotation, wlopm for screen power, wlr-randr, wtype) for fullscreen kiosk display with proper cursor hiding on touchscreens
4. **Background service**: sets up `home-screens.service` to start automatically on boot (full install only)
5. **Autologin**: configures the Pi to log in and launch the display without interaction
6. **Plymouth boot splash**: installs the Home Screens-branded theme so the Pi boots through a clean splash instead of the rainbow, black screen, kiosk sequence. Display-only installs get the splash too
7. **WiFi hardening** (full install only): applies reliability fixes for headless displays (infinite reconnect retries, connectivity watchdog, disabled suspend; see [Networking > WiFi reliability](/docs/networking#wi-fi-reliability))
8. **systemd-journal group** (full install only): adds the service user to `systemd-journal` so `journalctl -u home-screens` works without sudo and the diagnostics bundle can capture logs
9. **Hardware reporter** (display-only Pis only): installs `/usr/local/bin/home-screens-reporter.sh`, the `home-screens-reporter.service` unit, and a 30-second timer that POSTs CPU load, temperature, throttling state, memory and disk usage, the display software version, and the installed versions of Chromium, labwc, kanshi and wlopm to the hub's `/api/display/hw-stats` endpoint. No token; the hub authorizes by checking the display ID against `config.displays`
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

## Automatic updates

With **Install updates automatically** on (Settings > System & updates, under advanced options), the hub runs the same pipeline as the Update button by itself, once a day. The details, for when something did not happen overnight:

- The time is read in the display time zone from **Location & language**, not the Pi's own clock, and each hub adds a fixed delay of up to 20 minutes so devices do not all ask GitHub at once.
- It only takes a newer version from the chosen channel, only one with a ready-made release download, and never one that failed to start on this device. It never asks for the device password; a hub without a working sudo grant records the failure and waits for someone to press Update.
- A slot missed while the hub was off is taken at the next start if that is within six hours of it. Turning the setting on, or moving the time earlier, does not run a slot that has already passed today.
- The last run is kept in `data/auto-update-state.json` and copied into the diagnostics download as `updates.json`, next to the record of any update that was undone. Look for `[auto-update]` lines in `journalctl -u home-screens`.
- Display-only Pis are not affected. They already follow the hub.
- `HS_DISABLE_AUTO_UPDATE=1` in the service environment turns it off regardless of the setting. The E2E harness sets it for every test server.

## The programs the Pi runs

Home Screens draws the wall with programs from Raspberry Pi OS: Chromium, labwc, kanshi, wlopm, wlr-randr and wtype. A Pi used to keep the versions it was flashed with for good, so a fix in one of them only ever reached Pis flashed after it. Now every install of Home Screens, the Update button and the automatic one alike, also brings those programs to the newest version in the Pi OS archive, which is what a fresh image gets.

- On a hub this happens in the same step that checks the Pi's setup (`scripts/upgrade.sh setup-system`), after the update itself is in place. It never holds up or fails an update: an archive that cannot be reached, or a disk with no room to unpack Chromium, means the programs stay as they are until the next time. The Update window shows what it did.
- Those programs are all running in the kiosk session, so a change needs a restart to take effect. After an update you started, **Settings > System & updates** says **Restart to finish the update**. An automatic update restarts the screen itself once the new version is up; it never restarts the whole device.
- A display-only Pi does the same from its hourly check, but only while the hub says it may restart (the display's own sleep window, or the small hours for a display that never sleeps), and it restarts its screen right after. So a replaced Chromium never runs for hours under a page made for the old one.
- **Settings > Status** shows, under **CPU & Thermal**, the installed versions of Chromium, labwc, kanshi and wlopm (**Display programs**) and when they were last checked for newer ones (**Programs checked**). With more than one display it shows the one picked at the top of the page; a display with no reporter of its own, such as the hub's own screen, shows the hub's values, marked **Hub (local)**.
- Should a version in the archive turn out bad, a release can hold a program back (`SYSTEM_PACKAGE_HOLDS` in `scripts/lib/common.sh`, with a copy in `scripts/kiosk-update-privileged.sh` for display-only Pis); the next release that drops it from the list releases the hold. Holds you set yourself with `apt-mark` are left alone.

## Changing orientation from the command line

Change orientation in the editor under **Settings > Screen** where you can. It applies straight away with no reboot, and it is saved.

If you need to do it from the command line, run this as the normal user, not with `sudo`:

```bash
bash /opt/home-screens/current/scripts/rotate-display.sh 90
```

The accepted values are `0`, `90`, `180`, and `270`. The picture turns straight away, and the rotation is kept when the monitor reconnects, the same as a change made in the editor. If the script cannot reach the screen, for example over SSH as a different user than the one the kiosk runs as, it says the rotation is saved and takes effect at the next restart. It refuses to run as root.

Treat this as a stopgap. It does not update your saved settings, so the next upgrade puts the orientation back to whatever **Settings > Screen** says.

## Keeping the rotation when the monitor reconnects

labwc, the program that draws the kiosk, forgets a screen's rotation and resolution when the monitor disconnects. Some monitors disconnect whenever they lose signal: in standby, when **Switch the screen's power off too** cuts the signal while the display sleeps, or when someone presses the monitor's power button or changes its input. Without help, a portrait wall wakes up in landscape.

Home Screens keeps them with kanshi, which puts the saved rotation and resolution back within a moment of the monitor reappearing.

- The values come from `data/kiosk.conf`. When the kiosk starts, `scripts/kiosk-outputs.sh` writes them to `~/.config/kanshi/config` and starts kanshi; saving a new rotation or resolution rewrites the file and reloads it. A kanshi config that Home Screens did not write is moved to `config.before-home-screens` the first time.
- A resolution the monitor does not list is set once, as before, and a reconnect loses it. The rotation is kept either way. A save or a start while the monitor is disconnected keeps the resolution that was already in place.
- Rotation lines from older installs (`wlr-randr ... --transform`) are taken out of `~/.config/labwc/autostart`, because they would run after kanshi and win with an old angle. Other lines there are left alone.
- Pis set up by the installer or the ready-made image have kanshi. The update that brings it installs it, but the running kiosk only starts it after a restart, so **Settings > System & updates** says **Restart to finish the update** until then. A display-only Pi installs it through its normal self-update and restarts its kiosk overnight.
- To check it on the Pi: `pgrep -a kanshi` shows it running, and `sudo journalctl -b -t home-screens-kanshi -t home-screens-outputs` shows what it applied.
- Some monitors drop their HDMI connection every few seconds while they sit without a signal, looking for one. labwc used to switch the screen back on each time it returned, so a display sleeping with **Switch the screen's power off too** lit up for a moment every ten seconds or so. With labwc 0.8.3 or newer (every Home Screens image has it), Home Screens tells labwc to leave new screens to kanshi (`autoEnableOutputs` in `~/.config/labwc/rc.xml`) and pauses kanshi while the screen is switched off, so a monitor that reconnects stays dark until the display wakes. A rotation saved while the display sleeps lands when it wakes. An update that brings this in needs the restart it asks for (**Restart to finish the update**). To check it is on, `grep autoEnableOutputs ~/.config/labwc/rc.xml` prints the line, and after the display has slept once `sudo journalctl -b -t home-screens-power` shows `stopped kanshi so a screen that reconnects stays dark`. Many monitors also have an "auto input" or "auto source" setting in their own menu; turning it off stops the reconnects at the source.

## Chromium won't start

1. Make sure you're logged in (autologin should handle this)
2. Check that labwc is running: `pgrep labwc`
3. Check `.bash_profile` has the kiosk block: `grep 'Home Screens Kiosk' ~/.bash_profile`
4. Try launching the browser by hand, from a keyboard attached to the Pi rather than over SSH: `bash /opt/home-screens/current/scripts/kiosk-launcher.sh`
5. On Lite installs, verify D-Bus is available: `echo $DBUS_SESSION_BUS_ADDRESS`

## Screen keeps going black

First check whether the screen is genuinely powered off or just showing black. Home Screens dims and sleeps by drawing a black layer over the page; unless you turned on **Switch the screen's power off too** in **Settings > Screen > Sleep & dimming**, the monitor stays on and lit the whole time. So if the panel is still backlit, this is the sleep schedule, and you can change it on that page. If the panel has actually powered down and that setting is off, that is your monitor or the Wayland compositor, not Home Screens.

When the setting is on, a small helper in the kiosk session (`scripts/kiosk-power-agent.sh`) asks the hub whether this display should be powered (every 15 seconds while the screen is on, every 3 while it is off, so the screen goes dark up to 15 seconds after the display falls asleep and lights up again almost at once) and drives the panel with `wlopm`, which uses the compositor's output power protocol so the browser window stays put. A monitor that disconnects while its signal is off stays dark until the display wakes and then comes back with its rotation through kanshi; see [Keeping the rotation when the monitor reconnects](#keeping-the-rotation-when-the-monitor-reconnects). If a sleeping screen still flashes now and then, `sudo journalctl -b -t home-screens-power` says each time the helper had to switch it off again. The hub answers "off" only while the display's own browser reports that it is asleep and is still checking in; a display that stops checking in gets its screen back within a minute and a half, and the helper always restores power when it exits. Pis set up by the installer or the ready-made image have `wlopm`; a display-only Pi installed earlier gets the helper through its normal self-update and installs the package on the same pass. On a hub, the update that adds it only takes effect after a restart, which **Settings > System & updates** offers.

The compositor (labwc) should prevent screen blanking. To inspect the display state, run:

```bash
# Check current display power state
XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 wlr-randr
```

Those two environment variables are required. Over SSH they are not set for you, and a bare `wlr-randr` fails with no useful message.
