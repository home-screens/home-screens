---
title: Profiles & Scheduling
nextjs:
  metadata:
    title: Profiles & Scheduling
    description: Automate your smart display with time-based profiles, screen rotation, and per-module day/time schedules. Free alternative to Dakboard Screen Loops.
    alternates:
      canonical: /docs/profiles
---

Profiles let you show different screens at different times of day, on different days of the week, or on demand. Combined with module-level scheduling and sleep settings, you can fully automate what your display shows and when.

{% callout type="note" %}
**Running multi-display?** Each display has its own profiles, built from that display's own screens. See [Multi-display > Profiles per display](/docs/multi-display#profiles-per-display).
{% /callout %}

---

## What are profiles?

A **profile** is a named group of screens. Instead of always rotating through every screen you have configured, a profile limits the display to a specific subset. You can have as many profiles as you want.

When no profile is active, the display shows all screens. When a profile is active, either manually selected or triggered by a schedule, only the screens assigned to that profile are shown.

The stored shape is in the [configuration reference](/docs/configuration#profile).

---

## Creating and managing profiles

Profiles are managed in the editor under **Settings > Automation > Profiles**.

### Adding a profile

1. Open **Settings > Automation > Profiles**
2. If you have more than one display, pick the one you're working on from **Editing automation for** at the top of the page. Profiles belong to a single display, and a new profile picks up that display's screens, so choosing the wrong one here builds the profile against the wrong screens. Switching displays here also switches which display the editor canvas is showing.
3. Click **Add a profile**; a new profile is created with all screens selected
4. Give it a descriptive name (e.g. "Morning", "Weekend", "Office Hours")

### Selecting and ordering screens

Expand a profile card to see the sortable screen list. Toggle screens on or off to control which ones are included, and drag them to set the order they rotate in on the display. A profile with no screens selected falls back to showing all screens.

The screen order within a profile determines the rotation sequence, the display cycles through screens in the order you arrange them, not the order they appear in the editor tabs.

### Renaming and deleting

- Click the pencil icon to rename a profile
- Click the trash icon to delete it (you will be asked to confirm)

### Reordering

Drag profiles by the grip handle to reorder them. **Order matters**: when multiple scheduled profiles overlap, the first matching one wins. See [scheduling priority](#how-scheduling-priority-works) below.

### Setting the active profile

Use the **Showing right now** dropdown at the top of the Profiles tab to pick which profile is showing. Choose **Every screen** to show them all. A scheduled profile takes over when its time comes, whatever is picked here.

---

## Profile scheduling

Each profile can have an optional schedule that activates it automatically based on day of week and time of day.

### Enabling a schedule

1. Expand a profile card in **Settings > Automation > Profiles**
2. Toggle **Auto-activate on schedule**
3. Select which **days** the profile should be active (click day buttons to toggle)
4. Set the **From** and **Until** times to define the active window

When the schedule is enabled, the profile badge shows a green "Scheduled" label.

### Day-of-week selection

Days are numbered 0 (Sunday) through 6 (Saturday). Click each day button to include or exclude it. At least one day must remain selected.

Common patterns:
- **Weekdays**: Mon, Tue, Wed, Thu, Fri
- **Weekends**: Sat, Sun
- **Every day**: all seven days selected

### Time windows

Time windows use 24-hour format (`HH:mm`). You can specify:

- **Both From and Until**: active during that window (e.g. 06:00 to 09:00)
- **From only**: active from that time until midnight
- **Until only**: active from midnight until that time
- **Neither**: active all day on the selected days

Overnight windows are supported. If the start time is later than the end time (e.g. 22:00 to 06:00), the window wraps past midnight. The post-midnight portion uses the previous day's day-of-week for matching, so a Friday 22:00 to 06:00 schedule stays active through Saturday 06:00.

### Invert option

The **Invert** toggle reverses the schedule logic: instead of activating the profile during the window, the profile is active at all times *except* during the window. This is useful for "everything but" patterns: for example, activating a profile at all times except during business hours.

---

## Screen-level scheduling

Individual screens can be filtered out of the rotation pool based on their own schedule, independent of profiles and modules. This lets you build screens that only exist at certain times, such as a weekend chore chart, a school-morning dashboard or a late-night clock, without threading them through a profile.

### Setting a screen schedule

1. Select a screen tab in the editor (the horizontal tab strip at the top of the canvas)
2. Open the **Screen settings** panel (the right-hand property panel when no module is selected)
3. Scroll down to **Only show at certain times**, below **Rotation**, and turn it on
4. Under **How it repeats**, pick **Same hours on each day I pick** and click the days you want in **Your week**, or pick **One stretch across several days** (for example Monday 08:00 until Thursday 20:00) and click the day it starts on. Then set **From** and **Until**; for a stretch, also pick the day it ends in the box under **Until**. Leave both times empty to show all day.
5. Optionally turn on **Hide during these hours instead** to hide the screen during those times rather than show it

When a schedule is defined, the screen tab shows a small clock icon badge (parallel to the rotation-duration badge).

Screen, module and profile schedules all use the same [schedule shape](/docs/configuration#module-schedule).

## Screen-level conditions

A screen can also wait for live values, the same way a module's [Conditions](/docs/editor#conditions) do. The values come from Home Screens itself (the next calendar event, how many events are on today, the weather right now) and from plugins that share state, such as a Home Assistant sensor. A travel-times screen that only matters when somebody is about to leave is the typical use: keep it out of the rotation until an event is less than an hour away.

### Setting screen conditions

1. Select the screen tab and open **Screen settings** (the right-hand panel when no module is selected)
2. Below the schedule, turn on **Show only when conditions match**
3. Click **Add condition** and pick what to check. For "an event is coming up", choose **Number is in range**, pick **Minutes until the next event** and set **Below** to 60. For "something is on the calendar right now", choose **Value matches**, pick **An event is happening now** and set it to `true`
4. Under **Before data arrives**, decide what happens while a value has not been reported yet: **Leave the screen out** (the default) or **Keep the screen in**

A screen with conditions shows a small eye badge on its tab, next to the clock badge a schedule adds. While you edit, the panel says whether the screen is in the rotation on the display right now and why, with the display's live value next to each condition.

Schedule and conditions work together: a screen with both only shows inside its hours **and** while its conditions match. So "weekday mornings, and only when an event is coming up" is a schedule for Monday to Friday 06:30 to 09:15 plus the next-event condition.

### How screen visibility is evaluated

Screen schedules are re-evaluated every minute, piggybacking on the same timezone-aware clock used by profile and module schedules, and screen conditions the moment a value they read changes. Evaluation happens **before profile resolution**, so a screen that is scheduled off or whose conditions are not met never enters the candidate set, even if the active profile explicitly references it. Manual navigation respects this too: such screens are left out entirely, so the screen dots, swipes, the remote and a Display Control module's next and previous buttons all skip them.

When a screen joins or leaves, the display keeps showing the screen it was on and carries on from there; it only moves when the screen it was showing is the one that left. If every screen is scheduled or conditioned out, every enabled screen shows rather than a blank display. A [display rule](#display-rules) can still bring up a screen its conditions keep out of the rotation, which is how an alert screen that never rotates on its own is built.

Every schedule on this page, whether for a screen, a profile or a module, reads the clock in the time zone set under **Settings > Location & language**. Until you pick one, every display follows the hub's own clock.

{% callout type="note" %}
**Empty-after-filter safety.** If every screen has a schedule and none of them currently match, the display falls back to showing all enabled screens rather than going blank. A scheduled display should never become an empty kiosk.
{% /callout %}

---

## Module-level scheduling

Individual modules can be shown or hidden based on their own schedule, independent of profiles. This lets you keep the same screen layout but change which modules are visible throughout the day.

### Setting a module schedule

1. Select a module on the canvas
2. In the Property Panel, scroll to the **Schedule** section
3. Turn on **Only show at certain times**
4. Under **How it repeats**, pick **Same hours on each day I pick** and click the days you want in **Your week**, or pick **One stretch across several days** (for example Monday 08:00 until Thursday 20:00) and click the day it starts on. Then set **From** and **Until**; for a stretch, also pick the day it ends in the box under **Until**. Leave both times empty to show all day.
5. Optionally turn on **Hide during these hours instead** to hide the module during those times rather than show it

Module schedules use the same [schedule shape](/docs/configuration#module-schedule) as screens and profiles.

### How a module schedule is evaluated

The display re-evaluates module schedules every minute. A module passes its schedule when:

1. Today is one of its days (no days picked means every day)
2. The time is inside its window (no times means all day)
3. With **Hide during these hours instead** on, the result is flipped

A stretch from **One stretch across several days** is a single window: the module shows from its start day and time straight through to its end day and time, days in between included.

Overnight time windows and day-of-week rollover for the post-midnight portion work the same way as profile schedules. Like every other schedule, they read the clock in the time zone set under **Settings > Location & language**, or the hub's own clock until one is picked.

### The three switches that hide a module

The schedule is only one of three switches, and a module has to clear **all three** to appear on the display:

| Switch | Where it lives | What it does |
|---|---|---|
| **Show on display** | The **Visibility** section of the Property Panel | Turn it off to hide a module everywhere without deleting it. It stays visible (dimmed) in the editor so you can turn it back on. |
| **Schedule** | The **Schedule** section of the Property Panel | Hides the module outside the days and times you set, as described above. |
| **Show only when conditions match** | The **Conditions** section of the Property Panel | Hides the module unless live values match the conditions you set. |

Turning any one of them off hides the module, so if a module has unexpectedly disappeared, check all three before assuming the schedule is at fault.

Visibility conditions react to live values. Some are built in and need nothing installed: the weather (raining now, chance of rain later today, temperature, and an active weather warning on the [services that send them](/docs/weather#show-the-rain-map-only-when-rain-is-likely)) and the calendar (something on right now, how many events today, what is next). Others come from add-ons, such as a Home Assistant integration. A single condition can check that a value matches (or doesn't match) something you type, check that a number falls in a range, or fence the module by time of day and day of week; **All of** / **Any of** / **None of** groups combine several conditions into one rule. There's also a setting for what to do before the value ever arrives, so a module can either stay hidden or show by default while it waits. See [Module visibility conditions](/docs/configuration#module-visibility) for the stored shape and the [Editor guide](/docs/editor) for the controls themselves.

One more setting sits alongside these: **Run hidden in the background**. A module marked that way never appears on screen at all. It runs quietly so its data keeps updating while other screens are showing, which is what lets one add-on feed conditions on modules elsewhere. If you want the widget visible too, add a second copy without that setting.

---

## How scheduling priority works

The system evaluates schedules in this order:

1. **Scheduled profiles**: checked first. The display scans profiles from top to bottom. The first profile whose schedule matches the current time wins. This is why profile order matters.
2. **Manual active profile**: if no scheduled profile matches, the manually selected active profile is used.
3. **All screens**: if no profile matches at all (or no profiles exist), all screens are shown.

Within the resolved set of screens, **module-level schedules** are evaluated independently. A module with a schedule is shown or hidden based on its own rules, regardless of which profile is active.

```
Time check (every minute)
  |
  +--> Filter screens by their own schedules (scheduled-off screens drop out)
  |
  +--> Any scheduled profile match? --yes--> Use that profile's screens
  |         |
  |         no
  |         |
  +--> Manual active profile set? --yes--> Use that profile's screens
  |         |
  |         no
  |         |
  +--> Show all screens
  |
  +--> For each visible screen, filter modules by their individual schedules
```

### Priority examples

| Scenario | What happens |
|---|---|
| Scheduled "Morning" profile matches AND manual active is "Default" | Morning wins (schedules beat manual) |
| Two scheduled profiles both match | First one in the list wins (drag to reorder) |
| Scheduled profile matches but its screens were deleted | Falls through to next match or manual active |
| A screen's schedule hides it right now | That screen is excluded from the rotation pool, even if the active profile includes it |
| A scheduled profile matches, but every screen in it is hidden by its own schedule right now | That profile is skipped as if it hadn't matched, and the next matching profile (or the manual one, or all screens) is used instead |
| No profiles exist | All screens shown, as if profiles are disabled |

---

## Screen rotation

When a profile (or the default view) includes multiple screens, the display automatically rotates through them.

### Rotation interval

Set **Screen rotation interval** in **Settings > Screen > Rotation & appearance**. The slider runs from 5 seconds to 10 minutes (default: 30 seconds). Each screen is shown for this duration before cycling to the next.

Rotation pauses automatically when the display is asleep: no point cycling through screens nobody can see.

### Per-screen override

Any individual screen can override the global rotation interval, useful for dinner-prep displays, guest-mode timers, or a hero screen that needs to linger. In the editor, select a screen tab, open the **Screen settings** panel (the right-hand property panel when no module is selected), and look under **Rotation**. It starts out using the global interval and says what that is (for example "Shows for 30 seconds, the same as your other screens"). Click **Use a different time** to give this screen its own time in **How long this screen shows**, and **Back to the usual** to go back. Set it to **0** to keep the display on this screen until someone taps it or uses the remote (a **Sticky** badge appears next to the field).

### Transition effects

Configure the animation between screens in **Settings > Screen > Rotation & appearance**:

| Effect | Description |
|---|---|
| **Fade** | Cross-dissolve between screens (default) |
| **Slide** | Old screen slides out, new slides in, the direction follows the navigation (forward slides left, backward slides right) |
| **Slide Up** | Old screen slides up, new slides in from bottom (reversed when navigating backward) |
| **Zoom** | Old screen zooms out, new zooms in |
| **3D Flip** | Perspective flip between screens |
| **Blur** | Dissolve through a blur (may be GPU-intensive on low-power devices) |
| **Crossfade (overlap)** | Overlapping fade with both screens visible briefly |
| **None (instant)** | Instant switch, no animation |

Transition duration is configurable from 0.3 to 2.0 seconds. All effects except blur use GPU-composited properties (opacity and transforms), making them smooth even on a Raspberry Pi.

### Manual navigation

The display shows pagination dots at the bottom when there are multiple screens (on by default; turn them off with **Screen dots** in Settings > Screen, which also removes the double-tap pause and the progress line, since both live on the dots). Click a dot to jump directly to that screen. On a touchscreen you can also **flick left or right anywhere on the display** to go to the next or previous screen (on by default; turn it off with **Swipe to change screens** in Settings > Screen). **Double-tap the active (highlighted) dot** to pause screen rotation, double-tap again to resume (turn this off with **Allow pause on touchscreen**). **Auto-resume timeout**, in the same place, starts rotation again after a while. Navigation is also available via the [remote display control API](/docs/api).

---

## Sleep schedule

The sleep system controls when the display dims or turns off entirely. It is configured in **Settings > Screen > Sleep & dimming**. The form groups the controls into four sections: what happens when nobody's using the display, what happens every day at set times, how the dimmed state looks, and what happens while it is turned off. A 24-hour preview bar shows the resulting day at a glance.

### Idle-based sleep

When **Dim or switch off on a schedule** is on and **Dim after a few quiet minutes** is toggled on, the display progresses through three states based on inactivity:

1. **Active**: full brightness, normal operation
2. **Dimmed**: brightness reduced (configurable from 5% to 80%) after a set idle period (1 to 60 minutes)
3. **Asleep**: screen fully black after an additional idle period (0 to 120 minutes after dimming; set to Never to stay dimmed indefinitely)

Turn **Dim after a few quiet minutes** off and the display never reacts to inactivity: it stays at full brightness until a schedule below dims it or turns it off. That's the setup for "full brightness all day, off overnight."

Any mouse, touch, or keyboard input immediately brings a dimmed or sleeping display back to full brightness, or to the brightness someone set from the phone, a script, or a Display Control slider. That brightness stays until someone picks another (picking full clears it): tapping the wall to tick a chore never turns it back up, and dimming never makes it brighter.

### Screensaver

During the dimmed state, a screensaver can be shown:

- **Drifting clock**: a minimal clock that moves around the screen to prevent burn-in
- **Blank (dim only)**: just the dim overlay, no clock
- **Off (skip to sleep)**: no screensaver; the display still dims, it just shows nothing extra

### Scheduled dimming

Toggle **Dim in the evening** to force the display to dim during a fixed window (e.g. 23:00 to 06:00). The display brightens automatically when the window ends, back to full or to the brightness someone set. Supports overnight spans.

### Scheduled sleep

Toggle **Turn off overnight** to force the display fully off during a fixed window (e.g. 00:00 to 06:00). Touching the display (or waking it from the remote) during the window brings it back for the **After a wake-up, stay on for** setting (5 minutes by default), then the schedule takes over again. It wakes automatically when the window ends. Supports overnight spans.

### Powering the screen off

Sleep normally means a black layer over the page; the screen itself stays lit. Turn on **Switch the screen's power off too** (under "While turned off") and a Raspberry Pi display cuts the screen's power whenever it is asleep, from any cause: the overnight schedule, idle time, the remote's Sleep button, or a rule. Dimming never cuts power, because the screensaver is meant to be seen. Waking works exactly as before, with a few extra seconds while the screen resyncs. The setting is off by default because some screens do not come back from a signal loss on their own; see [Screen does not come back after sleep](/docs/troubleshooting#display-is-blank) if yours is one of them.

### Sleep priority

```
Sleep schedule (highest)  -->  forces display off; a wake pauses it for the wake-up hold
Dim schedule              -->  forces dimmed while its window is active
Idle-based dim/sleep      -->  inactivity timer; runs only while its toggle is on
User activity (wake)      -->  any input ends a dim or sleep, back to full or to a brightness someone set
```

---

## Display Rules

Rules make a display react to what's happening, not just to the clock. When a rule's conditions become true, it can jump to a screen or wake the display, for example showing a doorbell camera screen when the bell rings, or waking up when someone unlocks the front door. Add and edit rules in **Settings > Automation > Rules**.

{% callout type="note" %}
Rules can react to the built-in weather and calendar values, to live values from an add-on like a Home Assistant integration (see the [Plugins guide](/docs/plugins)), or purely to the clock with a time-of-day and day-of-week condition.
{% /callout %}

### Conditions

Rules use the same condition types as [module visibility conditions](/docs/configuration#module-visibility): a published value (built in, or from an add-on), a numeric threshold, or a time-of-day/day-of-week window, combined with **All of** / **Any of** / **None of** groups. A rule only fires the moment its conditions become true, not on every check while they stay true, so a reboot or a restarting add-on won't slam the display onto an alert screen for something that's been true for hours. Each condition row shows a live met/not-met indicator, so you can see exactly why a rule has or hasn't fired.

### Actions

A rule can:

- **Show a screen**: either for as long as the conditions stay true (with a 5-second minimum hold, so a flickering sensor can't rapid-fire the display), or for a fixed number of seconds before normal rotation resumes. If the display is on a sleep schedule, a rule that has just started keeps the screen lit for up to 5 minutes; after that the display sleeps as normal with the rule's screen still pinned underneath, so a sensor left on overnight can't keep a bedroom display bright
- **Wake the display**: holds it awake for 5 minutes, then it goes back to its normal sleep schedule
- **Put the display to sleep**

### Priority, cooldown, and copying rules

When more than one rule could fire at once, the one listed first wins. Drag rule cards to reorder them. Set a cooldown (in seconds) so a rule won't fire again immediately after it triggers.

In multi-display setups, each display owns its own rules, since a rule's "show a screen" action points at that display's own screens. Use **Copy to another display** on a rule card to duplicate a rule elsewhere. The copy arrives with its target screen cleared, ready for you to pick a screen on the new display.

---

## Real-world examples

### Morning dashboard vs. evening display

Create two profiles with complementary schedules:

**Morning** profile (screens: Weather, Calendar, Commute)
- Days: Mon to Fri
- From: 06:00, Until: 09:00

**Evening** profile (screens: Photos, News, Sports)
- Days: Mon to Fri
- From: 18:00, Until: 23:00

Outside these windows, the manually set active profile (or all screens) is shown.

### Weekday vs. weekend layouts

**Weekday** profile (screens: Calendar, Weather, Commute, News)
- Days: Mon to Fri
- From/Until: leave blank (all day)

**Weekend** profile (screens: Photos, Sports, Meal Planner)
- Days: Sat, Sun
- From/Until: leave blank (all day)

The weekday profile should be listed first so it takes priority on weekdays. On weekends, it won't match, and the weekend profile activates instead.

### Hide commute module on weekends

Instead of creating separate profiles, use a module-level schedule on the traffic/commute module:

- Turn on **Only show at certain times** on the traffic module
- Days: Mon to Fri
- From: 06:00, Until: 09:30
- Hide during these hours instead: off (show only during this window)

The commute module appears only on weekday mornings. The rest of the screen stays the same all week.

### Weekend-only chore chart screen

You want a full-screen chore chart that only exists on Saturdays and Sundays. On weekdays the display should rotate through the remaining screens as if the chore screen weren't there at all.

- Create a screen and add the **Full-Screen Chore Chart** module
- Select the screen tab and open **Screen settings**
- Turn on **Only show at certain times**
- Days: Sat, Sun
- From/Until: leave blank (active all day on those days)
- Hide during these hours instead: off

Monday through Friday the screen is filtered out of the rotation pool before profile resolution, so it never appears regardless of which profile is active. On weekends it joins the rotation automatically.

### Office hours display vs. after-hours

**Office Hours** profile (screens: Meeting Room Schedule, Company Dashboard)
- Days: Mon to Fri
- From: 08:00, Until: 18:00

**After Hours** profile (screens: Photos, Clock)
- Days: Mon to Fri
- From: 18:00, Until: 08:00

On weekends, neither profile matches (both are weekday-only), so the manually set active profile or all screens are shown. To handle weekends, add a third **Weekend** profile with Sat and Sun selected.

### Night mode with sleep

Combine profiles with sleep settings for a complete daily automation:

1. **Morning** profile: 06:00 to 09:00 weekdays (weather + calendar + commute)
2. **Default** profile: set as manually active (everything else)
3. **Sleep schedule**: 23:00 to 06:00 (display fully off overnight)
4. **Dim schedule**: 21:00 to 23:00 (reduced brightness in the evening before sleep)

The display wakes at 06:00, shows the morning profile until 09:00, falls back to the default profile, dims at 21:00, and sleeps at 23:00.
