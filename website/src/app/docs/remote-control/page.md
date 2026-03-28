---
title: Remote Control
nextjs:
  metadata:
    title: Remote Control
    description: Control your display from a phone with the built-in mobile remote.
---

Control your display from any phone or tablet on the same network. The remote control is a mobile-friendly page that lets you navigate screens, adjust brightness, switch profiles, send alerts, and manage the system -- all from your pocket. {% .lead %}

---

## Opening the remote

Open this URL from any device on the same network as your display:

```
http://<pi-ip>:3000/remote
```

The remote is designed for phone-sized screens but works on any device. Bookmark it or add it to your phone's home screen for quick access.

---

## Display status

The header shows live information about your display:

- **Screen name and position** -- which screen is currently showing (e.g. "Living Room -- Screen 2/4")
- **Display state** -- a colored pill indicating whether the display is Active (green), Dimmed (amber), or Asleep (gray)
- **Connection indicator** -- a green dot when connected, red when the display is unreachable

Status updates every 5 seconds. After sending a command, updates speed up to once per second for about 10 seconds so you see changes faster.

If the display is unreachable (device is off, not on the network, or service isn't running), a red banner appears at the top of the page.

---

## Screen navigation

Two large buttons let you move between screens:

- **Prev / Next** -- advance to the previous or next screen in the rotation
- The status bar updates instantly to show the new screen name (optimistic update -- doesn't wait for the display to process the command)

Screen navigation does not require a password, even when authentication is enabled.

---

## Wake and sleep

A full-width button toggles the display between awake and asleep:

- When the display is **active or dimmed**, the button reads "Sleep Display" and puts the display to sleep (full blackout overlay)
- When the display is **asleep**, the button reads "Wake Display" and wakes it

The button label flips immediately on tap. Like screen navigation, wake/sleep does not require a password.

---

## Brightness

A slider adjusts the display brightness from 0% (fully dark) to 100% (fully bright). Intermediate values apply a dim overlay:

- **0%** puts the display to sleep
- **1-99%** dims the display (dark overlay at the corresponding opacity)
- **100%** sets full brightness

The slider sends changes as you drag, with a small debounce to avoid flooding the network. Brightness does not require a password.

---

## Profile switching

If you have [profiles](/docs/profiles) configured, they appear as horizontal pills below the brightness control. The active profile is highlighted in blue with a checkmark.

- **Tap a profile** to activate it -- the display will switch to showing only that profile's screens
- **Tap the active profile** again to deactivate it -- the display returns to showing all screens

Profile switching **requires authentication** when a password is set. If you're not logged in, you'll see a "Sign in to switch profiles" link that takes you to the login page and returns you to the remote afterward.

---

## Sending alerts

The alert section lets you push notifications to the display:

1. **Choose a type** -- Info (blue, 10s default), Warning (amber, 30s default), or Urgent (red, persistent until dismissed)
2. **Enter a title** (optional) and **message**
3. **Pick a duration** -- 10s, 30s, 1 min, 5 min, or Persistent
4. Tap **Send Alert**

Alerts appear as overlays on the display. You can clear all active alerts by sending a `clear-alerts` command via the [API](/docs/api#get-apidisplaycommand).

---

## System information

Tap the **System** heading to expand a panel showing:

- Hostname, platform, and architecture
- System uptime
- Memory usage (bar chart)
- Disk usage (bar chart)
- Screen and module counts

System information **requires authentication**. The data is fetched on demand when you expand the section, not continuously polled.

---

## Power controls

At the bottom of the page, two buttons let you manage the system:

- **Restart Service** -- restarts the Home Screens service (`systemctl restart home-screens`)
- **Reboot** -- reboots the entire device (`sudo reboot`)

Both actions use a **tap-to-confirm** pattern: the first tap changes the button to "Tap again to confirm" (with a red pulse). You have 3 seconds to confirm; after that, the button reverts. This prevents accidental taps.

Power controls **require authentication**.

---

## Authentication

The remote uses a mixed authentication model. When a password is set (Settings > Security in the editor):

| Control | Password required? |
|---|---|
| Screen navigation (Prev/Next) | No |
| Wake / Sleep | No |
| Brightness | No |
| Profile switching | Yes |
| Send alert | No |
| System info | Yes |
| Power controls | Yes |

Controls that don't require a password work immediately, even if you're not logged in. Controls that require a password show a "Sign in" link that redirects to the login page.

After logging in, you'll be redirected back to the remote. Your session lasts 30 days by default (or 90 days if you check **Remember Me** on the login page), so you won't need to log in again for a while.

You can also append `?token=TOKEN` to bookmarked command URLs (e.g., wake/sleep) for direct authentication without a session cookie. Find your display token in **Settings > Security** in the editor.

---

## Home Assistant integration

The same API endpoints that power the remote can be used with Home Assistant, scripts, or any HTTP client. Simple commands are available as GET requests, making them bookmarkable:

```
http://<pi-ip>:3000/api/display/wake
http://<pi-ip>:3000/api/display/sleep
http://<pi-ip>:3000/api/display/next-screen
http://<pi-ip>:3000/api/display/prev-screen
```

See the [API reference](/docs/api#display-control) for the full list of display control endpoints, including brightness, profile switching, and alerts.
