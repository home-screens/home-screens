---
title: Module Reference
nextjs:
  metadata:
    title: Module Reference
    description: Every configuration option for all 42 built-in Home Screens modules — clocks, weather, calendars, sports, news, chore charts, meal planners, and more.
    alternates:
      canonical: /docs/module-reference
---

Exhaustive per-module option tables for every built-in module. If you're new to the module system, start with the [Modules guide](/docs/modules) — this page assumes you already know which module you want and are looking for the exact field names.

Home Screens includes {% $stats.moduleCount %} built-in modules organized into {% $stats.categoryCount %} categories. Each module can be dragged onto the canvas from the module palette in the editor.

One of those categories, **Health & Fitness**, has no built-in modules yet. It is reserved for add-ons such as Strava and Garmin, stays hidden in the module palette until you install one, and so has no section below.

Where a module has a `refreshIntervalMs` option, its default comes from that module's fetch cache lifetime rather than a value written into the module itself, so it stays in step with how long the server caches the same data. The numbers below are the current defaults; you can always override them per module.

## Full Screen

These modules are designed to fill the entire display as ambient, always-on screens. They use the `fillsCanvas` flag — position, size, and style controls are hidden in the editor since the module always occupies the full display area.

**Themes:** all four full-screen modules share one `theme` field with six color palettes: `linen`, `paper`, and `mist` (light), `charcoal`, `midnight`, and `slate` (dark). Leave `theme` unset to inherit the display-wide default from **Settings > Screen** (`fullscreenTheme`). Anything that isn't one of the six ids falls back to Linen.

The older `darkMode` boolean on Full-Screen Calendar and Full-Screen Chore Chart has been superseded by `theme` and is no longer shown in the editor. It still works as a fallback so older configurations keep rendering: `darkMode: true` maps to `charcoal` and `false` maps to `linen`. It is ignored entirely whenever `theme` is set.

### Full-Screen Calendar

A fullscreen ambient calendar display inspired by Skylight, designed to fill the entire screen. Automatically sizes to the display dimensions and pins to position (0,0). Pulls from any iCal feed, Google Calendar (via iCal URL or OAuth), or iCloud (app-specific password) — see [Calendar setup](/docs/getting-started#calendar-setup).

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"schedule"` | Display style: `schedule`, `week-list`, `month-grid`, `day-timeline`, or `agenda` |
| `density` | string | `"cozy"` | Layout density: `cozy` or `snug` |
| `typographySize` | string | `"medium"` | Text size: `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` |
| `accentColor` | string | `"#EA580C"` | Accent color for event indicators and highlights |
| `dimPastEvents` | boolean | `true` | Reduce opacity of past events |
| `shadeWeekends` | boolean | `true` | Subtle background tint on weekend columns/rows |
| `showWeather` | boolean | `true` | Show weather data alongside calendar events |
| `showNowLine` | boolean | `true` | Show a line indicating the current time |
| `sourceFilter` | array | — | Calendar source IDs to display (empty = all) |
| `theme` | string | — | Color palette: `linen`, `paper`, `mist` (light) or `charcoal`, `midnight`, `slate` (dark). Unset = inherit the display default from Settings > Screen |
| `darkMode` | boolean | `false` | Superseded by `theme` (see above). Kept so older configurations still render |
| `todayHighlightStyle` | string | `"full"` | How strongly today is highlighted: `full` (accent-tinted fill), `subtle` (faint background), `minimal` (marker only), or `off` |
| `eventOverlap` | string | `"columns"` | How overlapping events are laid out in schedule and day timeline views: `columns` (side-by-side, with a "+N" indicator when events don't fit) or `stacked` (cascading overlap) |
| `wrapEventTitles` | boolean | `false` | Wrap long event titles onto a second line in schedule and month views instead of truncating |
| `scheduleDaysToShow` | number | `0` | Days visible in schedule view (1–7, 0 = auto) |
| `scheduleHourStart` | number | `6` | Schedule view start hour (0–23) |
| `scheduleHourEnd` | number | `22` | Schedule view end hour (1–24) |
| `scheduleShowDescription` | boolean | `false` | Show the event description under the title in schedule view |
| `weekCollapsePastDays` | boolean | `true` | Collapse past days in week list view |
| `weekShowDescription` | boolean | `false` | Show the event description under the title in week list view |
| `monthShowWeekNumbers` | boolean | `false` | Show week numbers in month grid view |
| `monthMaxEventsPerCell` | number | `0` | Max events per cell in month grid (0 = auto) |
| `dayHourStart` | number | `6` | Day timeline view start hour |
| `dayHourEnd` | number | `22` | Day timeline view end hour |
| `dayShowLocation` | boolean | `true` | Show event locations in day timeline view |
| `dayShowDescription` | boolean | `false` | Show the event description under the title in day timeline view |
| `agendaDaysAhead` | number | `14` | Days ahead to show in agenda view (7–30) |
| `agendaHideEmptyDays` | boolean | `false` | Hide days with no events in agenda view |
| `agendaShowDescription` | boolean | `false` | Show the event description under the title in agenda view |

In the schedule and day timeline views, descriptions only draw when the event block is tall enough to fit them, so short events show the title alone even with the toggle on.

**View details:**

- **schedule** — Multi-day time grid with events positioned by start/end time. Shows a "now" line and supports configurable hour range.
- **week-list** — Day-by-day vertical list of the current week's events with collapsible past days.
- **month-grid** — Traditional month calendar grid with event dots/names in each cell and today highlighted.
- **day-timeline** — Single-day vertical timeline with event blocks, location details, and hour markers.
- **agenda** — Scrollable list of upcoming events across multiple days, grouped by date.

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
| `theme` | string | — | Color palette: `linen`, `paper`, `mist` (light) or `charcoal`, `midnight`, `slate` (dark). Unset = inherit the display default from Settings > Screen |
| `darkMode` | boolean | `true` | Superseded by `theme` (see above). Kept so older configurations still render |
| `density` | string | `"cozy"` | Layout density: `cozy` or `snug` |
| `typographySize` | string | `"medium"` | Text size: `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` |
| `accentColor` | string | `"#f59e0b"` | Accent color for highlights and active time-of-day |

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
| `accentColor` | string | `"#f59e0b"` | Accent color for highlights |
| `showPrepTime` | boolean | `true` | Show prep time in minutes |
| `showTags` | boolean | `true` | Show meal tags |
| `showEmoji` | boolean | `true` | Show meal emoji |
| `showDifficulty` | boolean | `false` | Show difficulty indicator |
| `theme` | string | — | Color palette: `linen`, `paper`, `mist` (light) or `charcoal`, `midnight`, `slate` (dark). Unset = inherit the display default from Settings > Screen |
| `tapRecipeAction` | string | `"off"` | What tapping a meal with a saved recipe link does: `off`, `qr` (fullscreen QR code overlay), or `iframe` (embed the recipe page) |

Enabled slots, week start day, default slot times, and 12/24h formatting are **household-level settings** stored in `data/meals.json` — edit them once under `/remote` > Meals > Settings and every meal-planner module on every display picks up the change.

**View details:**

- **week** — Full 7-day grid with meal cards organized by slot, today highlighted.
- **today** — Focused view of today's meals with large cards and details.
- **menu-board** — Restaurant-style board layout for displaying the week's menu.
- **next-meal** — Large display of the next upcoming meal with context label.

### Full-Screen Photo Viewer

A fullscreen digital photo frame that cycles through photos from a local directory, an Immich library, or an iCloud shared album, **or displays a single pinned photo** as a static wallpaper. Supports transitions, shuffle, and an optional clock overlay, and can mix in videos from the same source.

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
| `source` | string | `"local"` | Photo source: `local`, `immich` (requires keys in Settings > API keys), or `icloud` (a public shared album — no keys needed) |
| `immichAlbumId` | string | — | Filter to a specific Immich album |
| `immichPersonId` | string | — | Filter to a recognized person (face) in Immich |
| `immichFavoritesOnly` | boolean | `false` | Only show photos marked as favorites in Immich |
| `immichCount` | number | `50` | Number of photos to load per refresh (10–200) |
| `icloudAlbumUrl` | string | — | iCloud shared album link (`icloud.com/sharedalbum/#TOKEN`) or bare token (iCloud source) |
| `mediaTypes` | string | `"photos"` | What to show: `photos`, `videos`, or `both` |
| `maxVideoDurationMs` | number | `60000` | Longest a video slide can play before moving on (60 sec) |
| `theme` | string | — | Color palette for the clock overlay and empty states: `linen`, `paper`, `mist` (light) or `charcoal`, `midnight`, `slate` (dark). Unset = inherit the display default from Settings > Screen, and Midnight if that is unset too |

{% callout type="note" title="Immich source" %}
The Immich options only appear in the editor when both **Immich Server URL** and **Immich API Key** are configured in Settings > API keys. Album and person filters are mutually exclusive — selecting one clears the other.
{% /callout %}

---

## Time & Date

### Clock

Displays the current time with optional date information. Supports {% $stats.clockViewCount %} visual styles.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"classic"` | Display style: `classic`, `digital`, `analog`, `minimal`, `flip`, `word`, `binary`, `vertical`, `split`, `progress`, `fuzzy`, `world`, `dot-matrix`, `radial`, `arc`, `neon`, `bar`, or `elapsed` |
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
| `viewMode` | string | `"daily"` | View mode: `daily`, `agenda`, `week`, or `month` |
| `daysToShow` | number | `3` | Number of days ahead to display |
| `showTime` | boolean | `true` | Show event times |
| `showLocation` | boolean | `false` | Show event locations |
| `maxEvents` | number | `20` | Maximum number of events to display |
| `showWeekNumbers` | boolean | `false` | Show week numbers in week/month views |
| `sourceFilter` | array | — | Calendar source IDs this module shows (empty or unset = all sources merged). Use it to give one screen a single family member's calendar |
| `dailyShowDescription` | boolean | `false` | Show the event description under the title (daily view) |
| `agendaShowDescription` | boolean | `false` | Show the event description under the title (agenda view) |
| `accentColor` | string | `"#3b82f6"` | Event indicator bar and today highlights |

Configure sources in **Settings > Calendar** — see [Calendar setup](/docs/getting-started#calendar-setup). Supports multiple calendars with color-coding (native colors when using Google OAuth; manual per-feed color when using iCal URLs).

### Countdown

Counts down to one or more future events with visual progress rings.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"all"` | Display mode: `all` (show all events) or `next` (show only the next upcoming event) |
| `events` | array | `[]` | List of events, each with `id`, `name`, `date`, optional `recurring` (`"yearly"`), optional `source` (`"custom"` or `"holiday"`), and optional `backgroundImage` |
| `showPastEvents` | boolean | `false` | Continue showing events after they pass |
| `stayUntilEndOfDay` | boolean | `false` | Keep an event that has reached zero on screen until the end of that day, so a birthday or anniversary stays up all day instead of vanishing at midnight |
| `scale` | number | `1` | Visual scale factor (0.5–4) |
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
| `view` | string | `"default"` | Display style: `default` or `arc` |
| `showDayLength` | boolean | `true` | Show total daylight hours |
| `showGoldenHour` | boolean | `false` | Show golden hour times |

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
| `tickerSpeed` | number | `5` | Scroll speed for ticker view |

### Crypto Price

Cryptocurrency prices from CoinGecko.

| Option | Type | Default | Description |
|---|---|---|---|
| `ids` | string | `"bitcoin,ethereum"` | Comma-separated CoinGecko IDs |
| `refreshIntervalMs` | number | `30000` | Refresh interval (30 sec) |
| `view` | string | `"cards"` | Display mode: `cards`, `ticker`, `table`, or `compact` |
| `cardScale` | number | `1` | Size multiplier for the cards, table, and compact views (0.5–3). Not used by the ticker view |
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

Enabled slots, week start day, default slot times, and 12/24h formatting are **household-level settings** edited once under `/remote` > Meals > Settings — every meal-planner module across every display picks them up from `data/meals.json` automatically. Meal data (saved meals and weekly plan) lives in the same file and is shared across the standard widget, fullscreen display, editor, and remote via `/api/meals/data`. The plan uses ISO date strings (e.g. `"2026-04-04"`) to support multi-week planning with week navigation. Old day-of-week configs are auto-migrated. Entries older than 12 weeks are pruned automatically.

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
| `fontWeight` | number | `400` | Numeric weight, 100–900 |
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

Rotates through images from a local directory, an Immich photo library, or an iCloud shared album. Can mix in videos from the same source — videos play muted, advance to the next slide when they finish, and use a hard cut instead of a crossfade.

| Option | Type | Default | Description |
|---|---|---|---|
| `directory` | string | `""` | Directory name inside `public/backgrounds/` |
| `intervalMs` | number | `30000` | Time between transitions (30 sec) |
| `transition` | string | `"fade"` | Transition effect: `fade` or `none` |
| `objectFit` | string | `"cover"` | Image fit mode |
| `refreshIntervalMs` | number | `600000` | How often to re-scan the directory for new images (10 min) |
| `source` | string | `"local"` | Photo source: `local`, `immich` (requires keys in Settings > API keys), or `icloud` (a public shared album — no keys needed) |
| `immichAlbumId` | string | — | Filter to a specific Immich album |
| `immichPersonId` | string | — | Filter to a recognized person (face) in Immich |
| `immichFavoritesOnly` | boolean | `false` | Only show photos marked as favorites in Immich |
| `immichCount` | number | `50` | Number of photos to load per refresh (10–200) |
| `icloudAlbumUrl` | string | — | iCloud shared album link (`icloud.com/sharedalbum/#TOKEN`) or bare token (iCloud source) |
| `mediaTypes` | string | `"photos"` | What to show: `photos`, `videos`, or `both` |
| `maxVideoDurationMs` | number | `60000` | Longest a video slide can play before moving on (60 sec) |

When using Immich as the source, the editor shows a connection status indicator, album and person dropdowns, a favorites toggle, a photo count slider, and a live preview strip of 4 photos matching the current filters. Album and person filters are mutually exclusive.

When using iCloud as the source, paste a public shared album link from the Photos app (**Share > Copy iCloud Link** on a shared album). No Apple account or API key is needed — the display loads photos straight from Apple's servers. The album must have a public website link enabled.

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
| `backdropBlur` | number | `12` | Backdrop blur in pixels |
| `borderWidth` | number | `1` | Border width in pixels |
| `borderColor` | string | `"rgba(255, 255, 255, 0.15)"` | Border color |
| `shadowSize` | number | `8` | Box shadow size in pixels |

These are the values a newly added module starts with. A few modules override some of them on add: the four full-screen modules plus **Shape & Divider** and **Icon** start transparent with no padding, blur, border, or shadow; **Video** and **Web Embed** start with no padding; and **Multi-Month Calendar** and **Chore Chart** start at a larger base font size.

## Settings every module shares

Alongside the options above, every module on a screen carries four instance settings that decide *whether* it renders: an on/off switch, a day-and-time schedule, conditional visibility driven by live values published by add-ons, and a background-provider flag that keeps a module's data loop running while other screens are showing. See the [Configuration reference](/docs/configuration#module-instance) for their exact shape, and the [Editor guide](/docs/editor) for how to set them.
