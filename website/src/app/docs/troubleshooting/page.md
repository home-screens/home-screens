---
title: Troubleshooting
nextjs:
  metadata:
    title: Troubleshooting
    description: Common issues and solutions for Home Screens.
---

Solutions for common issues you may encounter running Home Screens.

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
3. **Check the sleep schedule** — If you have a sleep schedule configured, the display may be in sleep mode. Visit the editor and check Settings > Display > Sleep Schedule.
4. **Open the browser console** — If you can access the display directly, press `F12` to open dev tools and check the Console tab for JavaScript errors.
5. **Verify the URL** — Make sure the browser is pointing to `http://localhost:3000/display` (or your configured host and port).

---

## Modules not updating

If modules appear stale or show old data:

1. **Check API keys** — Many modules require API keys (weather, stocks, news). Open the editor and go to Settings > Integrations to verify your keys are set.
2. **Check refresh intervals** — Each module has a configurable refresh interval. Very long intervals mean data updates infrequently. Check the module settings in the editor.
3. **Check network connectivity** — API-backed modules need internet access. Test from the Pi:
   ```bash
   curl -s https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0 | head -c 200
   ```
4. **Check the API directly** — Visit the relevant API endpoint in your browser (e.g., `http://localhost:3000/api/weather`) to see if it returns data or an error.

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

## Google Calendar not syncing

If calendar events are missing or stale:

1. **Re-authenticate** — The OAuth device flow token may have expired. Go to the editor, open Settings > Integrations > Google Calendar, and re-run the device flow.
2. **Check token expiry** — Tokens expire after a period of inactivity. If the refresh token is revoked, you must re-authenticate.
3. **Verify the API is enabled** — In the [Google Cloud Console](https://console.cloud.google.com/), ensure the Google Calendar API is enabled for your project.
4. **Check selected calendars** — In the editor, make sure you have selected which calendars to display. The module only shows events from calendars you have explicitly chosen.
5. **Test the endpoint** — Visit `http://localhost:3000/api/calendar` to check for error messages.

---

## Weather not loading

If the weather module shows an error or no data:

1. **Verify your API key** — Open the editor, go to Settings > Integrations, and confirm your weather API key is entered correctly.
2. **Check provider availability** — Some providers have rate limits or outages. Try switching to a different provider temporarily:
   - **Open-Meteo** requires no API key and is a good fallback for testing.
   - **NOAA** is free but US-only.
3. **Check your location** — Ensure latitude and longitude are set correctly in the module or global settings.
4. **Test the endpoint** — Visit `http://localhost:3000/api/weather` to see the raw response and any error messages.
5. **Try a different provider** — Home Screens supports 5 weather providers. If one is not working, switch to another in Settings > Integrations.

---

## Screen rotation issues

If the display orientation is wrong on your Raspberry Pi:

1. **Use the rotate-display script** — The install script includes a rotation helper:
   ```bash
   sudo ~/home-screens/scripts/rotate-display.sh
   ```
2. **Check display settings** — On Raspberry Pi OS with a desktop, go to Preferences > Screen Configuration and set the rotation.
3. **Edit config.txt manually** — For headless setups, edit the boot config:
   ```bash
   sudo nano /boot/firmware/config.txt
   ```
   Add or modify the `display_rotate` setting:
   ```
   display_hdmi_rotate=1
   ```
   Values: `0` = normal, `1` = 90 degrees, `2` = 180 degrees, `3` = 270 degrees.
4. **Reboot** — Rotation changes require a reboot:
   ```bash
   sudo reboot
   ```

---

## Upgrade failed

If an upgrade through the UI or CLI did not complete successfully:

1. **Rollback to the previous version** — Home Screens keeps backups of previous versions. Use the system API or the editor UI (Settings > System > Rollback) to revert.
2. **Check disk space** — Upgrades need free disk space for downloading and extracting. Check available space:
   ```bash
   df -h /
   ```
3. **Manual upgrade steps** — If the automated upgrade is broken, you can upgrade manually:
   ```bash
   cd ~/home-screens
   git fetch --all
   git checkout <version-tag>
   npm install
   npm run build
   sudo systemctl restart home-screens
   ```
4. **Check the upgrade logs** — Look for errors in the system logs:
   ```bash
   journalctl -u home-screens -n 100 --no-pager
   ```
5. **Restore from backup** — If the config was corrupted, restore from the automatic backup:
   ```bash
   ls ~/home-screens/data/backups/
   cp ~/home-screens/data/backups/config-<timestamp>.json ~/home-screens/data/config.json
   ```
