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
**Running multi-display?** In multi-display mode profiles are scoped per display — each display owns its own profile list and `screenIds` reference that display's own screens, not a shared pool. See [Multi-display > Per-display profiles](/docs/multi-display#per-display-profiles) for the scoping rules.
{% /callout %}

---

## What are profiles?

A **profile** is a named group of screens. Instead of always rotating through every screen you have configured, a profile limits the display to a specific subset. You can have as many profiles as you want.

When no profile is active, the display shows all screens. When a profile is active -- either manually selected or triggered by a schedule -- only the screens assigned to that profile are shown.

Profiles are defined in your configuration alongside screens:

```typescript
{
  version: 1,
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

Profiles are managed in the editor under **Settings > Profiles**.

### Adding a profile

1. Open **Settings > Profiles**
2. Click **Add Profile** -- a new profile is created with all screens selected
3. Give it a descriptive name (e.g. "Morning", "Weekend", "Office Hours")

### Selecting and ordering screens

Expand a profile card to see the sortable screen list. Toggle screens on or off to control which ones are included, and drag them to set the order they rotate in on the display. A profile with no screens selected falls back to showing all screens.

The screen order within a profile determines the rotation sequence — the display cycles through screens in the order you arrange them, not the order they appear in the editor tabs.

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

1. Expand a profile card in **Settings > Profiles**
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

### How module visibility is evaluated

The display re-evaluates module visibility every minute. A module is visible when:

1. Its `daysOfWeek` includes the current day (or is omitted/empty, meaning every day)
2. The current time falls within the `startTime`--`endTime` window (or both are omitted, meaning all day)
3. If `invert` is true, the logic is flipped -- the module is hidden when conditions 1 and 2 match, and shown otherwise

Overnight time windows and day-of-week rollover for the post-midnight portion work the same way as profile schedules.

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
| No profiles exist | All screens shown, as if profiles are disabled |

---

## Screen rotation

When a profile (or the default view) includes multiple screens, the display automatically rotates through them.

### Rotation interval

Set the global rotation interval in **Settings > Display > Screen Rotation**. The slider ranges from 5 to 120 seconds (default: 30 seconds). Each screen is shown for this duration before cycling to the next.

Rotation pauses automatically when the display is asleep -- no point cycling through screens nobody can see.

### Per-screen override (`rotationDurationMs`)

Any individual screen can override the global rotation interval — useful for dinner-prep displays, guest-mode timers, or a hero screen that needs to linger. In the editor, select a screen tab and open its properties to set a per-screen duration. Set the override to **0** to pin the screen indefinitely (no rotation until manually advanced). Screens without an override inherit the global interval.

### Transition effects

Configure the animation between screens in **Settings > Display > Transition Effect**:

| Effect | Description |
|---|---|
| **Fade** | Cross-dissolve between screens (default) |
| **Slide Left** | Old screen slides left, new slides in from right |
| **Slide Up** | Old screen slides up, new slides in from bottom |
| **Zoom** | Old screen zooms out, new zooms in |
| **3D Flip** | Perspective flip between screens |
| **Blur** | Dissolve through a blur (may be GPU-intensive on low-power devices) |
| **Crossfade** | Overlapping fade with both screens visible briefly |
| **None** | Instant switch, no animation |

Transition duration is configurable from 0.3 to 2.0 seconds. All effects except blur use GPU-composited properties (opacity and transforms), making them smooth even on a Raspberry Pi.

### Manual navigation

The display shows pagination dots at the bottom when there are multiple screens. Click a dot to jump directly to that screen. **Double-tap the active (highlighted) dot** to pause screen rotation — double-tap again to resume. An optional auto-resume timeout (configurable in Settings > Display) resumes rotation after inactivity. Navigation is also available via the [remote display control API](/docs/api).

---

## Sleep schedule

The sleep system controls when the display dims or turns off entirely. It is configured in **Settings > Sleep & Screensaver**.

### Idle-based sleep

When **Enable display sleep** is checked, the display progresses through three states based on inactivity:

1. **Active** -- full brightness, normal operation
2. **Dimmed** -- brightness reduced (configurable from 5% to 80%) after a set idle period (1--60 minutes)
3. **Asleep** -- screen fully black after an additional idle period (0--120 minutes after dimming; set to 0 to stay dimmed indefinitely)

Any mouse, touch, or keyboard input immediately wakes the display to full brightness.

### Screensaver

During the dimmed state, a screensaver can be shown:

- **Drifting clock** -- a minimal clock that moves around the screen to prevent burn-in
- **Blank** -- just the dim overlay, no clock
- **Off** -- skip dimming entirely and go straight to sleep

### Scheduled dimming

Toggle **Dim on a schedule** to force the display to dim during a fixed window (e.g. 23:00 to 06:00). The display brightens automatically when the window ends. Supports overnight spans.

### Scheduled sleep

Toggle **Sleep on a schedule** to force the display fully off during a fixed window (e.g. 00:00 to 06:00). This overrides everything -- the display ignores user activity during the sleep window and wakes automatically when it ends. Supports overnight spans.

### Sleep priority

```
Sleep schedule (highest)  -->  forces display off, ignores activity
Dim schedule              -->  forces dimmed, suppresses idle sleep
Idle-based dim/sleep      -->  based on inactivity timer
User activity (wake)      -->  any input restores full brightness
```

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
