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
- **Connection indicator** -- a green dot while your phone can reach the server, red when it can't

Status updates every 5 seconds. After sending a command, updates speed up to once per second for about 10 seconds so you see changes faster.

If your phone can't reach the server at all, a red banner appears at the top of the page. If the server is fine but the display itself hasn't checked in yet (it's switched off, or still starting up), the status card reads "Waiting for display…" instead.

### Targeting a display (multi-display only)

As soon as any display is registered on the hub, a segmented **Display Picker** appears at the top of the remote: **All / Kitchen / Bedroom / …**.

Picking **All** sends brightness, wake/sleep, and alerts to every display at once. Screen navigation and profile switching only make sense one display at a time, so those two controls are hidden while **All** is selected; pick a specific display to use them. While **All** is selected the status card shows the first registered display as a stand-in, not a summary of them all.

The picker is hidden only if you have never registered a display, so existing remote bookmarks keep working unchanged. See the [Multi-display guide](/docs/multi-display) for the full hub-and-spoke setup.

---

## Screen navigation

Two large buttons let you move between screens:

- **Prev / Next** -- advance to the previous or next screen in the rotation
- The status bar updates instantly to show the new screen name (optimistic update -- doesn't wait for the display to process the command)

---

## Wake and sleep

A full-width button toggles the display between awake and asleep:

- When the display is **active or dimmed**, the button reads "Sleep Display" and puts the display to sleep (full blackout overlay)
- When the display is **asleep**, the button reads "Wake Display" and wakes it

The button label flips immediately on tap.

---

## Brightness

A slider adjusts the display brightness from 0% (fully dark) to 100% (fully bright). Intermediate values apply a dim overlay:

- **0%** puts the display to sleep
- **1-99%** dims the display (dark overlay at the corresponding opacity)
- **100%** sets full brightness

The slider sends changes as you drag, with a small debounce to avoid flooding the network.

---

## Profile switching

If you have [profiles](/docs/profiles) configured, they appear as horizontal pills below the brightness control. The active profile is highlighted in blue with a checkmark.

- **Tap a profile** to activate it -- the display will switch to showing only that profile's screens
- **Tap the active profile** again to deactivate it -- the display returns to showing all screens

In multi-display installs, the profile pills follow the **Display Picker**: pick a specific display and the pills show that display's own set of profiles and its currently active one (matching the precedence the `/api/display/profile` validator applies). A profile can only be switched on one display at a time, so the pills are hidden while **All** is selected.

Profile switching always needs you to be signed in when a password is set, and a display token is not enough for this one. If your session has expired, tapping a profile takes you to the login page and returns you to the remote afterward.

---

## Sending alerts

The alert section lets you push notifications to the display:

1. **Choose a type** -- Info (blue), Warning (amber), or Urgent (red)
2. **Enter a title** (optional) and **message**
3. **Pick a duration** -- 10s, 30s, 1 min, 5 min, or Persistent
4. Tap **Send Alert**

The duration picker starts at 10s whichever type you pick, so set it deliberately. **Persistent only holds for Urgent alerts.** Choosing Persistent for an Info or Warning alert hands the decision back to the display, which uses the default duration set under **Settings > Screen > Alerts**; out of the box that is 10 seconds for Info and 30 seconds for Warning, and only Urgent stays up until it is dismissed.

Alerts appear as overlays on the display. To clear any that are still showing, use the **Clear All Alerts** button in the editor under **Settings > Screen > Alerts**, or open this address:

```
http://<pi-ip>:3000/api/display/clear-alerts
```

See the [API reference](/docs/api#get-api-display-command) for the rest of the one-word commands.

---

## Settings

Tap the gear icon to open the Settings sheet, which includes:

### System information

- Hostname
- System uptime
- Memory usage (bar chart)
- Disk usage (bar chart)

### Backup & Restore

- **Backup All Data** — downloads a full backup of your configuration as a JSON file
- **Restore Backup** — upload a backup file you saved earlier (tap-to-confirm before applying)

Two banners can appear on the Control tab above the display status. A **backup reminder** shows up when you haven't backed up recently; the interval is configurable in the editor under Settings > Backups & data. An **update available** banner shows up when a newer release has been published, with the version number and a dismiss button; you can turn it off under Settings > System & updates.

Settings needs you to be signed in when a password is set. The data is fetched when you open the sheet, not polled continuously.

### Theme

The Settings sheet also has a **theme toggle** that cycles between **Dark**, **Light**, and **System** (follow the device preference). Your choice is stored on the phone (`localStorage`) and applied before the remote renders, so returning to the bookmark never flashes the wrong theme. The remote's theme is independent from the editor's — changing it on your phone does not change the editor on your laptop.

### Power

At the bottom of the same Settings sheet, a **Power** section has two buttons:

- **Restart Service** -- restarts the Home Screens app (`sudo systemctl restart home-screens`)
- **Reboot Device** -- reboots the entire device (`sudo reboot`)

Both use a **tap-to-confirm** pattern: the first tap changes the button to "Tap again to confirm" (with a red pulse). You have 3 seconds to confirm; after that, the button reverts. This prevents accidental taps.

Like the rest of the Settings sheet, these need you to be signed in when a password is set.

---

## Authentication

Once you set a password (Settings > Security in the editor), **the remote asks you to sign in**. Opening `/remote` without a session sends you straight to the login page, because even the status the header shows is protected.

There are two ways to prove who you are: signing in, which gives your phone a session that lasts a while, or a **display token**, a long string you can put in a bookmarked address. The token is enough for the everyday display controls; a few things need a real sign-in.

| Control | What it needs when a password is set |
|---|---|
| Screen navigation (Prev/Next) | Signed in, or a display token |
| Wake / Sleep | Signed in, or a display token |
| Brightness | Signed in, or a display token |
| Send alert | Signed in, or a display token |
| Profile switching | Signed in |
| Settings (system info, backup/restore) | Signed in |
| Power | Signed in |
| Chores tab | Checking off chores and spending tickets are open to anyone on your network; adding or editing chores, rewards, and balances needs you signed in |
| Meals tab | Signed in to change anything |
| Photos tab | Signed in |

The open part of the Chores tab is what makes the kid-friendly `/chores` page work without a login. Everything else on the remote is behind the password.

After logging in, you'll be brought back to the remote. Your session lasts 30 days by default (or 90 days if you check **Remember Me** on the login page), so you won't need to log in again for a while.

You can also append `?token=TOKEN` to bookmarked command URLs (e.g., wake/sleep) so they work without signing in. Find your display token in **Settings > Security** in the editor. Query tokens only work on `/api/display/` addresses; everywhere else, send it as an `Authorization: Bearer <token>` header instead.

---

## Chores tab

The **Chores** tab provides a mobile interface for tracking household chores. It uses the same shared data as the chore chart module and the fullscreen chore chart module. The tab appears when any chore chart module exists in your configuration.

The Chores tab has three sub-views, selectable via a segmented control: **Today**, **Manage**, and **Rewards**.

{% callout title="The /chores kid view" %}
Alongside the `/remote` Chores tab, where a grown-up sets up chores, members, and rewards, Home Screens has a kid-friendly page at `http://<pi-ip>:3000/chores`.

It shows the same **Today** view plus a trimmed **Rewards** view with just Redeem and History. Manage is hidden, and so are the screens for creating rewards and adjusting ticket balances. The 90-day history strip is there and a kid can look back at any day, but past days are read-only; only the `/remote` Chores tab can check something off for an earlier date.

The `/chores` page **stays open even when you have set a password**: anyone on your home network can open it and check off chores or spend tickets, with no login. That is deliberate, so bookmarking it on a kid's tablet gives them a simple "mark chores done and spend tickets" screen. It is worth knowing about before you hand your network password to a guest.
{% /callout %}

### Today

#### Member selection

Colored pill buttons across the top show each family member (with emoji avatar). Tap a member to see their assigned chores for today. A progress bar shows the member's completion percentage.

#### Today's chores

Chores are grouped by time of day (morning, afternoon, evening, anytime). The current time-of-day section is highlighted with the accent color. Each chore shows its emoji, name, ticket value (including 1-ticket chores, which show a single-ticket pill so kids can see the reward), and a toggle button to mark it complete.

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

In the Manage chore list, a scheduled chore shows a small **(schedule)** tag after the assignee names, next to the **(daily)** and **(weekly)** tags, so you can tell it apart from a fixed one-person chore at a glance. Removing a member from the household automatically cleans the deleted member out of every schedule grid, and a chore left without any schedule entries falls back to the `fixed` rotation with the current day's assignees.

### Rewards

The Rewards sub-view provides a ticket-based reward system:

- **Redeem** — select a member and browse available rewards; each reward has a ticket cost and members can only redeem if they have enough tickets
- **Rewards** — define rewards (name, emoji, ticket cost, description) and restrict them to specific members or make them available to all
- **Balances** — view each member's current ticket balance with options for manual adjustments
- **History** — chronological log of all redemptions

Tickets are earned automatically when chores are marked complete (based on each chore's configured ticket value). Reward definitions and redemption data are stored in `data/rewards.json`.

---

## Meals tab

The **Meals** tab provides a mobile interface for meal planning. It appears when any meal planner module exists in your configuration. The tab has four sub-views: **This Week**, **Plan**, **Library**, and **Grocery**.

A gear button in the tab header opens **meal settings**: which meal slots you use (breakfast, lunch, dinner, snack), which day your week starts on, 12- or 24-hour times, and the default time for each slot. These are shared for the whole household, so changing them here also changes every meal planner module on your displays.

### This Week

Shows the current week's meal plan organized by day and slot. Week navigation arrows and a "Today" button let you browse past and future weeks. Tap a meal card to view details.

### Plan

Manage the weekly meal plan — assign meals from your library to specific day/slot combinations. Three buttons help you fill it fast: **Copy Last Week** duplicates the previous week's plan, **Suggest** fills the week with random picks from your library, and **Clear** empties the whole week after a confirmation.

### Library

Browse, add, edit, and delete saved meals. Each meal has a name, emoji, tags (quick, healthy, vegetarian, etc.), prep/cook time, difficulty, servings, ingredients with categories, recipe URL, and notes.

### Grocery

A shopping list built automatically from the ingredients of every meal planned in the week you're looking at, grouped by aisle. Tap an item to check it off; the ticks sync to every device. **Share** hands the unchecked items to your phone's share sheet, or copies them to the clipboard if sharing isn't available.

You can't type items straight into the list. To add something, add the ingredient to a meal in your **Library** and it appears here.

---

## Photos tab

The **Photos** tab appears when a **Full-Screen Photo Viewer** module is on one of your screens. (A Photo Slideshow module on its own does not bring the tab up.)

It manages the photo folders on the Pi, which is the same library the Photo Slideshow and the rotating background read from. From your phone you can upload photos, create a new folder, browse a folder or **All Photos**, and delete individual pictures.

---

## Home Assistant integration

The same API endpoints that power the remote can be driven from Home Assistant, scripts, or any HTTP client. Simple commands work as GET requests, so they're bookmarkable from a phone:

```
http://<pi-ip>:3000/api/display/wake
```

Ready-to-paste Home Assistant `rest_command` YAML, including how to store the token in `secrets.yaml`, is in [Home Assistant integration](/docs/networking#home-assistant-integration). The full endpoint list is under [Display Control](/docs/api#display-control) in the API reference.
