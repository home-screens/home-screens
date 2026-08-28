---
title: Troubleshooting
nextjs:
  metadata:
    title: Troubleshooting
    description: Common issues and solutions for Home Screens.
    alternates:
      canonical: /docs/troubleshooting
---

Solutions for common issues you may encounter running Home Screens.

---

## First boot

### I flashed the SD card but the screen is still black after 5 minutes

A few things to check:

1. **HDMI cable** — Pi 5 uses **micro-HDMI**, not full-size. A regular HDMI cable won't fit. Try a micro-HDMI-to-HDMI adapter or cable.
2. **Power supply** — Pi 5 needs a 27 W USB-C PSU. Cheaper phone chargers cause under-voltage warnings and may not boot.
3. **SD card** — try re-flashing with a fresh copy of the image. A bad write is common with cheap or old cards.
4. **Wait longer** — on a slow SD card, first boot can take up to 5 minutes. If you see the rainbow splash but then it goes black, it's probably still working.

### WiFi didn't connect on first boot

If you used `wifi.txt` but the Pi never came online:

1. Re-insert the SD card in your computer. Is `wifi.txt` still there (not deleted)? If so, the Pi never read it — check the filename (it needs to be exactly `wifi.txt`, not `wifi.txt.txt`, a common Windows trap).
2. Double-check the `SSID=` and `PASSWORD=` lines for typos. Passwords with special characters should not be quoted.
3. **Try Ethernet as a fallback** — plug in a network cable, boot, then configure WiFi from the editor's **Settings > Network** page.

### I can't find my Pi on the network

If you used the **pre-built image**, the hostname is baked in as `home-screens`:

```bash
ping home-screens.local
```

If you used the **install script**, the Pi keeps whatever hostname Raspberry Pi OS was set up with (usually `raspberrypi`, or whatever you entered in Imager's advanced options):

```bash
ping raspberrypi.local
```

If mDNS doesn't resolve at all (some ISP routers disable it), check your router's admin page for the device and use its IP directly: `http://<pi-ip>:3000/editor`.

---

## Display is blank

If your display shows nothing or a white screen:

1. **Check the service status** — If running on a Raspberry Pi with the install script, check that the service is active:
   ```bash
   sudo systemctl status home-screens
   ```
2. **Check the logs** — Look for startup errors or crashes:
   ```bash
   journalctl -u home-screens -n 50 --no-pager
   ```
3. **Check the sleep schedule** — If you have a sleep schedule configured, the display may be in sleep mode. Visit the editor and check Settings > Screen > Sleep & dimming.
4. **Open the browser console** — If you can access the display directly, press `F12` to open dev tools and check the Console tab for JavaScript errors.
5. **Verify the URL** — Make sure the browser is pointing to `http://localhost:3000/display` (or your configured host and port).

---

## Modules not updating

If modules appear stale or show old data:

1. **Check API keys** — Some modules need a key from the service they pull from (Immich, OneDrive, Todoist, traffic, Google Maps, and a few weather providers). Open the editor and go to Settings > API keys to check them. Weather keys are the exception: they live on their provider's card under Settings > Weather. Stocks and news need no key at all.
2. **Check refresh intervals** — Each module has a configurable refresh interval. Very long intervals mean data updates infrequently. Check the module settings in the editor.
3. **Check network connectivity** — API-backed modules need internet access. Test from the Pi (the quotes matter, or the shell will split the URL at the `&`):
   ```bash
   curl -s "https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0" | head -c 200
   ```
4. **Check the API directly** — Visit the relevant API endpoint in your browser (e.g., `http://localhost:3000/api/weather`) to see if it returns data or an error.

{% callout type="note" %}
If you have set a password, opening these addresses in a browser tab where you're already signed in works fine, but `curl` will come back with "Authentication required". Add your display token from **Settings > Security** to make the shell versions work:

`curl -H "Authorization: Bearer <your-display-token>" http://localhost:3000/api/weather`
{% /callout %}

---

## High memory usage on Raspberry Pi

The Raspberry Pi has limited RAM. If you notice sluggish performance or crashes:

1. **Reduce module count** — Each module consumes memory. Remove modules you do not actively use.
2. **Increase refresh intervals** — Shorter intervals mean more frequent API calls and re-renders. Set refresh intervals to 5-15 minutes where possible.
3. **Check for memory leaks** — Monitor memory usage over time:
   ```bash
   watch -n 5 free -h
   ```
4. **Restart the service** — A periodic restart can help if memory grows over time:
   ```bash
   sudo systemctl restart home-screens
   ```
5. **Use fewer screens** — Multiple screens with many modules multiply memory usage. Consolidate where you can.
6. **Check Chromium processes** — The kiosk browser can consume significant memory. Check with:
   ```bash
   ps aux | grep chromium | grep -v grep
   ```

**Don't try to add swap.** The usual `dphys-swapfile` commands won't work: the installer deliberately removes the swap file and uninstalls `dphys-swapfile`, because constant swapping wears out SD cards, and it tunes the kernel to avoid swapping instead. If you're genuinely short on memory, move to a 4 GB or larger Pi or run fewer API-fetching modules.

---

## Can't access editor remotely

If you cannot reach the editor from another device on your network:

1. **Use the IP address, not localhost** — `localhost` only works on the Pi itself. Find the Pi's IP and use `http://<pi-ip>:3000/editor`:
   ```bash
   hostname -I
   ```
2. **Check the firewall** — Ensure port 3000 (or your configured port) is not blocked:
   ```bash
   sudo ufw status
   ```
3. **Check authentication** — If you have set a password in the editor settings, make sure you are entering it correctly. Clear your browser cookies if the session seems stuck.
4. **Verify the server is listening on all interfaces** — The server should bind to `0.0.0.0`, not just `127.0.0.1`. Check your startup configuration.

---

## Calendar not syncing

The calendar module pulls from three kinds of sources: **iCal/ICS feeds** (simple URL subscriptions, including Google's private iCal address), **Google Calendar** (sign in with your Google account), and **iCloud** (sign in with your Apple ID and an app password). The failure modes differ — skim the relevant section below. See [Calendar setup](/docs/getting-started#calendar-setup) for the full story on all three.

First, **test the merged endpoint** to isolate which source is failing:

```bash
curl http://localhost:3000/api/calendar
```

A 400 with "No calendars configured" means nothing is set up. A 200 with events from one source but not another points to a per-source issue below. (If you get "Authentication required" instead, add your display token as described above.)

### iCal / ICS feed issues

1. **Open the URL in a browser** — if it doesn't download an `.ics` file, the URL is wrong, requires auth, or the provider revoked it. Regenerate the link from your calendar provider's sharing settings.
2. **Google "secret address" regenerated** — if you reset the secret iCal address in Google Calendar settings, the old URL stops working immediately. Paste the new URL in **Settings > Calendar > iCal Feeds**.
3. **Stale events** — Google caches public iCal output for up to ~8 hours, Apple and Outlook similar. New events may not appear immediately. If you need real-time sync, use OAuth instead.
4. **Feed is disabled** — confirm the feed toggle is on in **Settings > Calendar > iCal Feeds**.

### Google Calendar OAuth issues

1. **Re-authenticate** — the OAuth device flow token may have expired. Go to **Settings > Calendar > Sign in with Google** and re-run the device flow.
2. **Check token expiry** — tokens expire after a period of inactivity. If the refresh token is revoked, you must re-authenticate.
3. **Verify the API is enabled** — in the [Google Cloud Console](https://console.cloud.google.com/), ensure the Google Calendar API is enabled for your project.
4. **Check selected calendars** — in the editor, make sure you've selected which calendars to display. The module only shows events from calendars you've explicitly chosen.

### iCloud calendar issues

1. **Make a fresh app password** — iCloud sign-in uses an app password, not your normal Apple password, and revoking or regenerating one silently breaks the connection. Create a new one at [account.apple.com](https://account.apple.com) under **Sign-In and Security > App-Specific Passwords**.
2. **Reconnect the account** — in the editor, go to **Settings > Calendar > iCloud Calendar**, disconnect the account that stopped working, and connect it again with the new app password.
3. **Check which calendars are ticked** — under the connected account, confirm the calendars you want are selected in **Select calendars to display**. Nothing shows until you tick at least one.
4. **One calendar missing, the rest fine?** — each iCloud calendar is fetched separately, so one failing calendar does not stop the others. If a single calendar is blank while the rest sync, untick it and tick it again; if it stays blank, check that it still exists in the Apple Calendar app.

---

## Weather not loading

If the weather module shows an error or no data:

1. **Check your location first** — A brand new install has no location set, so every provider returns nothing useful. Set it at **Settings > Location & language**, and check that any per-module latitude and longitude you've overridden is right too.
2. **Verify your API key** — Open the editor and go to **Settings > Weather**. Each provider has its own card, and the key field is inside the card for the providers that need one (OpenWeatherMap, WeatherAPI, Pirate Weather, and Met Office). The other five need no key.
3. **Check provider availability** — Some providers have rate limits or outages. Try switching to a different provider temporarily:
   - **Open-Meteo** requires no API key and is a good fallback for testing.
   - **NOAA** is free but US-only.
4. **Test the endpoint** — Visit `http://localhost:3000/api/weather` to see the raw response and any error messages.
5. **Try a different provider** — Home Screens supports {% $stats.weatherProviderCount %} weather providers. If one is not working, pick another on **Settings > Weather**.

---

## Screen rotation issues

If the display orientation is wrong on your Raspberry Pi:

1. **Set it in the editor** — go to **Settings > Screen > Rotation & appearance** and pick the orientation you want. Saving turns the picture straight away, with no reboot, and remembers the choice for future boots. This is the setting that sticks, so start here: anything you change by hand elsewhere is eventually replaced by this one.
2. **Or use the rotate-display script** — if you can't reach the editor, Home Screens installs a rotation helper on the Pi. Run it as the normal user, **not** with `sudo`: it talks to your own screen session and writes files you own, and running it as root breaks both.
   ```bash
   bash /opt/home-screens/current/scripts/rotate-display.sh        # asks you to pick
   bash /opt/home-screens/current/scripts/rotate-display.sh 90     # portrait, clockwise
   ```
   Accepted values are `0` (landscape), `90` and `270` (the two portrait directions), and `180` (upside down). Run it from a terminal on the Pi itself; over SSH it can't reach the running screen session. Set the same orientation in the editor too, so it survives the next upgrade.
3. **Or edit the saved setting by hand** — the rotation the Pi reads at startup lives in `data/kiosk.conf`:
   ```bash
   nano /opt/home-screens/current/data/kiosk.conf
   ```
   Set `DISPLAY_TRANSFORM="90"` (or `180` / `270`), or remove the line entirely for landscape, then `sudo reboot`.
4. **Two rotations, not one** — the editor setting turns both the picture and the canvas your modules are laid out on. If the picture comes out the right way round but everything is squashed or cut off, the canvas shape is wrong for the screen; check the resolution on the same **Settings > Screen** page.

---

## WiFi keeps disconnecting

If your Raspberry Pi display frequently drops its WiFi connection:

1. **Check that the watchdog is running** — The install script sets up a connectivity watchdog that auto-recovers. Verify it's active:
   ```bash
   systemctl list-timers | grep wifi
   ```
2. **Check NetworkManager connectivity** — See if NM thinks it's online:
   ```bash
   nmcli general status
   nmcli device wifi list
   ```
3. **Check for driver issues** — The Broadcom WiFi driver (`brcmfmac`) on Raspberry Pi can be flaky. Check for firmware errors:
   ```bash
   dmesg | grep brcmfmac | tail -20
   ```
4. **Move closer to the access point** — Mesh networks and weak signal cause the most connectivity drops on Pi displays.
5. **Use Ethernet** — For maximum reliability, a wired connection avoids WiFi issues entirely.

The install script applies WiFi hardening (infinite reconnect retries, disabled MAC randomization, disabled IPv6 on WiFi, masked suspend). See [Networking > WiFi reliability](/docs/networking#wi-fi-reliability) for details.

---

## Display shows a WiFi icon at the bottom

A WiFi-off icon at the lower right of the display indicates the device has lost network connectivity. The icon appears after 3 seconds of being offline and clears immediately when connectivity is restored.

1. **Check your WiFi** — verify the router/access point is up and the Pi is in range
2. **Check the service** — the connectivity watchdog should auto-recover, but you can check manually:
   ```bash
   nmcli general status
   ```
3. **Restart networking** — if the connection is stuck:
   ```bash
   sudo nmcli device disconnect wlan0 && sudo nmcli device connect wlan0
   ```

---

## Cursor visible on touchscreen

If the mouse cursor is visible on a touchscreen display, the labwc compositor may have crashed:

1. **Check labwc** — verify it's running:
   ```bash
   pgrep labwc
   ```
2. **Restart the kiosk browser** — restarting the `home-screens` service will not help here; that service is only the web server, and the browser and the screen manager run separately. Closing the browser makes the screen manager exit too, and the Pi automatically brings the whole lot back a second later:
   ```bash
   pkill -TERM chromium
   ```
3. **Reboot** — if the cursor is still there, a reboot always clears it:
   ```bash
   sudo reboot
   ```

Home Screens uses the labwc Wayland compositor (which replaced cage) for proper cursor hiding on touchscreen displays.

---

## Display kiosk stuck on a deleted URL

If you delete a display from the editor's **Settings > Per display > All displays** page while a Pi spoke is still pointed at the deleted display URL, the spoke shows a **DisplayNotFound** waiting-room screen.

When the hub already has other registered displays, the waiting room displays a visible 60-second countdown and a **Go to default display now** button:

1. Wait for the countdown to expire — the spoke auto-navigates to `/display`, which loads the current default display
2. Or click the button to go immediately
3. No power cycle is needed

If the spoke is brand new and has never been adopted, the countdown is suppressed and it waits indefinitely for the editor to adopt it. See the [Multi-display guide](/docs/multi-display) for the adoption flow.

---

## Finding which Pi is reporting under a display ID

In a multi-display setup, the editor's **Settings > Per display > All displays** page shows each display's source IP and viewport so you can trace which physical Pi is reporting. The row label looks like:

```
Last seen 1s ago · from 192.168.86.187
```

If two browser tabs at the same URL on the same Pi report under one display ID, they collapse into a single row with a `×2 tabs` badge. If two distinct IPs report under one display ID, they show as separate rows — a useful signal that you accidentally pointed two Pis at the same display URL. To split them, reinstall one of the Pis with a different `--display-id`.

---

## Display row is missing CPU/temperature

Adopted displays report hardware stats (CPU, temperature, memory, uptime) to the hub every 30 seconds via a systemd timer (`home-screens-reporter.timer`) running `scripts/reporter.sh`. If a display card on **Settings > Per display > All displays** is missing these stats:

1. **Check the timer on the spoke** — SSH to the Pi and run:
   ```bash
   systemctl status home-screens-reporter.timer
   systemctl list-timers | grep reporter
   ```
2. **Check the last run** — errors show up in the service logs:
   ```bash
   journalctl -u home-screens-reporter.service -n 20 --no-pager
   ```
3. **Confirm the spoke is adopted** — `/api/display/hw-stats` only accepts reports from display IDs present in `config.displays` on the hub. Unadopted displays silently drop their reports. Adopt the display under **Settings > Per display > All displays > Unadopted Displays**.
4. **Run the reporter manually** to see the error inline:
   ```bash
   /usr/local/bin/home-screens-reporter.sh
   ```
   To see what it would send without actually sending it:
   ```bash
   REPORTER_DRY_RUN=1 /usr/local/bin/home-screens-reporter.sh
   ```
   That is the installed copy, and it is the same path on a display-only Pi. A display-only install skips the app itself, so there is no server or Node.js on that Pi, but it still creates `/opt/home-screens/current/data/` and writes its `kiosk.conf` there.

---

## Getting a diagnostics bundle

For hard-to-reproduce issues, Home Screens can export a redacted diagnostics bundle you can attach to a GitHub issue:

1. In the editor, go to **Settings > Status** and click **Diagnostics bundle** in the Server card.
2. Or from a shell: `curl -O http://home-screens.local:3000/api/system/diagnostics`. If you have set a password, this one needs the session cookie from a signed-in browser, so the button in the editor is the easier route.

The bundle includes recent service logs, system info, module counts, and error traces. API keys, OAuth tokens, session secrets, your config URL, and other secrets are redacted before the archive is built — it's safe to attach to a public issue. If you're unsure, unzip it and check before uploading.

---

## Config seems broken after manual edits

If you hand-edited `data/config.json` and the display won't load or shows errors, run the built-in validator:

```bash
cd /opt/home-screens/current
npm run config:check
```

It reports schema violations with a dot-path to each problem (for example `screens[screen-1].modules[mod-3]`). If the config is beyond repair, see [How do I reset to factory defaults?](/docs/faq#how-do-i-reset-to-factory-defaults) to start fresh while keeping a backup of the broken file.

---

## Upgrade failed

If an upgrade through the UI or CLI did not complete successfully:

1. **Roll back to a previous version** — Use the editor UI (Settings > System & updates > Rollback) and pick the version you want. Rolling back downloads that release from GitHub and installs it, so it needs an internet connection and takes about as long as an upgrade.
2. **Check disk space** — Upgrades need free disk space for downloading and extracting. Check available space:
   ```bash
   df -h /
   ```
3. **Run the upgrade steps by hand** — If the automated upgrade is stuck, you can drive the same steps yourself on the Pi. Home Screens installs to `/opt/home-screens/current` and runs pre-built releases, so there is nothing to compile:
   ```bash
   cd /opt/home-screens/current
   bash scripts/upgrade.sh preflight
   bash scripts/upgrade.sh download v1.8.0
   bash scripts/upgrade.sh deploy
   bash scripts/upgrade.sh restart
   ```
   Replace `v1.8.0` with the version you want. The comments at the top of `scripts/upgrade.sh` list every step it can run. As a last resort, re-running the installer with `--version <tag>` reinstalls that release from scratch.
4. **Check the upgrade logs** — Look for errors in the system logs:
   ```bash
   journalctl -u home-screens -n 100 --no-pager
   ```
5. **Restore from backup** — Your configuration is saved before every upgrade. List the saved copies and put one back:
   ```bash
   ls /opt/home-screens/current/data/backups/
   cd /opt/home-screens/current
   bash scripts/upgrade.sh restore-backup config-v1.8.0-20260725-101500.json
   ```
   The file names include the version they came from, and `restore-backup` checks the file is valid before it replaces anything. You can do the same thing without a shell from **Settings > Backups & data > Config Backups**.
