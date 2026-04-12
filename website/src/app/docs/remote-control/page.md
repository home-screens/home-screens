---
title: Remote Control
nextjs:
  metadata:
    title: Remote Control
    description: Control your display from a phone with the built-in mobile remote.
    alternates:
      canonical: /docs/remote-control
---

Control your display from any phone or tablet on the same network. The remote control is a mobile-friendly page that lets you navigate screens, adjust brightness, switch profiles, send alerts, manage chores, and manage the system -- all from your pocket. {% .lead %}

The remote has up to four tabs depending on your configuration: **Control** (display management), **Chores** (chore tracking and rewards), **Meals** (meal planning), and **Photos** (photo management). A bottom tab bar appears when more than one tab is available.

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

### Targeting a display (multi-display only)

When more than one display is registered on the hub, a segmented **Display Picker** appears at the top of the remote: **All / Kitchen / Bedroom / …**. Brightness, profile switching, alerts, and next/prev/wake/sleep all target the selected display. Picking **All** broadcasts the command to every display.

The picker is hidden in single-display installs, so existing remote bookmarks keep working unchanged. See the [Multi-display guide](/docs/multi-display) for the full hub-and-spoke setup.

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

## Settings

Tap the gear icon to open the Settings sheet, which includes:

### System information

- Hostname, platform, and architecture
- System uptime
- Memory usage (bar chart)
- Disk usage (bar chart)
- Screen and module counts

### Backup & Restore

- **Backup All Data** — downloads a full backup of your configuration as a JSON file
- **Restore Backup** — upload a previously exported backup file (tap-to-confirm before applying)

A **backup reminder banner** appears on the Control tab when you haven't backed up recently. The reminder interval is configurable in the editor under Settings > Data.

Settings **requires authentication**. The data is fetched on demand when you open the sheet, not continuously polled.

### Theme

The Settings sheet also has a **theme toggle** that cycles between **Dark**, **Light**, and **System** (follow the device preference). Your choice is stored on the phone (`localStorage`) and applied before the remote renders, so returning to the bookmark never flashes the wrong theme. The remote's theme is independent from the editor's — changing it on your phone does not change the editor on your laptop.

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
| Settings (system info, backup/restore) | Yes |
| Power controls | Yes |
| Chores tab | No |
| Meals tab | No |
| Photos tab | No |

Controls that don't require a password work immediately, even if you're not logged in. Controls that require a password show a "Sign in" link that redirects to the login page.

After logging in, you'll be redirected back to the remote. Your session lasts 30 days by default (or 90 days if you check **Remember Me** on the login page), so you won't need to log in again for a while.

You can also append `?token=TOKEN` to bookmarked command URLs (e.g., wake/sleep) for direct authentication without a session cookie. Find your display token in **Settings > Security** in the editor.

---

## Chores tab

The **Chores** tab provides a mobile interface for tracking household chores. It uses the same shared data as the chore chart widget and fullscreen chore chart module. The tab appears when any chore chart module exists in your configuration.

The Chores tab has three sub-views, selectable via a segmented control: **Today**, **Manage**, and **Rewards**.

{% callout title="The /chores kid view" %}
In addition to the `/remote` Chores tab (which admins use to manage chores, members, and rewards), Home Screens exposes a kid-friendly `/chores` page at `http://<pi-ip>:3000/chores`. It reuses the Today sub-view but hides Manage, Rewards, members-list edits, and the history strip — the only thing a kid can do is check off today's chores.

The `/chores` page stays **accessible even when the editor password is set**, and it reads/writes chore completions and reward balances over the LAN without needing a display token. This is intentional: bookmarking `/chores` on a kid's tablet gives them a simple "mark chores done" screen without exposing admin controls or requiring them to log in.
{% /callout %}

### Today

#### Member selection

Colored pill buttons across the top show each family member (with emoji avatar). Tap a member to see their assigned chores for today. A progress bar shows the member's completion percentage.

#### Today's chores

Chores are grouped by time of day (morning, afternoon, evening, anytime). The current time-of-day section is highlighted with the accent color. Each chore shows its emoji, name, point value (including 1-point chores, which show a single-point pill so kids can see the reward), and a toggle button to mark it complete.

Tapping a chore toggles its completion with an optimistic update -- the UI updates immediately without waiting for the server response. The data is polled every 15 seconds for live updates across devices.

#### Completion tracking

- A progress bar at the top shows how many of the selected member's chores are done
- When all assigned chores are complete, a "All done!" message appears
- The view automatically refreshes at midnight to show the new day's chores

#### History and backdating

Below today's chores, a **90-day history strip** lets an adult browse any of the last 90 days and check off chores the kid forgot to mark done at the time. Tap a day in the strip to swap the chore list to that day's view; today is always highlighted. The strip is read-only for the kid view — only the remote's Chores tab exposes backdating.

Backdating a chore that carries points credits the member's reward balance just like a same-day completion, and **un-checking a past completion** exact-debits the points that were originally credited. If un-checking would drive the member's balance below zero (for example, because the points have already been spent on a reward), the remote shows a warning like "Alice's balance is now -10 — they'll need to earn 10 points before redeeming again" so you aren't silently erasing already-spent points.

Dates outside the 90-day window are rejected, as are invalid calendar dates (e.g. `2026-02-30`) and any future date.

### Manage

The Manage sub-view lets you add, edit, and organize chore definitions and household members directly from the remote — the same management features available in the editor. Each chore supports four rotation modes when you have more than one assignee: **fixed**, **rotate daily**, **rotate weekly**, and **schedule**. Choosing **schedule** reveals a weekly grid with one row per member and seven day columns — tap a cell to assign that member to that day of the week, with a coverage summary underneath showing which days (if any) still have no one assigned. An "add member" picker lets you attach more members to the grid without leaving the form.

When a scheduled chore resolves to a single assignee on a given day, the board and history views show a small **(schedule)** label next to the name so you can tell a scheduled chore apart from a fixed one-person chore at a glance. Removing a member from the household automatically cleans the deleted member out of every schedule grid, and a chore left without any schedule entries falls back to the `fixed` rotation with the current day's assignees.

### Rewards

The Rewards sub-view provides a points-based reward system:

- **Redeem** — select a member and browse available rewards; each reward has a point cost and members can only redeem if they have enough points
- **Rewards** — define rewards (name, emoji, point cost, description) and restrict them to specific members or make them available to all
- **Balances** — view each member's current point balance with options for manual adjustments
- **History** — chronological log of all redemptions

Points are earned automatically when chores are marked complete (based on each chore's configured point value). Reward definitions and redemption data are stored in `data/rewards.json`.

---

## Meals tab

The **Meals** tab provides a mobile interface for meal planning. It appears when any meal planner module exists in your configuration. The tab has four sub-views: **This Week**, **Plan**, **Library**, and **Grocery**.

### This Week

Shows the current week's meal plan organized by day and slot. Week navigation arrows and a "Today" button let you browse past and future weeks. Tap a meal card to view details.

### Plan

Manage the weekly meal plan — assign meals from your library to specific day/slot combinations. Supports "Copy Last Week" to duplicate a previous week's plan and "Random" to generate a random plan from your library.

### Library

Browse, add, edit, and delete saved meals. Each meal has a name, emoji, tags (quick, healthy, vegetarian, etc.), prep/cook time, difficulty, servings, ingredients with categories, recipe URL, and notes.

### Grocery

A shopping list that can be auto-generated from the current week's meal plan ingredients or managed manually.

---

## Photos tab

The **Photos** tab lets you manage the photos displayed by the photo slideshow and fullscreen photo modules. It appears when a photo slideshow or fullscreen photo module is configured. Upload, browse, and delete photos directly from your phone.

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
