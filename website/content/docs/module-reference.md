---
title: Module Reference
nextjs:
  metadata:
    title: Module Reference
    description: Every configuration option for all 43 built-in Home Screens modules — clocks, weather, calendars, sports, news, chore charts, meal planners, and more.
    alternates:
      canonical: /docs/module-reference
---

Exhaustive per-module option tables for every built-in module. If you're new to the module system, start with the [Modules guide](/docs/modules) — this page assumes you already know which module you want and are looking for the exact field names.

Home Screens includes {% $stats.moduleCount %} built-in modules organized into {% $stats.categoryCount %} categories. Each module can be dragged onto the canvas from the module palette in the editor.

One of those categories, **Health & Fitness**, has no built-in modules yet. It is reserved for add-ons such as Strava and Garmin, stays hidden in the module palette until you install one, and so has no section below.

Where a module has a `refreshIntervalMs` option, its default comes from that module's fetch cache lifetime rather than a value written into the module itself, so it stays in step with how long the server caches the same data. The numbers below are the current defaults; you can always override them per module.

## Full Screen

These modules are designed to fill the entire display as ambient, always-on screens. They use the `fillsCanvas` flag — position, size, and style controls are hidden in the editor since the module always occupies the full display area.

**Themes:** all five full-screen modules share one `theme` field with twelve color palettes: `linen`, `paper`, `mist`, `sandstone`, `vellum`, and `bloom` (light), `charcoal`, `midnight`, `slate`, `aurora`, `obsidian`, and `horizon` (dark). Leave `theme` unset to inherit the display-wide default from **Settings > Screen** (`fullscreenTheme`). Anything that isn't one of the twelve ids falls back to Linen.

The six newer themes (`sandstone`, `vellum`, `bloom`, `aurora`, `obsidian`, `horizon`) additionally carry their own accent color and, on the Full-Screen Calendar only, an event style deciding how event blocks are painted: a faint tint (`linen` and the other original themes), a translucent card, a solid color fill, or a plain surface with a colored edge. All but `vellum` also paint a static gradient behind the module. On the calendar, chore chart, and meal planner, setting `accentColor` overrides the theme's own accent and leaving it empty follows the theme; the weather module's accent follows the sky instead, and the photo viewer has none.

The older `darkMode` boolean on Full-Screen Calendar and Full-Screen Chore Chart has been superseded by `theme` and is no longer shown in the editor. It still works as a fallback so older configurations keep rendering: `darkMode: true` maps to `charcoal` and `false` maps to `linen`. It is ignored entirely whenever `theme` is set.

### Full-Screen Calendar

A fullscreen ambient calendar display inspired by Skylight, designed to fill the entire screen. Automatically sizes to the display dimensions and pins to position (0,0). Pulls from any iCal feed, Google Calendar (via iCal URL or OAuth), or iCloud (app-specific password) — see [Calendar setup](/docs/getting-started#calendar-setup).

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"schedule"` | Display style: `schedule`, `week-list`, `month-grid`, `day-timeline`, `agenda`, `family-grid`, `up-next`, or `free-time` |
| `density` | string | `"cozy"` | Layout density: `cozy` or `snug` |
| `typographySize` | string | `"medium"` | Text size: `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` |
| `accentColor` | string | — | Accent color for event indicators and highlights. Leave empty to follow the theme's own accent; set a color to pin it |
| `dimPastEvents` | boolean | `true` | Reduce opacity of past events |
| `shadeWeekends` | boolean | `true` | Subtle background tint on weekend columns/rows |
| `weatherPlacement` | string | `"header"` | Where weather appears: `off`, `header` (temperature pill at the top), `days` (daily forecast on day headers), `events` (forecast for each event's start time), or `days-and-events`. Day placement renders in the schedule, week list, and agenda views; event placement in week list and agenda. Views without that surface fall back to the header pill, so weather never disappears when switching views |
| `showWeather` | boolean | — | Superseded by `weatherPlacement`. Kept so older configurations still render: `false` maps to `off`, `true` to `header` |
| `showNowLine` | boolean | `true` | Show a line indicating the current time |
| `showCountdown` | boolean | `false` | Week list and agenda views: show a "in 2 hours" style countdown next to upcoming events |
| `countdownAllDay` | boolean | `false` | Also show day countdowns on all-day events (off by default so "in 0 days" noise never appears) |
| `showProgressBar` | boolean | `false` | Week list and agenda views: show a progress bar on events happening right now |
| `emptyDayText` | string | — | Custom wording for days with no events (for example "Free day!"); empty = the standard message |
| `sourceFilter` | array | — | Calendar source IDs to display (empty = all) |
| `theme` | string | — | One of the twelve shared full-screen palettes (see [Themes](#full-screen) above). Unset = inherit the display default from Settings > Screen |
| `darkMode` | boolean | `false` | Superseded by `theme` (see above). Kept so older configurations still render |
| `todayHighlightStyle` | string | `"full"` | How strongly today is highlighted: `full` (accent-tinted fill), `subtle` (faint background), `minimal` (marker only), or `off` |
| `eventOverlap` | string | `"columns"` | How overlapping events are laid out in schedule and day timeline views: `columns` (side-by-side, with a "+N" indicator when events don't fit) or `stacked` (cascading overlap) |
| `wrapEventTitles` | boolean | `false` | Wrap long event titles onto a second line in schedule and month views instead of truncating |
| `eventTapDetails` | boolean | `false` | On touch displays, tap an event to open a detail panel with its time, location, and description |
| `eventTapStyle` | string | `"sheet"` | How the event detail opens: `sheet` (slides up from the bottom) or `card` (centered card) |
| `startDay` | string | `"sunday"` | First day of the week in the week list and month grid views: `sunday` or `monday` |
| `hourWindow` | string | `"fixed"` | Schedule and day timeline hours: `fixed` (the start and end hours below) or `rolling` (a window that follows the clock, starting an hour before now, so what is next is always full size; a footer strip names the window and counts today's earlier events it is not showing) |
| `rollingHours` | number | `8` | Length of the rolling window in hours (4–16) |
| `scheduleDaysToShow` | number | `0` | Days visible in schedule view (1–7, 0 = auto) |
| `scheduleHourStart` | number | `6` | Schedule view start hour (0–23) |
| `scheduleHourEnd` | number | `22` | Schedule view end hour (1–24) |
| `scheduleShowDescription` | boolean | `false` | Show the event description under the title in schedule view |
| `scheduleStartAnchor` | string | `"today"` | First column of the schedule view: `today` (slides forward each day), `start-of-week` (days keep their place all week), or `next-weekend` (Saturday and Sunday planning board) |
| `weekCollapsePastDays` | boolean | `true` | Collapse past days in week list view |
| `weekShowDescription` | boolean | `false` | Show the event description under the title in week list view |
| `showMeals` | boolean | `false` | Week list view: add the day's planned meals from the meal planner under its events |
| `showChores` | boolean | `false` | Week list view: add one chore progress row per day (done/total, a bar, and who has a chore) from the chore chart |
| `familyShowEveryoneRow` | boolean | `true` | Family grid view: an Everyone row for events on calendars that belong to nobody in particular |
| `upNextLaterCount` | number | `3` | Up next view: how many more events from the same day to list under the big one (0–6) |
| `upNextShowEarlier` | boolean | `true` | Up next view: list today's running and finished events |
| `upNextShowTomorrow` | boolean | `true` | Up next view: list tomorrow's events |
| `freeTimeHourStart` | number | `7` | Free time view start hour (0–23) |
| `freeTimeHourEnd` | number | `22` | Free time view end hour (1–24) |
| `freeTimeShowTomorrow` | boolean | `true` | Free time view: add a compact row per person for tomorrow |
| `monthShowWeekNumbers` | boolean | `false` | Show week numbers in month grid view |
| `monthMaxEventsPerCell` | number | `0` | Max events per cell in month grid (0 = auto) |
| `dayHourStart` | number | `6` | Day timeline view start hour |
| `dayHourEnd` | number | `22` | Day timeline view end hour |
| `dayShowLocation` | boolean | `true` | Show event locations in day timeline view |
| `dayShowDescription` | boolean | `false` | Show the event description under the title in day timeline view |
| `agendaDaysAhead` | number | `14` | Days ahead to show in agenda view (7–30) |
| `agendaHideEmptyDays` | boolean | `false` | Hide days with no events in agenda view |
| `agendaShowFinishedToday` | boolean | `false` | Agenda view keeps events that already ended today on the list (dimmed) until midnight instead of dropping them as they end |
| `agendaShowDescription` | boolean | `false` | Show the event description under the title in agenda view |
| `agendaSeparators` | string | `"none"` | Boundary markers in agenda view: `none`, `weeks` (a "Week of" rule at each week start), or `weeks-and-months` (plus a month divider; the month marker wins when both land on the same day) |
| `titleFilter` | object | — | Keyword filter on event titles: `{ mode, terms }` where `mode` is `include` (keep only matching events) or `exclude` (drop them). Terms are case-insensitive substrings; an empty `terms` list means no filter |
| `showLegend` | string | `"off"` | A color key naming each calendar the module is showing: `off`, `header`, or `footer` |
| `eventRules` | array | — | Restyle or hide individual events by what they match. See [Event and day rules](#event-and-day-rules) below |
| `dayRules` | array | — | Tint whole days and add badges to them. See [Event and day rules](#event-and-day-rules) below |

In the schedule and day timeline views, descriptions only draw when the event block is tall enough to fit them, so short events show the title alone even with the toggle on.

**View details:**

- **schedule** — Multi-day time grid with events positioned by start/end time. Shows a "now" line and supports configurable hour range.
- **week-list** — Day-by-day vertical list of the current week's events with collapsible past days.
- **month-grid** — Traditional month calendar grid with event dots/names in each cell and today highlighted.
- **day-timeline** — Single-day vertical timeline with event blocks, location details, and hour markers.
- **agenda** — Scrollable list of upcoming events across multiple days, grouped by date.
- **family-grid** — People as rows, the week as columns. Each person set up under **Settings > Calendar > People** gets a row; events on calendars that belong to nobody sit once on an Everyone row. Without people, every calendar with an event this week gets its own row.
- **up-next** — The next event, big: title, time, place, countdown (or progress while it is running), then short lists for later today, earlier today, and tomorrow.
- **free-time** — One track per person for today, busy blocks and free gaps side by side, with a card naming when everyone is free. Events on shared calendars count as busy for the whole household.

**People:** the family grid and free time views read the household list under **Settings > Calendar > People**: a name, a color, and which calendars belong to each person. A calendar picked for nobody is shared.

### Full-Screen Chore Chart

A fullscreen ambient chore chart display designed to fill the entire screen. Reads members and chores from shared data (`data/chores.json`) so the fullscreen display, module views, and remote Chores tab all share the same source of truth. Automatically sizes to the display dimensions and pins to position (0,0).

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"chores"` | Display mode: `chores` (daily chore board) or `rewards-store` (browse and redeem rewards) |
| `showRewardsButton` | boolean | `false` | Show a toggle button in the chore board header to switch to the rewards store view |
| `weekStartDay` | string | `"monday"` | First day of week: `sunday` or `monday` |
| `showPoints` | boolean | `true` | Show ticket values for chores |
| `showStreaks` | boolean | `true` | Show completion streaks |
| `showTimeOfDay` | boolean | `true` | Group chores by time of day (morning, afternoon, evening) |
| `allowDisplayComplete` | boolean | `true` | Let anyone tap a chore on the display itself to mark it done |
| `theme` | string | — | One of the twelve shared full-screen palettes (see [Themes](#full-screen) above). Unset = inherit the display default from Settings > Screen |
| `darkMode` | boolean | `true` | Superseded by `theme` (see above). Kept so older configurations still render |
| `density` | string | `"cozy"` | Layout density: `cozy` or `snug` |
| `typographySize` | string | `"medium"` | Text size: `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` |
| `accentColor` | string | — | Accent color for highlights and active time-of-day. Leave empty to follow the theme's own accent; set a color to pin it |

**Layout details:**

- **Portrait** — Header with date and completion percentage, horizontal member chips with progress bars, stacked time-of-day bands (morning/afternoon/evening/anytime), and a star chart grid at the bottom for weekly tracking.
- **Landscape** — Top bar with date and member chips, three-column layout for morning/afternoon/evening, and a horizontal star chart in the footer.

**Rewards store view:**

The `rewards-store` view displays a fullscreen rewards browsing and redemption interface. A member picker at the top shows each member's ticket balance. The main area shows a grid of available rewards with ticket costs and eligibility indicators. Members can redeem rewards directly from the display when they have enough tickets. When `showRewardsButton` is enabled, a toggle button in the chore board header lets users switch between the chore board and rewards store without changing the module config.

### Full-Screen Meal Planner

A fullscreen ambient meal planner display that shows the weekly meal schedule at a glance. Reads from the same meal data as the standard meal planner module. Supports light/dark themes with multiple color palettes.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"week"` | Display style: `week`, `today`, `menu-board`, or `next-meal` |
| `density` | string | `"cozy"` | Layout density: `cozy` or `snug` |
| `typographySize` | string | `"medium"` | Text size: `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` |
| `accentColor` | string | — | Accent color for highlights. Leave empty to follow the theme's own accent; set a color to pin it |
| `showPrepTime` | boolean | `true` | Show prep time in minutes |
| `showTags` | boolean | `true` | Show meal tags |
| `showEmoji` | boolean | `true` | Show meal emoji |
| `showDifficulty` | boolean | `false` | Show difficulty indicator |
| `theme` | string | — | One of the twelve shared full-screen palettes (see [Themes](#full-screen) above). Unset = inherit the display default from Settings > Screen |
| `tapRecipeAction` | string | `"off"` | What tapping a meal with a saved recipe link does: `off`, `qr` (fullscreen QR code overlay), or `iframe` (embed the recipe page) |

Enabled slots, week start day, default slot times, and 12/24h formatting are **household-level settings** stored in `data/meals.json` — edit them once under `/remote` > Meals > Settings and every meal-planner module on every display picks up the change. The time format defaults to the household **Time format** setting (Settings → Defaults → Location & language); pick an explicit 12- or 24-hour option in meal settings only if meals should differ from it.

**View details:**

- **week** — Full 7-day grid with meal cards organized by slot, today highlighted.
- **today** — Focused view of today's meals with large cards and details.
- **menu-board** — Restaurant-style board layout for displaying the week's menu.
- **next-meal** — Large display of the next upcoming meal with context label.

### Full-Screen Weather

A fullscreen weather dashboard with five views. **Panorama** stacks the current conditions, an optional next-hour rain strip, a temperature curve, a 7-day outlook with range bars, and a row of stats. **Almanac** is a grid of instrument cards: sun arc, moon phase, wind, humidity, pressure, UV, and visibility, plus the next 12 hours. **Ambient** is a large, plain read for across the room. **Week ahead** gives each forecast day its own band (or, on a landscape display, its own column) with the day's icon, description, rain chance, wind (when the weather source reports a daily figure), and a high/low bar on a shared scale. **Hour by hour** draws the next 24 hours as a timeline (48 on sources that report every three hours): a temperature curve through every hour, with rain chance and wind beside it. It runs down the page on a portrait display and across it on a landscape one.

Every view has a portrait and a landscape layout, picked automatically from the display's shape.

The background tint follows the current conditions and the position of the sun, layered behind the cards so it never affects how readable anything is. Set **Background tint** to Off for a plain themed background.

Some panels depend on what your weather source provides, and hide themselves when it has nothing to show:

- **Next-hour rain** needs minute-by-minute data, which only Pirate Weather offers today.
- **Weather warnings** need alerts, available from Pirate Weather and NOAA.
- **Pressure** and **dew point** come from NOAA, Open-Meteo, and the Met Office.
- **UV index** comes from Pirate Weather, the Met Office, WeatherAPI, and Open-Meteo.
- **Visibility** comes from NOAA.

The temperature curve draws however many hours your source returns, and its heading says how many. Most sources give 48 hours; OpenWeatherMap gives 5 days in 3-hour steps; NOAA gives about 6 days hourly.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"panorama"` | `panorama`, `almanac`, `ambient`, `week`, or `hourly` |
| `theme` | string | — | Full-screen palette; unset inherits the display default |
| `skyLayer` | string | `"auto"` | `auto` tints the background by conditions, `off` uses the plain theme background |
| `animateConditions` | boolean | `true` | Falling rain and snow. Turn off if the display stutters on older hardware |
| `showNowcast` | boolean | `true` | Next-hour rain strip (Panorama, Pirate Weather only) |
| `showAlerts` | boolean | `true` | Severe-weather banner |
| `showTime` | boolean | `true` | Clock in the header. Follows your 12/24-hour setting and the display's time zone |
| `showRibbon` | boolean | `true` | Temperature curve (Panorama) |
| `showStatRail` | boolean | `true` | Bottom stats row (Panorama) |
| `daysToShow` | number | `7` | Days in the outlook list, 3–7 (Panorama and Week ahead) |
| `locationLabel` | string | — | Overrides the place name shown in the header |
| `accentColor` | string | — | Leave empty to let the accent follow the weather (amber for clear, blue for rain, violet for storms); set a colour to pin it |
| `density` | string | `"snug"` | `cozy` or `snug`. Controls padding, gaps, and chart heights |
| `typographySize` | string | `"medium"` | Text size. Scales type only, so the layout keeps its proportions |

### Full-Screen Photo Viewer

A fullscreen digital photo frame that cycles through photos from a local directory, an Immich library, a OneDrive folder, or an iCloud shared album (with [Google Photos available as an import](/docs/backgrounds#google-photos)), **or displays a single pinned photo** as a static wallpaper. Supports transitions, shuffle, and an optional clock overlay, and can mix in videos from the same source.

The editor's **Mode** dropdown toggles between Slideshow and Single Photo. Single-photo mode simply sets the `file` field; the rotation, interval, transition, and shuffle controls are hidden while `file` is set. "Single Photo" is only an editor UI label — nothing stores a "mode" setting on the module itself.

| Option | Type | Default | Description |
|---|---|---|---|
| `file` | string | — | Path to a single pinned photo. When set, the viewer shows this image statically and ignores `directory`/`intervalMs`/`transition`/`shuffle`. Shows a "No photo selected" empty state until chosen |
| `directory` | string | `""` | Path to local photo directory (slideshow mode) |
| `intervalMs` | number | `30000` | Time between photos in milliseconds |
| `transition` | string | `"fade"` | Transition effect: `fade`, `slide`, `zoom`, or `none` |
| `objectFit` | string | `"cover"` | Image fit mode: `cover`, `contain`, or `fill` |
| `shuffle` | boolean | `false` | Randomize photo order |
| `showClock` | boolean | `true` | Show clock overlay on photos |
| `kenBurns` | boolean | `false` | Enable Ken Burns (slow pan/zoom) effect |
| `source` | string | `"local"` | Photo source: `local`, `immich` (requires keys in Settings > API keys), `onedrive` (a one-time Microsoft sign-in), or `icloud` (a public shared album — no keys needed) |
| `immichAlbumId` | string | — | Filter to a specific Immich album |
| `immichPersonId` | string | — | Filter to a recognized person (face) in Immich |
| `immichFavoritesOnly` | boolean | `false` | Only show photos marked as favorites in Immich |
| `immichCount` | number | `50` | Number of photos to load per refresh (10–200) |
| `icloudAlbumUrl` | string | — | iCloud shared album link (`icloud.com/sharedalbum/#TOKEN`) or bare token (iCloud source) |
| `onedriveFolderId` | string | — | OneDrive folder to pull photos from (OneDrive source) |
| `onedriveFolderName` | string | — | Folder name as shown in the editor — display only, the ID above is authoritative |
| `onedriveCount` | number | `50` | Number of photos to load per refresh (10–200) |
| `mediaTypes` | string | `"photos"` | What to show: `photos`, `videos`, or `both` |
| `maxVideoDurationMs` | number | `60000` | Longest a video slide can play before moving on (60 sec) |
| `theme` | string | — | Palette for the clock overlay and empty states; one of the twelve shared full-screen palettes (see [Themes](#full-screen) above). Unset = inherit the display default from Settings > Screen, and Midnight if that is unset too |

{% callout type="note" title="Immich source" %}
The Immich options only appear in the editor when both **Immich Server URL** and **Immich API Key** are configured in Settings > API keys. Album and person filters are mutually exclusive — selecting one clears the other.
{% /callout %}

{% callout type="note" title="OneDrive source" %}
The OneDrive option only appears in the Photo Source picker once a Microsoft **Application (client) ID** is saved in Settings > API keys. Signing in happens in the module itself: click **Sign in with Microsoft** and enter the shown code at the link on any device. Photos shuffle on every refresh; very large folders use a random sample of 1,000 photos. The full walkthrough is in [OneDrive photos](/docs/modules#one-drive-photos).
{% /callout %}

---

## Time & Date

### Clock

Displays the current time with optional date information. Supports {% $stats.clockViewCount %} visual styles.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"classic"` | Display style: `classic`, `digital`, `analog`, `minimal`, `flip`, `word`, `binary`, `vertical`, `split`, `progress`, `fuzzy`, `world`, `dot-matrix`, `radial`, `arc`, `neon`, `bar`, or `elapsed` |
| `timezone` | string | `""` | IANA timezone to show (e.g. `"Asia/Tokyo"`); empty = follow the display setting |
| `format24h` | boolean | `false` | Use 24-hour time format |
| `showSeconds` | boolean | `true` | Display seconds |
| `showDate` | boolean | `true` | Show date below time |
| `dateFormat` | string | `"EEEE, MMMM d"` | Date format string (date-fns) |
| `showWeekNumber` | boolean | `false` | Display current week number |
| `showDayOfYear` | boolean | `false` | Display day of year (e.g. "Day 67 of 365") |
| `showNumerals` | boolean | `false` | Show hour numbers on the analog clock face |
| `animateFlip` | boolean | `true` | Show flip animation on digit change (flip view) |
| `accentColor` | string | `"#22d3ee"` | Accent color used by several views |
| `worldZones` | array | `[]` | Additional timezones for the world view (max 3), each with `label` and `timezone` |
| `referenceTime` | string | `""` | ISO timestamp or time string for elapsed view |
| `referenceLabel` | string | `""` | Label for elapsed view (e.g. "market open", "shift start") |
| `countUp` | boolean | `true` | Count up (true) or down (false) from reference time (elapsed view) |
| `elapsedFormat` | string | `"units"` | How the elapsed view renders units: `units` (50d 20h 13m), `unitsUpper` (50D 20H 13M), `unitsShort` (50day 20hr 13min), `colon` (50:20:13:00), `words` (50 days, 20 hours), or `wordsTitle` (50 Days, 20 Hours). The two word styles are localized. |
| `elapsedPrecision` | string | `"auto"` | Which units the elapsed view shows: `auto`, `days`, `daysHours`, `daysHoursMinutes`, or `daysHoursMinutesSeconds`. Named precisions always show their full set including zeros; `auto` hides days and hours while they are zero and shows seconds only under an hour. The `colon` format is the exception: it always keeps a seconds segment, so its rightmost column always means seconds and the counter never appears to reset at the hour or day mark. |

### Calendar

Shows upcoming events from any iCal feed, Google Calendar (via iCal URL or OAuth), or iCloud (app-specific password), with multiple view modes.

| Option | Type | Default | Description |
|---|---|---|---|
| `viewMode` | string | `"daily"` | View mode: `daily`, `agenda`, `week`, `multi-week`, or `month` |
| `daysToShow` | number | `3` | Number of days ahead to display |
| `showTime` | boolean | `true` | Show event times |
| `showLocation` | boolean | `false` | Show event locations |
| `maxEvents` | number | `20` | Maximum number of events to display |
| `showWeekNumbers` | boolean | `false` | Show week numbers in week/multi-week/month views |
| `weeksToShow` | number | `6` | Multi-week view: how many weeks to show (4–12), starting with the current week |
| `gridMaxEventsPerCell` | number | `4` | Week/multi-week/month grids: event pills per day cell before "+N more" (2–10). Unset shows 5 in the week grid and 4 in the shorter multi-week and month cells |
| `startDay` | string | `"sunday"` | First day of the week in the week/multi-week/month grids: `sunday` or `monday` |
| `gridEventStyle` | string | `"classic"` | Event rendering in the week/multi-week/month grids: `classic` (colored dot on a light pill) or `colored` (see below) |
| `gridEventPillBackground` | boolean | `false` | Colored style: faint background behind timed events |
| `gridTheme` | string | `"banner"` | Multi-week and month grid look: `banner` (the original tinted day strips), `clean` (month header, quiet day numbers, compact times next to bold titles), `minimal` (titles only, with a colored edge per calendar), or `vivid` (solid color pills). The three newer looks style their own events, so `gridEventStyle` doesn't apply to them |
| `sourceFilter` | array | — | Calendar source IDs this module shows (empty or unset = all sources merged). Use it to give one screen a single family member's calendar |
| `dailyShowDescription` | boolean | `false` | Show the event description under the title (daily view) |
| `agendaShowDescription` | boolean | `false` | Show the event description under the title (agenda view) |
| `showCountdown` | boolean | `false` | Daily and agenda views: show a "in 2 hours" style countdown next to upcoming events |
| `showProgressBar` | boolean | `false` | Daily and agenda views: show a progress bar on events happening right now |
| `emptyDayText` | string | — | Daily view: custom wording for days with no events (for example "Free day!") |
| `agendaSeparators` | string | `"none"` | Agenda view boundary markers: `none`, `weeks`, or `weeks-and-months` |
| `agendaShowFinishedToday` | boolean | `false` | Agenda view keeps events that already ended today on the list (dimmed) until midnight, and an event that spans several days (a trip, a race weekend) groups under today while it's still running instead of under the day it started |
| `accentColor` | string | `"#3b82f6"` | Event indicator bar and today highlights |
| `eventTapDetails` | boolean | `false` | On touch displays, tap an event to open a detail panel with its time, location, and description |
| `eventTapStyle` | string | `"sheet"` | How the event detail opens: `sheet` (slides up from the bottom) or `card` (centered card) |
| `titleFilter` | object | — | Keyword filter on event titles: `{ mode, terms }` where `mode` is `include` (keep only matching events) or `exclude` (drop them). Terms are case-insensitive substrings; an empty `terms` list means no filter |
| `showLegend` | string | `"off"` | A color key naming each calendar the module is showing: `off`, `header`, or `footer` |
| `eventRules` | array | — | Restyle or hide individual events by what they match. See [Event and day rules](#event-and-day-rules) below |
| `dayRules` | array | — | Tint whole days and add badges to them. See [Event and day rules](#event-and-day-rules) below |
| `dimPastEvents` | boolean | `false` | Daily view: fade events in today's column that have already ended. Deliberately different from the Full-Screen Calendar's same-named option, which fades whole past days and defaults on |
| `showNowRule` | boolean | `false` | Daily view: a thin accent rule between today's finished and upcoming events |

Configure sources in **Settings > Calendar** — see [Calendar setup](/docs/getting-started#calendar-setup). Supports multiple calendars with color-coding (native colors when using Google OAuth; manual per-feed color when using iCal URLs).

**Colored event style:** In `colored` mode, timed events drop the dot and pill and render their start time plus title in the calendar's own color — the time prefix is constant-width and zero-padded (e.g. `08:05 AM`) and follows the household **Time format** setting. All-day events render as solid calendar-color pills with white or near-black text depending on the color's brightness. Day cells list all-day events first, then timed events by start time — in both styles.

**Grid themes:** The multi-week and month views share one grid and one theme. `banner` is the original look. The three newer themes share a cleaner grid — a month heading at the top, small day numbers with a filled badge on today, a ring around today's cell, and multi-day events drawn as one connected bar — and differ in how events render: `clean` shows a short colored time next to a bold title, `minimal` drops times so full titles always fit (best at 6+ weeks or across the room), and `vivid` fills every event with its calendar color for maximum pop. In the month view the days before and after the month are dimmed; in the multi-week view the days already passed this week are dimmed and each new month is marked on its first day. Calendar modules start on `banner`; switch the theme under the View Mode picker.

### Countdown

Counts down to one or more future events with visual progress rings.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"all"` | Display mode: `all` (show all events) or `next` (show only the next upcoming event) |
| `events` | array | `[]` | List of events, each with `id`, `name`, `date`, optional `recurring` (`"yearly"`), optional `source` (`"custom"` or `"holiday"`), and optional `backgroundImage` |
| `showPastEvents` | boolean | `false` | Continue showing events after they pass |
| `stayUntilEndOfDay` | boolean | `false` | Keep an event that has reached zero on screen until the end of that day, so a birthday or anniversary stays up all day instead of vanishing at midnight |
| `scale` | number | `1` | Visual scale factor (0.5–5.2). View-independent: the same value renders the same size in every view |
| `holidayCountry` | string | — | ISO country code to auto-populate holiday countdowns (e.g. `"US"`) |
| `format` | string | `"flip"` | How the numbers render: `flip` (animated flip cards), or one of the Clock elapsed text styles: `units`, `unitsUpper`, `unitsShort`, `colon`, `words`, `wordsTitle` |
| `precision` | string | `"auto"` | Which units are shown: `auto`, `days`, `daysHours`, `daysHoursMinutes`, or `daysHoursMinutesSeconds`. `auto` shows days only when there is at least one, and always shows hours, minutes, and seconds. |

### Year Progress

Visual progress bars showing how far through the current time periods you are.

| Option | Type | Default | Description |
|---|---|---|---|
| `showYear` | boolean | `true` | Show year progress |
| `showMonth` | boolean | `true` | Show month progress |
| `showWeek` | boolean | `true` | Show week progress |
| `showDay` | boolean | `true` | Show day progress |
| `showPercentage` | boolean | `true` | Show percentage labels |
| `accentColor` | string | `"#000000"` | Accent color for progress bars and glow effects |

### Multi-Month Calendar

Displays multiple months in a vertical or horizontal layout with today highlighted.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"vertical"` | Layout direction: `vertical` or `horizontal` |
| `monthCount` | number | `3` | Number of months to display |
| `startDay` | string | `"sunday"` | First day of week: `sunday` or `monday` |
| `showWeekNumbers` | boolean | `false` | Show ISO week numbers |
| `highlightWeekends` | boolean | `true` | Dim weekend days |
| `showAdjacentDays` | boolean | `true` | Show days from adjacent months in empty cells |

### Date

A dedicated date display module with multiple visual layouts and optional metadata (week number, day of year).

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"full"` | Display style: `full`, `minimal`, `stacked`, `editorial`, or `banner` |
| `timezone` | string | `""` | IANA timezone to show (e.g. `"Asia/Tokyo"`); empty = follow the display setting |
| `dateFormat` | string | `"MMMM d"` | Date format string (date-fns format, used in minimal view) |
| `showDayName` | boolean | `true` | Show day of week name |
| `showYear` | boolean | `false` | Show year |
| `showWeekNumber` | boolean | `false` | Show week number (e.g. "Week 12") |
| `showDayOfYear` | boolean | `false` | Show day of year (e.g. "Day 75") |
| `accentColor` | string | `"#22d3ee"` | Accent color for day number and dividers |

**View details:**

- **full** — Large centered day number with month name and optional day name.
- **minimal** — Compact single-line format with custom date formatting.
- **stacked** — Vertically stacked layout with decorative divider lines.
- **editorial** — Horizontal layout with large day number on left and details on right.
- **banner** — Horizontal all-caps banner with elements separated by bullets.

---

## Weather & Environment

### Weather

Unified weather module with {% $stats.weatherViewCount %} views and {% $stats.weatherProviderCount %} provider options.

{% callout type="note" title="Set your location first" %}
Every weather view needs a latitude and longitude. Set them once in **Settings > Weather**. Without a location the module shows an error rather than a forecast.

Five providers work with no API key at all: **Open-Meteo**, **NOAA** (US only), **Yr.no**, **SMHI**, and **Environment Canada**. Four need a free key added under **Settings > API keys**: **OpenWeatherMap**, **WeatherAPI**, **Pirate Weather**, and **Met Office**.
{% /callout %}

**Views:** `current`, `hourly`, `daily`, `combined`, `compact`, `table`, `precipitation`, `alerts`

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"hourly"` | Which view to render (see list above) |
| `iconSet` | string | `"color"` | Icon style: `outline` or `color` |
| `provider` | string | `"global"` | Weather provider: `global` (use global setting), `openweathermap`, `weatherapi`, `pirateweather`, `noaa`, `open-meteo`, `yr`, `smhi`, `metoffice`, or `envcanada` |
| `hoursToShow` | number | `8` | Number of hours to display (hourly view) |
| `showFeelsLike` | boolean | `true` | Show "feels like" temperature |
| `daysToShow` | number | `5` | Number of forecast days (daily view) |
| `showHighLow` | boolean | `true` | Show high/low temperatures |
| `showPrecipitation` | boolean | `true` | Show precipitation chance |
| `showPrecipAmount` | boolean | `false` | Show precipitation amount |
| `showHumidity` | boolean | `false` | Show humidity percentage |
| `showWind` | boolean | `false` | Show wind speed |
| `showPressure` | boolean | `false` | Show barometric pressure |
| `showVisibility` | boolean | `false` | Show visibility distance |
| `showDewPoint` | boolean | `false` | Show dew point temperature |
| `hideWhenNoAlerts` | boolean | `false` | Hide the alerts view when there are no active alerts |
| `showLocation` | boolean | `false` | Show a place-name header above the view |
| `locationLabel` | string | — | Custom text for the location header. Empty falls back to the geocoded place name, then to the formatted coordinates |

**View details:**

- **current** — Large current temperature with conditions, high/low, and optional stats.
- **hourly** — Horizontal scrolling hourly forecast.
- **daily** — Multi-day forecast with high/low temperatures.
- **combined** — Current conditions with hourly and daily sections in one view.
- **compact** — Minimal current temperature and icon, fits small spaces.
- **table** — Tabular hourly data with columns for each stat.
- **precipitation** — Minute-by-minute precipitation chart for the next 60 minutes. Requires Pirate Weather provider for minutely data.
- **alerts** — Active weather alerts with severity levels. Needs a provider that publishes alerts: **Pirate Weather** or **NOAA** (US only, no API key needed). Other providers return no alerts.

### Moon Phase

Current moon phase with visual representation.

| Option | Type | Default | Description |
|---|---|---|---|
| `showIllumination` | boolean | `true` | Show illumination percentage |
| `showMoonTimes` | boolean | `true` | Show moonrise/moonset times |

Uses the `suncalc` library for calculations based on your configured latitude/longitude.

### Sunrise / Sunset

Today's sunrise and sunset times with visual arc.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"default"` | Display style: `default`, `arc`, or `circle` |
| `theme` | string | `"simple"` | Circle-view ring coloring: `simple` (flat daylight/twilight/darkness segments) or `sky` (a gradient through the day's sun colors, with stars in the full-darkness window). The `sky` theme always shows the astro-dark times. |
| `showDayLength` | boolean | `true` | Show total daylight hours |
| `showGoldenHour` | boolean | `false` | Show golden hour times |
| `showAstroDark` | boolean | `false` | Show when full darkness starts and ends, and how long it lasts (always on with the `sky` theme) |

Uses the `suncalc` library based on your configured latitude/longitude. With `showAstroDark` on, the dark times always describe tonight: darkness starting this evening paired with its end tomorrow morning. On summer nights when the sky never gets fully dark, the dark rows are simply hidden. The `circle` view draws a 24-hour ring with noon at the top and midnight at the bottom, shading daylight, twilight, and full darkness to scale. In the `circle` view, the `sky` theme replaces those flat segments with a smooth gradient from sunrise through noon and sunset into the night, dotted with stars while full darkness lasts. Under the midnight sun the ring holds its daylight color with the sun always up; through a polar night the `sky` theme turns the whole ring dark with stars all around, while `simple` keeps its twilight shading (flat twilight when the sky never gets fully dark).

### Air Quality

Air quality index and pollutant levels.

| Option | Type | Default | Description |
|---|---|---|---|
| `showAQI` | boolean | `true` | Show air quality index |
| `showPollutants` | boolean | `false` | Show individual pollutant levels (PM2.5, PM10, O3, NO2) |
| `refreshIntervalMs` | number | `300000` | Refresh interval (5 min) |

Requires an **OpenWeatherMap** API key (Settings > API keys) and a location set in **Settings > Weather**. The location is checked first, so a missing location shows an error even when the key is in place.

### Rain Map

Animated precipitation radar map powered by RainViewer. Displays past radar and near-future nowcast frames over a base map.

| Option | Type | Default | Description |
|---|---|---|---|
| `latitude` | number | `0` | Map center latitude (falls back to global setting) |
| `longitude` | number | `0` | Map center longitude (falls back to global setting) |
| `zoom` | number | `6` | Map zoom level (1–12). Radar imagery is only published up to zoom 7, so higher values sharpen the base map but stretch the radar layer |
| `animationSpeedMs` | number | `500` | Delay between animation frames |
| `extraDelayLastFrameMs` | number | `2000` | Extra pause on the last frame before looping |
| `colorScheme` | number | `2` | RainViewer color scheme ID |
| `smooth` | boolean | `true` | Smooth radar rendering |
| `showSnow` | boolean | `true` | Show snow on radar |
| `opacity` | number | `0.7` | Radar overlay opacity (0–1) |
| `showTimestamp` | boolean | `true` | Show relative timestamp label |
| `showTimeline` | boolean | `true` | Show timeline dots at the bottom |
| `refreshIntervalMs` | number | `600000` | How often to fetch new radar data (10 min) |
| `mapStyle` | string | `"dark"` | Base map style: `dark` or `standard` |

---

## News & Finance

### News Headlines

Rotating RSS feed headlines with multiple view modes.

| Option | Type | Default | Description |
|---|---|---|---|
| `feedUrl` | string | `""` | RSS feed URL |
| `view` | string | `"headline"` | Display mode: `headline`, `list`, `ticker`, or `compact` |
| `refreshIntervalMs` | number | `300000` | How often to fetch new articles (5 min) |
| `rotateIntervalMs` | number | `10000` | How often to rotate headlines (10 sec) |
| `maxItems` | number | `10` | Maximum number of items to display |
| `showTimestamp` | boolean | `false` | Show article timestamps |
| `showDescription` | boolean | `false` | Show article descriptions |
| `tickerSpeed` | number | `5` | Scroll speed for ticker view |
| `accentColor` | string | — | Accent color for list bullet indicators (optional) |

### Stock Ticker

Real-time stock prices from Yahoo Finance.

| Option | Type | Default | Description |
|---|---|---|---|
| `symbols` | string | `"AAPL,GOOGL,MSFT"` | Comma-separated stock symbols |
| `refreshIntervalMs` | number | `30000` | Refresh interval (30 sec) |
| `view` | string | `"cards"` | Display mode: `cards`, `ticker`, `table`, or `compact` |
| `cardScale` | number | `1` | Size multiplier for the cards, table, and compact views (0.5–3). The quickest way to make prices readable across a room. Not used by the ticker view |
| `showSparkline` | boolean | `true` | Draw a small trend line on each card in the cards view |
| `sparklineTheme` | string | `"classic"` | Chart look: `classic` (plain line, evenly spaced) or `shaded` (soft backdrop and tint, day chart scaled to trading hours) |
| `sparklineMode` | string | `"day"` | Which chart each card shows: `day`, `week`, or `both` (day and week side by side) |
| `sparklineLabels` | boolean | `false` | Caption each chart with its range (`1D` for today, `5D` for the past week) so the two are easy to tell apart. In the `shaded` theme the week chart is also ticked into its trading sessions |
| `tickerSpeed` | number | `5` | Scroll speed for ticker view |

Each chart is colored by its own period's move (the day chart by today's change, the week chart by the week's change) in both themes; the price-change text always shows today's change. In the `shaded` theme the day chart's width represents that symbol's full regular trading session on its own exchange (for example 9:30 to 16:00 Eastern for US stocks), so during the session the line stops at the current time and the empty part of the chart is the remaining trading time. Outside the session, or when the session bounds are not available, the points are spread evenly across the full width. The `classic` theme always spreads points evenly.

### Crypto Price

Cryptocurrency prices from CoinGecko.

| Option | Type | Default | Description |
|---|---|---|---|
| `ids` | string | `"bitcoin,ethereum"` | Comma-separated CoinGecko IDs |
| `refreshIntervalMs` | number | `30000` | Refresh interval (30 sec) |
| `view` | string | `"cards"` | Display mode: `cards`, `ticker`, `table`, or `compact` |
| `cardScale` | number | `1` | Size multiplier for the cards, table, and compact views (0.5–3). Not used by the ticker view |
| `showSparkline` | boolean | `true` | Draw a small trend line on each card in the cards view |
| `tickerSpeed` | number | `5` | Scroll speed for ticker view |

### Sports Scores

Live scores from ESPN.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"scoreboard"` | Display mode: `scoreboard`, `cards`, `list`, or `ticker` |
| `leagues` | array | `["nba", "nfl"]` | Leagues to show: `nfl`, `nba`, `mlb`, `nhl`, `wnba`, `mls`, `epl`, `laliga`, `bundesliga`, `seriea`, `ligue1`, `liga_mx` |
| `refreshIntervalMs` | number | `60000` | Refresh interval (1 min) |
| `tickerSpeed` | number | `5` | Scroll speed for ticker view |

### Sports Standings

League standings from the ESPN standings API with team logos and colors. Supports automatic rotation through division/conference groups.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"table"` | Display mode: `table`, `compact`, or `conference` |
| `league` | string | `"nba"` | League to display (see list below) |
| `grouping` | string | `"conference"` | How to group teams: `division`, `conference`, or `league` |
| `teamsToShow` | number | `0` | Limit number of teams per group (0 = show all) |
| `showPlayoffLine` | boolean | `true` | Draw a visual line below the last playoff spot |
| `rotationIntervalMs` | number | `10000` | How often to rotate between groups (10 sec) |
| `refreshIntervalMs` | number | `300000` | Data refresh interval (5 min) |

**Supported leagues ({% $stats.standingsLeagueCount %}):** NFL, NBA, MLB, NHL, WNBA, MLS, Premier League (EPL), La Liga, Bundesliga, Serie A, Ligue 1, Liga MX.

**View details:**

- **table** — Full standings table with W-L record, winning percentage, games back, streak, and more. Rotates through groups automatically.
- **compact** — Condensed single-column layout showing team logo, abbreviation, and record. Rotates through groups.
- **conference** — Side-by-side conference view showing two groups simultaneously with team rankings.

---

## Knowledge & Fun

### Dad Joke

Displays a random dad joke that refreshes periodically.

| Option | Type | Default | Description |
|---|---|---|---|
| `refreshIntervalMs` | number | `60000` | How often to fetch a new joke (1 min) |
| `accentColor` | string | `"#000000"` | Accent color for background tint and decorative elements |
| `showDividers` | boolean | `true` | Show decorative dividers |

### Quote of the Day

Daily inspirational quote from ZenQuotes.

| Option | Type | Default | Description |
|---|---|---|---|
| `refreshIntervalMs` | number | `3600000` | Refresh interval (1 hour) |
| `accentColor` | string | `"#000000"` | Accent color for decorative quotation mark, left border, and attribution divider |

### Word of the Day

Displays a vocabulary word with its part of speech and definition. Words come from a built-in list in your configured language (all seven shipped languages have their own list), and the word is picked from the date, so every display shows the same word on the same day.

| Option | Type | Default | Description |
|---|---|---|---|
| `accentColor` | string | `"#000000"` | Accent color for underline and part-of-speech tag |
| `showDividers` | boolean | `true` | Show decorative dividers between sections |

### This Day in History

Historical events that happened on today's date. Fetches from two data sources — Wikipedia "On This Day" and MuffinLabs — in parallel, deduplicates by year (preferring Wikipedia's richer text), and shuffles. Each source degrades gracefully if the other fails. Both sources return English text (the Wikipedia feed this module uses is English-only), and each contributes up to 10 events per day.

| Option | Type | Default | Description |
|---|---|---|---|
| `refreshIntervalMs` | number | `3600000` | Data refresh interval (1 hour) |
| `rotationIntervalMs` | number | `10000` | How often to rotate between events (10 sec) |
| `accentColor` | string | `"#000000"` | Accent color for years-ago badge and dividers |
| `showDividers` | boolean | `true` | Show decorative dividers |
| `sourceMuffinLabs` | boolean | `true` | Enable MuffinLabs data source |
| `sourceWikipedia` | boolean | `true` | Enable Wikipedia "On This Day" data source |

---

## Personal

### To-Do List

A checklist with completable items.

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | string | `"To Do"` | List title |
| `items` | array | `[]` | Items with `id`, `text`, and `completed` fields |
| `accentColor` | string | `"#000000"` | Accent color for checkboxes, strikethrough, and progress indicator |
| `interactive` | boolean | `false` | Render items as tap targets on the display so anyone at the kiosk can check or uncheck them. Taps are stored separately from the editor's item list, so an editor save never wipes them, and every display showing the same list stays in sync (within about 5 seconds). |

Items can be added, edited, and checked off in the editor. With `interactive` on, they can also be checked off directly on a touchscreen display.

### Todoist

Displays tasks from the Todoist API with filtering, grouping, and multiple view modes.

| Option | Type | Default | Description |
|---|---|---|---|
| `viewMode` | string | `"list"` | View mode: `list`, `board`, or `focus` |
| `groupBy` | string | `"date"` | How to group tasks: `none`, `project`, `priority`, `date`, or `label` |
| `sortBy` | string | `"default"` | Sort order: `default`, `priority`, `due_date`, or `alphabetical` |
| `projectFilter` | string | `""` | Comma-separated project names to show (empty = all) |
| `labelFilter` | string | `""` | Comma-separated label names to filter by (empty = all) |
| `showNoDueDate` | boolean | `true` | Show tasks without a due date |
| `showSubtasks` | boolean | `true` | Show subtasks indented under parents |
| `showLabels` | boolean | `true` | Show task labels |
| `showProject` | boolean | `true` | Show project name and color dot |
| `showDescription` | boolean | `false` | Show task description text |
| `maxTasks` | number | `30` | Maximum number of tasks to display |
| `refreshIntervalMs` | number | `60000` | How often to fetch tasks (1 min) |
| `allowComplete` | boolean | `false` | Show a tappable circle on each task. Tapping marks the task complete in Todoist (optimistic, with cache invalidation so the task disappears immediately). When off, the priority bar is shown instead. |
| `title` | string | `"Todoist"` | Module header title |

Requires a Todoist API token in settings. Markdown formatting in task content and descriptions (links, bold, italic, code, images) is stripped before rendering so kiosks don't show raw `[Watch](url)` syntax.

**View details:**

- **list** — Grouped task list with priority bars, due date badges, project/label metadata, and subtask nesting.
- **board** — Kanban-style columns (up to 3) grouped by the selected `groupBy` option.
- **focus** — Shows only today's and overdue tasks with a count of remaining items.

### Sticky Note

A colored note card for freeform text.

| Option | Type | Default | Description |
|---|---|---|---|
| `content` | string | `"Write something here..."` | Note text content |
| `noteColor` | string | `"#fef08a"` | Background color of the note |

### Greeting

Displays a time-aware greeting (Good morning/afternoon/evening). When weather-aware mode is enabled and location is configured, the greeting also shows a short contextual subtitle like "Rainy day ahead" or "Storm rolling in."

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | string | `"Friend"` | Name to greet (e.g. "Good morning, Bryan") |
| `accentColor` | string | `"#000000"` | Accent color for the greeting text |
| `weatherAware` | boolean | `true` | Show a contextual weather subtitle beneath the greeting. Set to `false` to keep the behavior it had before the event bus. Requires latitude/longitude configured in Settings > Weather — the editor surfaces a hint in the Greeting config section if location is missing. |

### Garbage Day

Trash and recycling collection schedule. Highlights when collection day is approaching based on your chosen trigger mode.

| Option | Type | Default | Description |
|---|---|---|---|
| `trashDay` | number | `1` | Trash collection day (0=Sun through 6=Sat, -1=disabled) |
| `trashFrequency` | string | `"weekly"` | Collection frequency: `weekly` or `biweekly` |
| `trashStartDate` | string | `""` | Anchor date for biweekly calculation (ISO date) |
| `trashColor` | string | `"#6ee7b7"` | Trash icon color |
| `recyclingDay` | number | `1` | Recycling collection day (same format as `trashDay`) |
| `recyclingFrequency` | string | `"weekly"` | Recycling frequency: `weekly` or `biweekly` |
| `recyclingStartDate` | string | `""` | Anchor date for biweekly recycling |
| `recyclingColor` | string | `"#93c5fd"` | Recycling icon color |
| `customDay` | number | `-1` | Custom collection day (-1 = disabled) |
| `customFrequency` | string | `"weekly"` | Custom frequency: `weekly` or `biweekly` |
| `customStartDate` | string | `""` | Anchor date for biweekly custom collection |
| `customColor` | string | `"#fbbf24"` | Custom icon color |
| `customLabel` | string | `"Yard Waste"` | Label for the custom collection type |
| `highlightMode` | string | `"day-before"` | When to highlight: `day-of` or `day-before` |

Supports up to 3 collection types: trash, recycling, and a customizable third type (e.g. yard waste, compost). Each type can run on its own weekly or biweekly schedule.

### Affirmations

Displays rotating positive affirmations with multiple visual styles. Time-aware selection adjusts messages based on time of day, day of week, and season. Weather-aware scoring quietly boosts entries that match the current conditions without hiding anything, so a rainy morning is more likely to surface a cozy gratitude entry and a snow day is more likely to surface a mindfulness entry tagged `snow`. The day-of-week and season rules are stricter than the weather one: an entry tagged for a specific day or season is held back entirely outside it, rather than just ranked lower.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"elegant"` | Display style: `elegant`, `card`, `minimal`, or `typewriter` |
| `categories` | array | `["affirmations", "compliments", "motivational"]` | Categories to include: `affirmations`, `compliments`, `motivational`, `gratitude`, `mindfulness` |
| `rotationIntervalMs` | number | `15000` | How often to rotate to the next affirmation (15 sec) |
| `showCategoryLabel` | boolean | `false` | Show the category label below the affirmation |
| `timeAware` | boolean | `true` | Select affirmations based on time of day, day of week, and season |
| `weatherAware` | boolean | `true` | Give entries tagged with a matching weather condition a +2 score boost. Non-matching entries are never hidden. Only takes effect while **Time-aware** is on, since the weather boost is part of the same scoring pass. Requires latitude/longitude configured in Settings > Weather — the editor surfaces a hint in the Affirmations config section if location is missing. |
| `customEntries` | array | `[]` | Custom affirmations, each with `id`, `text`, and optional `attribution` |
| `accentColor` | string | `"#a78bfa"` | Accent color for card/typewriter views |

**View details:**

- **elegant** — Large centered text with a subtle gradient backdrop.
- **card** — Rounded card with accent-colored left border.
- **minimal** — Simple text with no decoration.
- **typewriter** — Typewriter-style animation that types out each affirmation.

### Meal Planner

A meal planning module for organizing daily meals across configurable slots (breakfast, lunch, dinner, snack). Time-aware slot detection highlights the current or next meal.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"week"` | Display style: `week`, `today`, `next-meal`, `compact`, or `list` |
| `showEmoji` | boolean | `true` | Show meal emoji |
| `showPrepTime` | boolean | `true` | Show prep time in minutes |
| `showTags` | boolean | `true` | Show meal tags |
| `accentColor` | string | `"#f59e0b"` | Accent color for highlights |
| `tapRecipeAction` | string | `"off"` | What tapping a meal with a saved recipe link does: `off`, `qr` (fullscreen QR code overlay), or `iframe` (embed the recipe page) |

**Recipe links:** Meals saved with a recipe link (added from `/remote` > Meals) can open that recipe right on the display. With `qr`, tapping the meal shows a fullscreen QR code you scan with your phone; with `iframe`, the recipe page opens in an overlay on the display itself (some recipe sites block embedding — the QR option always works). In the editor preview, tapping opens the recipe in a new browser tab instead.

Enabled slots, week start day, default slot times, and 12/24h formatting are **household-level settings** edited once under `/remote` > Meals > Settings — every meal-planner module across every display picks them up from `data/meals.json` automatically. The time format defaults to the household **Time format** setting (Settings → Defaults → Location & language); pick an explicit 12- or 24-hour option in meal settings only if meals should differ from it. Meal data (saved meals and weekly plan) lives in the same file and is shared across the standard widget, fullscreen display, editor, and remote via `/api/meals/data`. The plan uses ISO date strings (e.g. `"2026-04-04"`) to support multi-week planning with week navigation. Old day-of-week configs are auto-migrated. Entries older than 12 weeks are pruned automatically.

**View details:**

- **week** — Grid showing all 7 days and meal slots at a glance with today highlighted.
- **today** — Vertical stack of slot cards for today with active slot highlighted.
- **next-meal** — Large display of the next upcoming meal with context label (Now/Coming Up/Tomorrow).
- **compact** — Two-column layout showing Today and Tomorrow side-by-side.
- **list** — Full week listed vertically with day headers, showing only days with meals.

### Chore Chart

A chore tracking module for families or housemates. Assign chores to members with tickets, streaks, rotation schedules, and multiple visual layouts. Includes a **rewards system** where members earn tickets from completed chores and can redeem them for parent-defined rewards (managed via the remote's Chores tab).

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"board"` | Display style: `board`, `star-chart`, `today`, `progress`, or `compact` |
| `weekStartDay` | string | `"monday"` | First day of week: `sunday` or `monday` |
| `showPoints` | boolean | `true` | Show ticket values for chores |
| `showStreaks` | boolean | `true` | Show completion streaks |
| `showTimeOfDay` | boolean | `true` | Show time-of-day labels (morning, afternoon, evening) |
| `allowDisplayComplete` | boolean | `true` | Allow marking chores complete from the display view |
| `accentColor` | string | `"#f59e0b"` | Accent color for highlights |

**Members and chores are shared household data**, not module options. They live in `data/chores.json` and are edited from the editor's **Edit chore chart** button or from `/remote` > Chores, so every chore module on every display shows the same people and the same list. Each member has an `id`, `name`, `emoji`, and `color`. Each chore has an `id`, `name`, `emoji`, `points`, `frequency` (`daily`, `weekly`, `biweekly`, or `once`), `daysOfWeek`, `timeOfDay`, `specificDate` (YYYY-MM-DD, required when `frequency` is `once`), `assigneeIds`, `rotation`, and, when `rotation` is `schedule`, a `schedule` map of member ID to days-of-week.

**View details:**

- **board** — Kanban-style board grouping chores by status or member.
- **star-chart** — Kid-friendly star chart showing earned tickets per member.
- **today** — Today's chores only, grouped by time of day.
- **progress** — Progress bars showing completion rates per member.
- **compact** — Condensed view for small module sizes.

**Rotation modes:**

Each chore has a `rotation` field that controls how the `assigneeIds` list is resolved each day.

- **fixed** — Everyone in `assigneeIds` is responsible for the chore every time it appears. Use this for chores a single person always owns.
- **rotate-daily** — Cycles through `assigneeIds` one day at a time, so Alice handles it today, Bob handles it tomorrow, and so on.
- **rotate-weekly** — Same as daily rotation but the handoff happens at the start of each week.
- **schedule** — Per-day assignment via a `schedule` map of `memberId → number[]` (days-of-week, 0 = Sunday through 6 = Saturday). Lets you say "Alice on Mon/Wed, Bob on Tue/Thu, everyone on Fri–Sun" without creating separate chores. The editor and the remote both render a weekly grid UI for editing the schedule, and any day not covered by the schedule simply has no one assigned. A chore in schedule mode also shows a small **(schedule)** label in the board when resolved to a single assignee, so you can tell it apart from a fixed one-person chore at a glance.

Chore ticket values can be any non-negative integer — `0` is allowed and is useful for tracking routines that do not earn rewards.

---

## Media & Display

### Text

Rich text block with multiple display modes, effects, and styling options.

**Content and layout**

| Option | Type | Default | Description |
|---|---|---|---|
| `content` | string | `"Hello, World!"` | Text content (supports markdown when enabled) |
| `alignment` | string | `"center"` | Text alignment: `left`, `center`, or `right` |
| `orientation` | string | `"horizontal"` | Text direction: `horizontal`, `vertical`, or `sideways` |
| `verticalAlign` | string | `"center"` | Vertical alignment: `top`, `center`, or `bottom` |
| `markdown` | boolean | `false` | Enable markdown rendering |
| `autoFit` | boolean | `false` | Auto-fit text size to fill the container |
| `icon` | string | `""` | Icon prefix (emoji or short text shown before content) |
| `maxWidth` | number | `0` | Maximum text width in pixels (0 = no limit) |
| `wrapMode` | string | `"normal"` | Line-wrapping style: `normal`, `nowrap`, `balance` (even line lengths), or `pretty` (avoids lonely last words) |

**Typography**

| Option | Type | Default | Description |
|---|---|---|---|
| `fontFamily` | string | — | Font registry id overriding the module's Style font (see [Module Styling](#module-styling) for the list). Unset = use the Style font |
| `italic` | boolean | `false` | Italicize the text |
| `lineHeight` | number | `1.2` | Line height as a multiple of the font size |
| `letterSpacing` | number | `0` | Letter spacing in pixels |
| `wordSpacing` | number | `0` | Word spacing in pixels |
| `textTransform` | string | `"none"` | Text transform: `none`, `uppercase`, `lowercase`, or `capitalize` |
| `textDecoration` | string | `"none"` | Line decoration: `none`, `underline`, `overline`, or `line-through` |
| `textDecorationColor` | string | `"#ffffff"` | Color of that line |
| `textDecorationThickness` | number | `2` | Thickness of that line in pixels |

**Effects**

| Option | Type | Default | Description |
|---|---|---|---|
| `effect` | string | `"none"` | Text effect: `none`, `typewriter`, `fade-in`, `gradient-sweep`, `glow`, `outline`, `shadow`, `3d`, `neon`, `wave`, `bounce`, `shake`, or `color-cycle` |
| `animationSpeed` | number | `2` | Seconds per cycle for the animated effects |
| `outlineWidth` | number | `2` | Stroke width in pixels (outline effect) |
| `outlineColor` | string | `"#000000"` | Stroke color (outline effect) |
| `shadowOffsetX` | number | `2` | Horizontal shadow offset in pixels (shadow effect) |
| `shadowOffsetY` | number | `2` | Vertical shadow offset in pixels (shadow effect) |
| `shadowBlur` | number | `4` | Shadow blur radius in pixels (shadow effect) |
| `shadowColor` | string | `"rgba(0,0,0,0.5)"` | Shadow color (shadow effect) |
| `colorCyclePalette` | array | 6 preset colors | Colors the `color-cycle` effect cycles through |
| `gradientEnabled` | boolean | `false` | Enable gradient text coloring |
| `gradientFrom` | string | `"#a78bfa"` | Gradient start color |
| `gradientTo` | string | `"#22d3ee"` | Gradient end color |
| `gradientAngle` | number | `90` | Gradient angle in degrees |

**Rotation and scrolling**

| Option | Type | Default | Description |
|---|---|---|---|
| `rotationEnabled` | boolean | `false` | Rotate through content split by separator |
| `rotationIntervalMs` | number | `5000` | Rotation interval in milliseconds |
| `rotationSeparator` | string | `"---"` | Separator string for splitting content into rotation items |
| `revealOnRotation` | string | `"none"` | How each new item appears: `none`, `fade`, `slide-up`, `slide-down`, or `zoom`. Only used while rotation is on |
| `marquee` | boolean | `false` | Enable marquee (scrolling) text |
| `marqueeSpeed` | number | `30` | Seconds for one full scroll pass (5–120). Higher is slower |
| `marqueeDirection` | string | `"left"` | Marquee direction: `left`, `right`, `up`, or `down` |

**Decoration**

| Option | Type | Default | Description |
|---|---|---|---|
| `dropCap` | boolean | `false` | Enlarge the first letter as a drop cap |
| `dropCapColor` | string | — | Drop cap color (falls back to `accentColor`, then the text color) |
| `textBackground` | string | — | Color drawn directly behind the glyphs, separate from the module's own background |
| `textBackgroundPadding` | number | `4` | Padding around that background in pixels |
| `textBackgroundRadius` | number | `4` | Corner rounding of that background in pixels |
| `showDividers` | boolean | `false` | Show decorative divider lines above and below the text |
| `accentColor` | string | `"#ffffff"` | Color for the dividers and the typewriter cursor |
| `templateVariables` | boolean | `false` | Enable dynamic variables like `{{time}}` and `{{date}}` (see below) |

**Text effects:**
- **typewriter** — Types out the text character by character
- **fade-in** — Fades the text in smoothly
- **gradient-sweep** — Animated gradient sweep across the text
- **glow** — Pulsing glow effect
- **outline** — Hollow, stroked letters
- **shadow** — Offset drop shadow behind the letters
- **3d** — Layered letters for a raised, extruded look
- **neon** — Neon-tube style glow with a bright core
- **wave** — Letters ripple up and down one after another
- **bounce** — Letters bounce in sequence
- **shake** — Letters jitter in place
- **color-cycle** — Letters cycle through `colorCyclePalette`

**Template variables:** When enabled, seven placeholders are replaced with live data: `{{time}}` (24-hour), `{{time12}}` (12-hour), `{{date}}`, `{{day}}` (weekday name), `{{month}}`, `{{year}}`, and `{{greeting}}`. Anything else stays on screen exactly as typed, so watch the spelling: it is `{{day}}`, not `{{dayOfWeek}}`. The greeting words are currently English only.

**Shared-state tokens:** Single-brace `{<key>}` (separate from the double-brace template variables above) inserts a live value published by an add-on, e.g. `{plugin:ha:sensor.temp}`. Add a filter after a `|` to format it: `|round:1` rounds a numeric value to a set number of decimal places, and `|default:TEXT` supplies placeholder text for a key that hasn't published a value yet — e.g. `{plugin:ha:sensor.temp|round:1|default:n/a}`. Unknown keys render as an en dash with no filter.

**Content rotation:** Split content by a separator (default `---`) and rotate through the chunks at a set interval — useful for rotating quotes, tips, or announcements.

### Image

Displays a static image.

| Option | Type | Default | Description |
|---|---|---|---|
| `src` | string | `""` | Image URL or path |
| `objectFit` | string | `"cover"` | How the image fills the container: `cover`, `contain`, or `fill` |
| `alt` | string | `""` | Alt text |

### Video

Plays a video clip — a file from your media library, a direct video URL, or a YouTube link. In the editor the module shows a still frame with a play badge; the video only plays on the actual display.

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | string | `"file"` | Where the video comes from: `file` (media library) or `url` (direct link or YouTube) |
| `file` | string | — | Path to a video in the media library (file source) |
| `url` | string | — | Direct link to an MP4/WebM video, or any YouTube link (url source) |
| `objectFit` | string | `"cover"` | How the video fills the container: `cover`, `contain`, or `fill` |
| `muted` | boolean | `true` | Keep the video silent. Turning sound on also needs the display's autoplay setting (see below) |
| `loop` | boolean | `true` | Start the video over when it ends |
| `maxDurationMs` | number | — | Stop playing after this many milliseconds (0 or unset = keep playing) |

{% callout type="note" title="Best format for Raspberry Pi" %}
MP4 videos with H.264 encoding play smoothly on Raspberry Pi hardware. iPhone recordings (`.mov` files with HEVC) may not play on a Pi 4 — if a clip shows a black box, convert it to MP4 (H.264) first. If a video fails to load or stalls, playback stops cleanly instead of freezing the screen, and in a photo slideshow the show advances to the next slide.
{% /callout %}

**Sound:** Videos are silent by default. To play sound, turn on the module's sound toggle. Sound also needs a setting on the display itself, which every install and upgrade turns on automatically. If sound stays off on an older Pi, re-run the upgrade.

**YouTube links:** Paste any YouTube link (`youtube.com/watch`, `youtu.be`, or a Short) into the URL field and the module plays it with YouTube's own player — autoplaying, without on-screen controls, using the privacy-friendly no-cookie player. The sound and repeat toggles work; the time limit doesn't apply (YouTube controls its own playback). Needs internet access on the display, and the video must allow embedding.

### Photo Slideshow

Rotates through images from a local directory, an Immich photo library, a OneDrive folder, or an iCloud shared album. Can mix in videos from the same source — videos play muted, advance to the next slide when they finish, and use a hard cut instead of a crossfade. Google Photos works too, as an import: the **Import from Google Photos** button under the folder picker downloads photos you choose into your library — see [Google Photos](/docs/backgrounds#google-photos).

| Option | Type | Default | Description |
|---|---|---|---|
| `directory` | string | `""` | Directory name inside `public/backgrounds/` |
| `intervalMs` | number | `30000` | Time between transitions (30 sec) |
| `transition` | string | `"fade"` | Transition effect: `fade` or `none` |
| `objectFit` | string | `"cover"` | Image fit mode |
| `refreshIntervalMs` | number | `600000` | How often to re-scan the directory for new images (10 min) |
| `source` | string | `"local"` | Photo source: `local`, `immich` (requires keys in Settings > API keys), `onedrive` (a one-time Microsoft sign-in), or `icloud` (a public shared album — no keys needed) |
| `immichAlbumId` | string | — | Filter to a specific Immich album |
| `immichPersonId` | string | — | Filter to a recognized person (face) in Immich |
| `immichFavoritesOnly` | boolean | `false` | Only show photos marked as favorites in Immich |
| `immichCount` | number | `50` | Number of photos to load per refresh (10–200) |
| `icloudAlbumUrl` | string | — | iCloud shared album link (`icloud.com/sharedalbum/#TOKEN`) or bare token (iCloud source) |
| `onedriveFolderId` | string | — | OneDrive folder to pull photos from (OneDrive source) |
| `onedriveFolderName` | string | — | Folder name as shown in the editor — display only, the ID above is authoritative |
| `onedriveCount` | number | `50` | Number of photos to load per refresh (10–200) |
| `mediaTypes` | string | `"photos"` | What to show: `photos`, `videos`, or `both` |
| `maxVideoDurationMs` | number | `60000` | Longest a video slide can play before moving on (60 sec) |

When using Immich as the source, the editor shows a connection status indicator, album and person dropdowns, a favorites toggle, a photo count slider, and a live preview strip of 4 photos matching the current filters. Album and person filters are mutually exclusive.

When using iCloud as the source, paste a public shared album link from the Photos app (**Share > Copy iCloud Link** on a shared album). No Apple account or API key is needed — the display loads photos straight from Apple's servers. The album must have a public website link enabled.

When using OneDrive as the source, the module signs in to your Microsoft account once with a short code, and then you pick a folder. That folder's photos feed the slideshow, subfolders included. The full walkthrough is in [OneDrive photos](/docs/modules#one-drive-photos). Photos shuffle on every refresh; very large folders use a random sample of 1,000 photos.

**Mixing in videos:** Set **Show** to *Photos + videos* (or *Videos only*) to include video clips. Photos advance on the slide interval; videos play to the end (or the video time limit) and then advance. Videos in slideshows are always silent. Immich mixed albums work out of the box; local videos are any MP4/WebM/MOV files in the same backgrounds folder.

### QR Code

Generates a QR code from any text, URL, or WiFi network credentials.

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | string | `"custom"` | QR code mode: `custom` (arbitrary data) or `wifi` (WiFi network) |
| `data` | string | `""` | Content to encode (custom mode) |
| `label` | string | `""` | Label text below the code (custom mode) |
| `ssid` | string | `""` | WiFi network name (wifi mode) |
| `password` | string | `""` | WiFi password (wifi mode) |
| `authType` | string | `"WPA"` | WiFi authentication type: `WPA`, `WEP`, or `nopass` (wifi mode) |
| `hiddenNetwork` | boolean | `false` | Whether the WiFi network is hidden (wifi mode) |
| `showPassword` | boolean | `true` | Show the password below the QR code (wifi mode) |
| `showNetworkName` | boolean | `true` | Show the network name below the QR code (wifi mode) |
| `fgColor` | string | `"#ffffff"` | Foreground color |
| `bgColor` | string | `"transparent"` | Background color |

### Web Embed (iFrame)

Embeds any web page or dashboard. Acts as a universal adapter for Home Assistant, Grafana, Google Sheets, Notion, and any embeddable web content.

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | string | `""` | URL of the page to embed |
| `title` | string | `""` | Accessibility title for the iframe |
| `refreshIntervalMs` | number | `0` | Auto-refresh interval in ms (0 = off) |
| `scrollable` | boolean | `false` | Allow scrolling within the embedded page |
| `sandboxEnabled` | boolean | `false` | Apply sandbox restrictions to the iframe |
| `sandbox` | string | `"allow-scripts allow-forms allow-popups"` | Sandbox permission tokens (when enabled) |

**About the sandbox list:** what you type is checked before it is applied. Only the 13 standard sandbox tokens are recognized and anything else is ignored. `allow-same-origin` is also dropped whenever `allow-scripts` is set, because that pair lets an embedded page step outside its own sandbox, so if a self-hosted dashboard needs same-origin access, turn the sandbox off entirely rather than combining the two. Only `http` and `https` addresses can be embedded; anything else shows an error in place of the page.

**Note:** Some websites (e.g. YouTube, Yahoo Finance, Twitter) set `frame-ancestors` or `X-Frame-Options` headers that prevent embedding. Self-hosted services, published Google Docs/Sheets, and sites that explicitly support embedding will work.

**Embedding video pages:** Pages that host a video player (a YouTube *embed* URL, a self-hosted stream page) can be shown through this module too. If the player doesn't start with sandbox enabled, the default sandbox permissions (`allow-scripts allow-forms allow-popups`) may need adjusting for that player — or turn the sandbox off. For plain video files, the dedicated **Video** module is simpler.

### Icon

A single Font Awesome 7 glyph rendered at any size with color, rotation, flip, and optional animation. Useful as a visual accent or status badge alongside other modules. Picker covers the full Free Font Awesome set (solid, regular, brands).

| Option | Type | Default | Description |
|---|---|---|---|
| `iconName` | string | `"star"` | Icon name without the `fa-` prefix (e.g. `"house"`, `"cloud-sun"`, `"github"`). A full class string with spaces is used verbatim and ignores `style` |
| `style` | `'solid' \| 'regular' \| 'brands'` | `"solid"` | Free Font Awesome style. `solid` covers most icons; `brands` is required for logos like GitHub or Slack |
| `color` | string | `"#fbbf24"` | Icon glyph color (CSS color) |
| `iconBackground` | string | `"transparent"` | Background tint behind the glyph, separate from the module wrapper background |
| `rotation` | `0 \| 90 \| 180 \| 270` | `0` | Rotate the icon in 90° increments |
| `flip` | `'none' \| 'horizontal' \| 'vertical' \| 'both'` | `"none"` | Mirror the icon |
| `animation` | string | `"none"` | One of `none`, `spin`, `spin-pulse`, `spin-reverse`, `beat`, `fade`, `beat-fade`, `bounce`, `shake`, `flip` |
| `animationDuration` | number | `2` | Animation cycle length in seconds (Font Awesome `--fa-animation-duration`) |
| `scale` | number | `0.7` | Glyph size as a fraction of the smaller container dimension (`cqmin`). Ignored when `autoFit` is true |
| `autoFit` | boolean | `true` | When true, locks `scale` to `0.85` so the glyph has a comfortable margin on all sides |

**Note:** `style: 'regular'` only renders icons that ship in the regular outline set. If a chosen icon is not in the regular set the codepoint falls back to text — keep `style: 'solid'` unless you've confirmed the icon ships in `fa-regular-400`.

### Shape & Divider

Decorative shapes and dividers for layout polish — the visual equivalent of a horizontal rule, a callout frame, or a star sticker. The `view` field switches between {% $stats.shapeViewCount %} distinct renderers; most options apply only to a subset of views (line variants vs. geometric vs. atmospheric vs. frame).

**Views:** `divider`, `double-line`, `wave`, `zigzag`, `dotted-row`, `rectangle`, `circle`, `triangle`, `polygon`, `star`, `arrow`, `glow`, `gradient`, `grid`, `frame`

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"divider"` | Which shape to render (see list above) |
| `fillMode` | `'solid' \| 'gradient'` | `"solid"` | Use a flat color or a linear gradient between `gradientFrom` and `gradientTo` |
| `color` | string | `"#ffffff"` | Solid fill color |
| `gradientFrom` | string | `"#a78bfa"` | Gradient start color (used when `fillMode = "gradient"`) |
| `gradientTo` | string | `"#22d3ee"` | Gradient end color |
| `gradientAngle` | number | `90` | Gradient angle in degrees |
| `orientation` | `'horizontal' \| 'vertical' \| 'diagonal'` | `"horizontal"` | Direction for line views (divider, double-line, wave, zigzag, dotted-row) |
| `thickness` | number | `2` | Line thickness in px (line views) |
| `lineStyle` | `'solid' \| 'dashed' \| 'dotted'` | `"solid"` | Stroke pattern for the divider line |
| `endStyle` | `'flat' \| 'fade' \| 'rounded'` | `"fade"` | Edge treatment: flat ends, fade-to-transparent, or rounded caps |
| `waveAmplitude` | number | `18` | Wave/zigzag amplitude as % of viewBox height (0–50) |
| `waveFrequency` | number | `4` | Number of full wave/zigzag cycles across the width |
| `dotCount` | number | `5` | Number of dots in the `dotted-row` view |
| `dotSize` | number | `4` | Dot radius in px for `dotted-row` |
| `doubleLineGap` | number | `6` | Pixel gap between the two parallel lines in `double-line` view |
| `outline` | boolean | `false` | Render geometric shapes as outlines instead of filled |
| `strokeWidth` | number | `2` | Outline stroke width in px |
| `cornerRadius` | number | `12` | Corner radius in px for `rectangle` |
| `sides` | number | `6` | Polygon side count (3–12) |
| `starPoints` | number | `5` | Star point count (3–12) |
| `starInnerRatio` | number | `0.4` | Star inner-to-outer radius ratio (0.2–0.8). Lower = pointier |
| `rotation` | number | `0` | Rotation in degrees applied to geometric shapes |
| `arrowDirection` | `'up' \| 'right' \| 'down' \| 'left'` | `"right"` | Arrow head direction |
| `arrowHeadRatio` | number | `0.35` | Arrow head length as ratio of total length (0.1–0.6) |
| `softness` | number | `0.55` | Glow gradient falloff (0 = hard edge, 1 = soft edge) |
| `intensity` | number | `0.55` | Glow center max alpha (0–1) |
| `gridPattern` | `'dots' \| 'lines' \| 'cross'` | `"dots"` | Pattern used by the `grid` view |
| `gridSpacing` | number | `24` | Grid spacing in px |
| `gridDotSize` | number | `2` | Grid dot/line thickness in px |
| `frameStyle` | `'rectangle' \| 'brackets'` | `"rectangle"` | Frame border style |
| `bracketLength` | number | `25` | Bracket length as % of side length (5–50) when `frameStyle = "brackets"` |

**Sizing:** Default size is 400×80, which gives a comfortable touch/grab target on the editor canvas. The visible glyph (e.g. a 2-px divider line) renders inside that box — the wrapper provides hit area, the line stays thin.

### Display Control

Touch-friendly on-screen controls for putting a display to sleep, advancing screens, and adjusting brightness. To wake a sleeping display, touch the screen or use `/remote`. Dispatches the same commands used by `/remote` — useful for bedside or hallway touchscreens where you want a physical control surface without pulling up a phone.

| Option | Type | Default | Description |
|---|---|---|---|
| `layout` | `'bar' \| 'pad' \| 'panel'` | `'panel'` | Control layout — `bar` is a compact strip, `pad` a grid of large buttons, `panel` a full surface with inline brightness |
| `defaultTarget` | `'self' \| 'all' \| <displayId>` | `'self'` | Which display the buttons control. `self` resolves to the display the module is rendered on |
| `allowRetargeting` | boolean | `true` | Show a target picker so users can retarget at runtime (hidden in single-display mode) |

**Behavior:** Sleep requires a 1-second hold to confirm; prev/next buttons are debounced at 200ms to collapse rapid taps. Brightness commits on pointer release so dragging the slider doesn't spam the hub.

`defaultTarget` is resolved when the module mounts. A display id that doesn't match anything in the registry **silently falls back to `self`** — there's no error, so a typo here looks like the buttons are controlling the wrong screen rather than a broken setting.

---

## Travel

### Traffic / Commute

Shows estimated travel times for configured routes.

| Option | Type | Default | Description |
|---|---|---|---|
| `routes` | array | `[]` | Routes, each with `label`, `origin`, and `destination` |
| `refreshIntervalMs` | number | `300000` | Refresh interval (5 min) |

Supports Google Routes API or TomTom as providers. Origins and destinations are address strings.

{% callout type="warning" title="Requires an API key" %}
Add either a **Google Maps** key or a **TomTom** key under **Settings > API keys**. Google is used when both are present.

Without a key the module still shows travel times, but they are randomly generated placeholders rather than real ones. The response is marked `mock: true` if you ever need to confirm which you are looking at.

With TomTom, each origin and destination address is looked up on a map first, so addresses need to be specific enough to find.
{% /callout %}

---

## Event and day rules

The **Calendar** and **Full-Screen Calendar** modules share two small rules engines that change how the calendar looks without touching the events themselves. Both are off until you add a rule, and both are edited under the module's settings in the editor.

**Event rules** (`eventRules`) restyle or hide individual events. Each rule is a match plus the changes to apply:

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable identifier for the rule |
| `match` | object | What the rule applies to (see below) |
| `hide` | boolean | Drop matching events from the view entirely |
| `color` | string | Replace the calendar's color for these events |
| `opacity` | number | 0.1–1, multiplied with whatever fade the view already applies |
| `icon` | string | An emoji or short string shown in place of the color dot |
| `title` | string | Replace the displayed title |

**Day rules** (`dayRules`) tint whole days and add badges to them, on the views that draw days as cells or columns:

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable identifier for the rule |
| `match` | object | Which days the rule applies to (see below) |
| `background` | string | A color, or `auto` to tint the day from its own events' colors |
| `opacity` | number | 0.1–1, applied to the day |
| `borderColor` | string | Outline color for the day |
| `badgeIcon`, `badgeText`, `badgeColor` | string | A small marker drawn on the day |

**Matching an event** — every field you set has to hold (they combine with AND), and a rule with an empty match applies to everything:

| Field | Type | Description |
|---|---|---|
| `text` | string | Matched against the title, case-insensitively |
| `textMatch` | string | How `text` is compared: `contains` (default), `exact`, or `regex` |
| `sourceIds` | array | Any of these calendar sources (a Google calendar id, an iCal or iCloud source id, or `holidays`) |
| `location` | string | Case-insensitive substring of the event's location |
| `allDay` | boolean | All-day events only, or timed events only |
| `past` | boolean | `true` = already finished, `false` = upcoming or running now |
| `kind` | string | `birthday`, `holiday`, or `event` |

**Matching a day** uses the same idea:

| Field | Type | Description |
|---|---|---|
| `when` | string | `today`, `past`, or `future` |
| `daysOfWeek` | array | Day numbers where 0 is Sunday; empty or unset means every day |
| `withEvents` | string | `any` (at least one event), `none` (an empty day), or `matching` (has an event matching `eventMatch`) |
| `eventMatch` | object | An event match, used when `withEvents` is `matching` |

Rules run from the top of the list down, and **the first rule to set a property wins for that property** — so list order is priority, and a later rule can still fill in something an earlier one left alone.


## Module Styling

Every module supports these style properties, configurable in the Property Panel:

| Property | Type | Default | Description |
|---|---|---|---|
| `opacity` | number | `1` | Module opacity (0–1) |
| `borderRadius` | number | `12` | Corner rounding in pixels |
| `padding` | number | `16` | Inner padding in pixels |
| `backgroundColor` | string | `"rgba(0, 0, 0, 0.4)"` | Background color |
| `textColor` | string | `"#ffffff"` | Text color |
| `fontFamily` | string | `"inter"` | Font id from the built-in font list: `inter`, `roboto`, `poppins`, `system-ui`, `playfair`, `lora`, `dm-serif`, `georgia`, `jetbrains`, `mono`, `bebas`, `caveat`, `pacifico`. Raw CSS font stacks saved by older versions still work |
| `fontSize` | number | `16` | Base font size in pixels |
| `fontWeight` | number | — | Forces every piece of the module's text to one weight (100–900). Unset = each module keeps its own designed weights. Not available for plugin modules |
| `backdropBlur` | number | `12` | Backdrop blur in pixels |
| `borderWidth` | number | `1` | Border width in pixels |
| `borderColor` | string | `"rgba(255, 255, 255, 0.15)"` | Border color |
| `shadowSize` | number | `8` | Box shadow size in pixels |

These are the values a newly added module starts with. A few modules override some of them on add: the four full-screen modules plus **Shape & Divider** and **Icon** start transparent with no padding, blur, border, or shadow; **Video** and **Web Embed** start with no padding; and **Multi-Month Calendar** and **Chore Chart** start at a larger base font size.

## Settings every module shares

Alongside the options above, every module on a screen carries four instance settings that decide *whether* it renders: an on/off switch, a day-and-time schedule, conditional visibility driven by live values published by add-ons, and a background-provider flag that keeps a module's data loop running while other screens are showing. See the [Configuration reference](/docs/configuration#module-instance) for their exact shape, and the [Editor guide](/docs/editor) for how to set them.
