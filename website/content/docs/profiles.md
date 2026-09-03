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
**Running multi-display?** In multi-display mode profiles are scoped per display, each display owns its own profile list and `screenIds` reference that display's own screens, not a shared pool. See [Multi-display > Per-display profiles](/docs/multi-display#profiles-per-display) for the scoping rules.
{% /callout %}

---

## What are profiles?

A **profile** is a named group of screens. Instead of always rotating through every screen you have configured, a profile limits the display to a specific subset. You can have as many profiles as you want.

When no profile is active, the display shows all screens. When a profile is active -- either manually selected or triggered by a schedule -- only the screens assigned to that profile are shown.

Profiles are defined in your configuration alongside screens:

```typescript
{
  version: 5,
  settings: {
    activeProfile: "morning",   // manually selected profile
    // ...
  },
  screens: [ /* all screens */ ],
  profiles: [
    {
      id: "morning",
      name: "Morning",
      screenIds: ["screen-1", "screen-3"],  // only these screens
      schedule: {                            // optional auto-activation
        daysOfWeek: [1, 2, 3, 4, 5],        // Mon-Fri
        startTime: "06:00",
        endTime: "09:00"
      }
    }
  ]
}
```

---

## Creating and managing profiles

Profiles are managed in the editor under **Settings > Automation > Profiles**.

### Adding a profile

1. Open **Settings > Automation > Profiles**
2. If you have more than one display, pick the one you're working on from the **Editing profiles for** dropdown at the top of the page. Profiles belong to a single display, and a new profile picks up that display's screens, so choosing the wrong one here builds the profile against the wrong screens. Switching displays here also switches which display the editor canvas is showing.
3. Click **Add a profile**; a new profile is created with all screens selected
4. Give it a descriptive name (e.g. "Morning", "Weekend", "Office Hours")

### Selecting and ordering screens

Expand a profile card to see the sortable screen list. Toggle screens on or off to control which ones are included, and drag them to set the order they rotate in on the display. A profile with no screens selected falls back to showing all screens.

The screen order within a profile determines the rotation sequence, the display cycles through screens in the order you arrange them, not the order they appear in the editor tabs.

### Renaming and deleting

- Click the pencil icon to rename a profile
- Click the trash icon to delete it (you will be asked to confirm)

### Reordering

Drag profiles by the grip handle to reorder them. **Order matters** -- when multiple scheduled profiles overlap, the first matching one wins. See [scheduling priority](#how-scheduling-priority-works) below.

### Setting the active profile

Use the **Active Profile** dropdown at the top of the Profiles section to manually select which profile is active. Choose "None (show all screens)" to disable manual profile selection.

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
- **Weekdays** -- Mon, Tue, Wed, Thu, Fri
- **Weekends** -- Sat, Sun
- **Every day** -- all seven days selected

### Time windows

Time windows use 24-hour format (`HH:mm`). You can specify:

- **Both From and Until** -- active during that window (e.g. 06:00 to 09:00)
- **From only** -- active from that time until midnight
- **Until only** -- active from midnight until that time
- **Neither** -- active all day on the selected days

Overnight windows are supported. If the start time is later than the end time (e.g. 22:00 to 06:00), the window wraps past midnight. The post-midnight portion uses the previous day's day-of-week for matching, so a Friday 22:00--06:00 schedule stays active through Saturday 06:00.

### Invert option

The **Invert** toggle reverses the schedule logic: instead of activating the profile during the window, the profile is active at all times *except* during the window. This is useful for "everything but" patterns -- for example, activating a profile at all times except during business hours.

---

## Screen-level scheduling

Individual screens can be filtered out of the rotation pool based on their own schedule, independent of profiles and modules. This lets you build screens that only exist at certain times -- a weekend chore chart, a school-morning dashboard, a late-night clock -- without threading them through a profile.

### Setting a screen schedule

1. Select a screen tab in the editor (the horizontal tab strip at the top of the canvas)
2. Open the **Screen settings** panel (the right-hand property panel when no module is selected)
3. Scroll to the **Schedule** section
4. Toggle **Enable Schedule**
5. Select active **days** and set the **From** / **Until** time window
6. Optionally toggle **Invert** to hide the screen during the window instead of showing it

When a schedule is defined, the screen tab shows a small clock icon badge (parallel to the rotation-duration badge).

Screen schedules use the same `ModuleSchedule` format as profile and module schedules:

```typescript
{
  daysOfWeek?: number[]    // 0=Sun, 1=Mon, ... 6=Sat (omit = every day)
  startTime?: string       // "06:00" (omit = from midnight)
  endTime?: string         // "09:00" (omit = until midnight)
  invert?: boolean         // if true, HIDE during this window instead of show
}
```

### How screen visibility is evaluated

Screen schedules are re-evaluated every minute, piggybacking on the same timezone-aware clock used by profile and module schedules. Evaluation happens **before profile resolution**, so a scheduled-off screen never enters the candidate set -- even if the active profile explicitly references it. Manual navigation respects this too: scheduled-off screens are pulled out of the rotation pool entirely, so `nextScreen`/`prevScreen` skip them.

Every schedule on this page -- screen, profile, and module -- reads the clock in the timezone set under **Settings > Location & language**. If you leave that blank, each display falls back to its own device clock, so set a timezone if your displays aren't all in the same place.

{% callout type="note" %}
**Empty-after-filter safety.** If every screen has a schedule and none of them currently match, the display falls back to showing all enabled screens rather than going blank. A scheduled display should never become an empty kiosk.
{% /callout %}

---

## Module-level scheduling

Individual modules can be shown or hidden based on their own schedule, independent of profiles. This lets you keep the same screen layout but change which modules are visible throughout the day.

### Setting a module schedule

1. Select a module on the canvas
2. In the Property Panel, scroll to the **Schedule** section
3. Toggle **Enable Schedule**
4. Select active **days** and set the **From** / **Until** time window
5. Optionally toggle **Invert** to hide the module during the window instead of showing it

Module schedules use the same `ModuleSchedule` format as profile schedules:

```typescript
{
  daysOfWeek?: number[]    // 0=Sun, 1=Mon, ... 6=Sat (omit = every day)
  startTime?: string       // "06:00" (omit = from midnight)
  endTime?: string         // "09:00" (omit = until midnight)
  invert?: boolean         // if true, HIDE during this window instead of show
}
```

### How a module schedule is evaluated

The display re-evaluates module schedules every minute. A module passes its schedule when:

1. Its `daysOfWeek` includes the current day (or is omitted/empty, meaning every day)
2. The current time falls within the `startTime`--`endTime` window (or both are omitted, meaning all day)
3. If `invert` is true, the logic is flipped -- the module is hidden when conditions 1 and 2 match, and shown otherwise

Overnight time windows and day-of-week rollover for the post-midnight portion work the same way as profile schedules. Like every other schedule, they read the clock in the timezone set under **Settings > Location & language**, falling back to each display's own device clock when no timezone is set.

### The three switches that hide a module

The schedule is only one of three switches, and a module has to clear **all three** to appear on the display:

| Switch | Where it lives | What it does |
|---|---|---|
| **Show on display** | The **Visibility** section of the Property Panel | Turn it off to hide a module everywhere without deleting it. It stays visible (dimmed) in the editor so you can turn it back on. |
| **Schedule** | The **Schedule** section of the Property Panel | Hides the module outside the days and times you set, as described above. |
| **Show only when conditions match** | The **Visibility** section of the Property Panel | Hides the module unless live values from your connected services match the conditions you set. |

Turning any one of them off hides the module, so if a module has unexpectedly disappeared, check all three before assuming the schedule is at fault.

Visibility conditions react to live values published by add-ons, such as a Home Assistant integration. A single condition can check that a value matches (or doesn't match) something you type, check that a number falls in a range, or fence the module by time of day and day of week; **All of** / **Any of** / **None of** groups combine several conditions into one rule. There's also a setting for what to do before the value ever arrives, so a module can either stay hidden or show by default while it waits. See [Module visibility conditions](/docs/configuration#module-visibility) for the stored shape and the [Editor guide](/docs/editor) for the controls themselves.

One more setting sits alongside these: **Run hidden in the background**. A module marked that way never appears on screen at all. It runs quietly so its data keeps updating while other screens are showing, which is what lets one add-on feed conditions on modules elsewhere. If you want the widget visible too, add a second copy without that setting.

---

## How scheduling priority works

The system evaluates schedules in this order:

1. **Scheduled profiles** -- checked first. The display scans profiles from top to bottom. The first profile whose schedule matches the current time wins. This is why profile order matters.
2. **Manual active profile** -- if no scheduled profile matches, the manually selected active profile is used.
3. **All screens** -- if no profile matches at all (or no profiles exist), all screens are shown.

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

Set the global rotation interval in **Settings > Screen > Rotation & appearance**. The slider ranges from 5 to 120 seconds (default: 30 seconds). Each screen is shown for this duration before cycling to the next.

Rotation pauses automatically when the display is asleep -- no point cycling through screens nobody can see.

### Per-screen override (`rotationDurationMs`)

Any individual screen can override the global rotation interval, useful for dinner-prep displays, guest-mode timers, or a hero screen that needs to linger. In the editor, select a screen tab, open the **Screen settings** panel (the right-hand property panel when no module is selected), and find **Duration** under **Rotation**. It starts out inheriting the global interval and shows what that interval currently is; click **Override** to start editing it, and **Reset** to go back to inheriting. Set the override to **0** to pin the screen indefinitely (no rotation until manually advanced).

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
| **Crossfade** | Overlapping fade with both screens visible briefly |
| **None** | Instant switch, no animation |

Transition duration is configurable from 0.3 to 2.0 seconds. All effects except blur use GPU-composited properties (opacity and transforms), making them smooth even on a Raspberry Pi.

### Manual navigation

The display shows pagination dots at the bottom when there are multiple screens. Click a dot to jump directly to that screen. On a touchscreen you can also **flick left or right anywhere on the display** to go to the next or previous screen (on by default; turn it off with **Swipe to change screens** in Settings > Screen). **Double-tap the active (highlighted) dot** to pause screen rotation, double-tap again to resume. An optional auto-resume timeout (configurable in Settings > Screen) resumes rotation after inactivity. Navigation is also available via the [remote display control API](/docs/api).

---

## Sleep schedule

The sleep system controls when the display dims or turns off entirely. It is configured in **Settings > Screen > Sleep & dimming**. The form groups the controls into three sections -- what happens when nobody's using the display, what happens every day at set times, and how the dimmed state looks -- with a 24-hour preview bar showing the resulting day at a glance.

### Idle-based sleep

When **Enable display sleep** is on and **Dim after a few quiet minutes** is toggled on, the display progresses through three states based on inactivity:

1. **Active** -- full brightness, normal operation
2. **Dimmed** -- brightness reduced (configurable from 5% to 80%) after a set idle period (1--60 minutes)
3. **Asleep** -- screen fully black after an additional idle period (0--120 minutes after dimming; set to Never to stay dimmed indefinitely)

Turn **Dim after a few quiet minutes** off and the display never reacts to inactivity -- it stays at full brightness until a schedule below dims it or turns it off. That's the setup for "full brightness all day, off overnight."

Any mouse, touch, or keyboard input immediately wakes the display to full brightness.

### Screensaver

During the dimmed state, a screensaver can be shown:

- **Drifting clock** -- a minimal clock that moves around the screen to prevent burn-in
- **Blank** -- just the dim overlay, no clock
- **Off** -- no screensaver; the display still dims, it just shows nothing extra

### Scheduled dimming

Toggle **Dim in the evening** to force the display to dim during a fixed window (e.g. 23:00 to 06:00). The display brightens automatically when the window ends. Supports overnight spans.

### Scheduled sleep

Toggle **Turn off overnight** to force the display fully off during a fixed window (e.g. 00:00 to 06:00). Touching the display (or waking it from the remote) during the window brings it back for the **After a wake-up, stay on for** setting (5 minutes by default), then the schedule takes over again. It wakes automatically when the window ends. Supports overnight spans.

### Sleep priority

```
Sleep schedule (highest)  -->  forces display off; a wake pauses it for the wake-up hold
Dim schedule              -->  forces dimmed while its window is active
Idle-based dim/sleep      -->  inactivity timer; runs only while its toggle is on
User activity (wake)      -->  any input restores full brightness
```

---

## Display Rules

Rules make a display react to what's happening, not just to the clock. When a rule's conditions become true, it can jump to a screen or wake the display -- for example, showing a doorbell camera screen when the bell rings, or waking up when someone unlocks the front door. Add and edit rules in **Settings > Automation > Rules**.

{% callout type="note" %}
Most rules react to live values published by an add-on, like a Home Assistant integration -- see the [Plugins guide](/docs/plugins) for what's available. You can also build a rule purely on the clock, using a time-of-day and day-of-week condition, with no add-on at all.
{% /callout %}

### Conditions

Rules use the same condition types as [module visibility conditions](/docs/configuration#module-visibility): a value published by an add-on, a numeric threshold, or a time-of-day/day-of-week window, combined with AND/OR/NOT groups. A rule only fires the moment its conditions become true, not on every check while they stay true -- so a reboot or a restarting add-on won't slam the display onto an alert screen for something that's been true for hours. Each condition row shows a live met/not-met indicator, so you can see exactly why a rule has or hasn't fired.

### Actions

A rule can:

- **Show a screen** -- either for as long as the conditions stay true (with a 5-second minimum hold, so a flickering sensor can't rapid-fire the display), or for a fixed number of seconds before normal rotation resumes. If the display is on a sleep schedule, a rule that has just started keeps the screen lit for up to 5 minutes; after that the display sleeps as normal with the rule's screen still pinned underneath, so a sensor left on overnight can't keep a bedroom display bright
- **Wake the display** -- holds it awake for 5 minutes, then it goes back to its normal sleep schedule
- **Put the display to sleep**

### Priority, cooldown, and copying rules

When more than one rule could fire at once, the one listed first wins -- drag rule cards to reorder them. Set a cooldown (in seconds) so a rule won't fire again immediately after it triggers.

In multi-display setups, each display owns its own rules, since a rule's "show a screen" action points at that display's own screens. Use **Copy to another display** on a rule card to duplicate a rule elsewhere -- the copy arrives with its target screen cleared, ready for you to pick a screen on the new display.

---

## Real-world examples

### Morning dashboard vs. evening display

Create two profiles with complementary schedules:

**Morning** profile (screens: Weather, Calendar, Commute)
- Days: Mon--Fri
- From: 06:00, Until: 09:00

**Evening** profile (screens: Photos, News, Sports)
- Days: Mon--Fri
- From: 18:00, Until: 23:00

Outside these windows, the manually set active profile (or all screens) is shown.

### Weekday vs. weekend layouts

**Weekday** profile (screens: Calendar, Weather, Commute, News)
- Days: Mon--Fri
- From/Until: leave blank (all day)

**Weekend** profile (screens: Photos, Sports, Meal Planner)
- Days: Sat, Sun
- From/Until: leave blank (all day)

The weekday profile should be listed first so it takes priority on weekdays. On weekends, it won't match, and the weekend profile activates instead.

### Hide commute module on weekends

Instead of creating separate profiles, use a module-level schedule on the traffic/commute module:

- Enable Schedule on the traffic module
- Days: Mon--Fri
- From: 06:00, Until: 09:30
- Invert: off (show only during this window)

The commute module appears only on weekday mornings. The rest of the screen stays the same all week.

### Weekend-only chore chart screen

You want a full-screen chore chart that only exists on Saturdays and Sundays -- on weekdays the display should rotate through the remaining screens as if the chore screen weren't there at all.

- Create a screen and add the `fullscreen-chore-chart` module
- Select the screen tab and open its **Schedule** section
- Enable Schedule
- Days: Sat, Sun
- From/Until: leave blank (active all day on those days)
- Invert: off

Monday through Friday the screen is filtered out of the rotation pool before profile resolution, so it never appears regardless of which profile is active. On weekends it joins the rotation automatically.

### Office hours display vs. after-hours

**Office Hours** profile (screens: Meeting Room Schedule, Company Dashboard)
- Days: Mon--Fri
- From: 08:00, Until: 18:00

**After Hours** profile (screens: Photos, Clock)
- Days: Mon--Fri
- From: 18:00, Until: 08:00

On weekends, neither profile matches (both are weekday-only), so the manually set active profile or all screens are shown. To handle weekends, add a third **Weekend** profile with Sat and Sun selected.

### Night mode with sleep

Combine profiles with sleep settings for a complete daily automation:

1. **Morning** profile: 06:00--09:00 weekdays (weather + calendar + commute)
2. **Default** profile: set as manually active (everything else)
3. **Sleep schedule**: 23:00--06:00 (display fully off overnight)
4. **Dim schedule**: 21:00--23:00 (reduced brightness in the evening before sleep)

The display wakes at 06:00, shows the morning profile until 09:00, falls back to the default profile, dims at 21:00, and sleeps at 23:00.
