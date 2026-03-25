---
title: Modules Reference
nextjs:
  metadata:
    title: Modules Reference
    description: All 35 built-in modules available in Home Screens.
---

Home Screens includes 35 built-in modules organized into 7 categories. Each module can be dragged onto the canvas from the module palette in the editor.

## Time & Date

### Clock

Displays the current time with optional date information. Supports 18 visual styles.

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

### Calendar

Shows upcoming events from Google Calendar with multiple view modes.

| Option | Type | Default | Description |
|---|---|---|---|
| `viewMode` | string | `"daily"` | View mode: `daily`, `agenda`, `week`, or `month` |
| `daysToShow` | number | `3` | Number of days ahead to display |
| `showTime` | boolean | `true` | Show event times |
| `showLocation` | boolean | `false` | Show event locations |
| `maxEvents` | number | `20` | Maximum number of events to display |
| `showWeekNumbers` | boolean | `false` | Show week numbers in week/month views |

Requires Google Calendar to be configured in Settings. Supports multiple calendars with color-coding.

### Countdown

Counts down to one or more future events with visual progress rings.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"all"` | Display mode: `all` (show all events) or `next` (show only the next upcoming event) |
| `events` | array | `[]` | List of events, each with `id`, `name`, `date`, optional `recurring` (`"yearly"`), and optional `source` (`"custom"` or `"holiday"`) |
| `showPastEvents` | boolean | `false` | Continue showing events after they pass |
| `scale` | number | `1` | Visual scale factor (0.5–4) |
| `holidayCountry` | string | — | ISO country code to auto-populate holiday countdowns (e.g. `"US"`) |

### Year Progress

Visual progress bars showing how far through the current time periods you are.

| Option | Type | Default | Description |
|---|---|---|---|
| `showYear` | boolean | `true` | Show year progress |
| `showMonth` | boolean | `true` | Show month progress |
| `showWeek` | boolean | `true` | Show week progress |
| `showDay` | boolean | `true` | Show day progress |
| `showPercentage` | boolean | `true` | Show percentage labels |

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

A dedicated date display widget with multiple visual layouts and optional metadata (week number, day of year).

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

Unified weather module with 8 views and 5 provider options.

**Views:** `current`, `hourly`, `daily`, `combined`, `compact`, `table`, `precipitation`, `alerts`

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"hourly"` | Which view to render (see list above) |
| `iconSet` | string | `"color"` | Icon style: `outline` or `color` |
| `provider` | string | `"global"` | Weather provider: `global` (use global setting), `openweathermap`, `weatherapi`, `pirateweather`, `noaa`, or `open-meteo` |
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
- **combined** — Current conditions with hourly and daily sections in one widget.
- **compact** — Minimal current temperature and icon, fits small spaces.
- **table** — Tabular hourly data with columns for each stat.
- **precipitation** — Minute-by-minute precipitation chart for the next 60 minutes. Requires Pirate Weather provider for minutely data.
- **alerts** — Active weather alerts with severity levels. Requires Pirate Weather provider for alert data.

### Moon Phase

Current moon phase with visual representation.

| Option | Type | Default | Description |
|---|---|---|---|
| `showIllumination` | boolean | `true` | Show illumination percentage |
| `showMoonTimes` | boolean | `true` | Show moonrise/moonset times |

Uses the `suncalc` library for calculations based on your configured latitude/longitude.

### Sunrise & Sunset

Today's sunrise and sunset times with visual arc.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"default"` | Display style: `default` or `arc` |
| `showDayLength` | boolean | `true` | Show total daylight hours |
| `showGoldenHour` | boolean | `false` | Show golden hour times |

### Air Quality

Air quality index, pollutant levels, and UV index.

| Option | Type | Default | Description |
|---|---|---|---|
| `showAQI` | boolean | `true` | Show air quality index |
| `showPollutants` | boolean | `false` | Show individual pollutant levels (PM2.5, PM10, O3, NO2) |
| `showUV` | boolean | `true` | Show UV index |
| `refreshIntervalMs` | number | `900000` | Refresh interval (15 min default) |

Requires an OpenWeatherMap API key.

### Rain Map

Animated precipitation radar map powered by RainViewer. Displays past radar and near-future nowcast frames over a base map.

| Option | Type | Default | Description |
|---|---|---|---|
| `latitude` | number | `0` | Map center latitude (falls back to global setting) |
| `longitude` | number | `0` | Map center longitude (falls back to global setting) |
| `zoom` | number | `6` | Map zoom level |
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

### News

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

### Stock Ticker

Real-time stock prices from Yahoo Finance.

| Option | Type | Default | Description |
|---|---|---|---|
| `symbols` | string | `"AAPL,GOOGL,MSFT"` | Comma-separated stock symbols |
| `refreshIntervalMs` | number | `60000` | Refresh interval (1 min) |
| `view` | string | `"cards"` | Display mode: `cards`, `ticker`, `table`, or `compact` |
| `tickerSpeed` | number | `5` | Scroll speed for ticker view |

### Crypto

Cryptocurrency prices from CoinGecko.

| Option | Type | Default | Description |
|---|---|---|---|
| `ids` | string | `"bitcoin,ethereum"` | Comma-separated CoinGecko IDs |
| `refreshIntervalMs` | number | `60000` | Refresh interval (1 min) |
| `view` | string | `"cards"` | Display mode: `cards`, `ticker`, `table`, or `compact` |
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

**Supported leagues (12):** NFL, NBA, MLB, NHL, WNBA, MLS, Premier League (EPL), La Liga, Bundesliga, Serie A, Ligue 1, Liga MX.

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

### Quote

Daily inspirational quote from ZenQuotes.

| Option | Type | Default | Description |
|---|---|---|---|
| `refreshIntervalMs` | number | `300000` | Refresh interval (5 min) |

### Word of the Day

Displays a vocabulary word with definition and usage. The word is computed from a built-in list based on the current date -- no configuration options.

### This Day in History

Historical events that happened on today's date.

| Option | Type | Default | Description |
|---|---|---|---|
| `refreshIntervalMs` | number | `3600000` | Data refresh interval (1 hour) |
| `rotationIntervalMs` | number | `10000` | How often to rotate between events (10 sec) |

### Flag Status

Shows whether the US federal flag is at half-staff, including the reason.

| Option | Type | Default | Description |
|---|---|---|---|
| `showReason` | boolean | `true` | Show the reason for half-staff status |
| `refreshIntervalMs` | number | `1800000` | How often to check for updates (30 min) |

---

## Personal

### To-Do

A checklist with completable items.

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | string | `"To Do"` | List title |
| `items` | array | `[]` | Items with `id`, `text`, and `completed` fields |

Items can be added, edited, and checked off in the editor.

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
| `refreshIntervalMs` | number | `300000` | How often to fetch tasks (5 min) |
| `title` | string | `"Todoist"` | Widget header title |

Requires a Todoist API token in settings.

**View details:**

- **list** — Grouped task list with priority bars, due date badges, project/label metadata, and subtask nesting.
- **board** — Kanban-style columns (up to 3) grouped by the selected `groupBy` option.
- **focus** — Shows only today's and overdue tasks with a count of remaining items.

### Sticky Note

A colored note card for freeform text.

| Option | Type | Default | Description |
|---|---|---|---|
| `content` | string | `""` | Note text content |
| `noteColor` | string | `"#fef08a"` | Background color of the note |

### Greeting

Displays a time-aware greeting (Good morning/afternoon/evening).

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | string | `"Friend"` | Name to greet (e.g. "Good morning, Bryan") |

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

Displays rotating positive affirmations with multiple visual styles. Time-aware selection adjusts messages based on time of day, day of week, and season.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"elegant"` | Display style: `elegant`, `card`, `minimal`, or `typewriter` |
| `categories` | array | `["affirmations", "compliments", "motivational"]` | Categories to include: `affirmations`, `compliments`, `motivational`, `gratitude`, `mindfulness` |
| `rotationIntervalMs` | number | `15000` | How often to rotate to the next affirmation (15 sec) |
| `showCategoryLabel` | boolean | `false` | Show the category label below the affirmation |
| `timeAware` | boolean | `true` | Select affirmations based on time of day, day of week, and season |
| `customEntries` | array | `[]` | Custom affirmations, each with `id`, `text`, and optional `attribution` |
| `accentColor` | string | `"#a78bfa"` | Accent color for card/typewriter views |

**View details:**

- **elegant** — Large centered text with a subtle gradient backdrop.
- **card** — Rounded card with accent-colored left border.
- **minimal** — Simple text with no decoration.
- **typewriter** — Typewriter-style animation that types out each affirmation.

### Meal Planner

A meal planning widget for organizing daily meals across configurable slots (breakfast, lunch, dinner, snack). Time-aware slot detection highlights the current or next meal.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"week"` | Display style: `week`, `today`, `next-meal`, `compact`, or `list` |
| `slots` | array | `["breakfast", "lunch", "dinner"]` | Enabled meal slots (options: `breakfast`, `lunch`, `dinner`, `snack`) |
| `weekStartDay` | string | `"monday"` | First day of week: `sunday` or `monday` |
| `showEmoji` | boolean | `true` | Show meal emoji |
| `showPrepTime` | boolean | `true` | Show prep time in minutes |
| `showTags` | boolean | `true` | Show meal tags |
| `accentColor` | string | `"#f59e0b"` | Accent color for highlights |
| `savedMeals` | array | `[]` | Meal definitions with name, emoji, tags, prep time, and notes |
| `plan` | array | `[]` | Weekly schedule mapping day + slot to a saved meal |

Meals are configured in the editor with emoji, prep time, tags (quick, healthy, vegetarian, etc.), and notes. The weekly plan assigns meals to specific day/slot combinations.

**View details:**

- **week** — Grid showing all 7 days and meal slots at a glance with today highlighted.
- **today** — Vertical stack of slot cards for today with active slot highlighted.
- **next-meal** — Large display of the next upcoming meal with context label (Now/Coming Up/Tomorrow).
- **compact** — Two-column layout showing Today and Tomorrow side-by-side.
- **list** — Full week listed vertically with day headers, showing only days with meals.

### Chore Chart

A chore tracking widget for families or housemates. Assign chores to members with points, streaks, rotation schedules, and multiple visual layouts.

| Option | Type | Default | Description |
|---|---|---|---|
| `view` | string | `"board"` | Display style: `board`, `star-chart`, `today`, `progress`, or `compact` |
| `members` | array | `[]` | Household members, each with `id`, `name`, `emoji`, and `color` |
| `chores` | array | `[]` | Chore definitions with `id`, `name`, `emoji`, `points`, `frequency`, `daysOfWeek`, `timeOfDay`, `assigneeIds`, and `rotation` |
| `weekStartDay` | string | `"monday"` | First day of week: `sunday` or `monday` |
| `showPoints` | boolean | `true` | Show point values for chores |
| `showStreaks` | boolean | `true` | Show completion streaks |
| `showTimeOfDay` | boolean | `true` | Show time-of-day labels (morning, afternoon, evening) |
| `allowDisplayComplete` | boolean | `true` | Allow marking chores complete from the display view |
| `accentColor` | string | `"#f59e0b"` | Accent color for highlights |

**View details:**

- **board** — Kanban-style board grouping chores by status or member.
- **star-chart** — Kid-friendly star chart showing earned points per member.
- **today** — Today's chores only, grouped by time of day.
- **progress** — Progress bars showing completion rates per member.
- **compact** — Condensed view for small widget sizes.

---

## Media & Display

### Text

Rich text block with multiple display modes, effects, and styling options.

| Option | Type | Default | Description |
|---|---|---|---|
| `content` | string | `""` | Text content (supports markdown when enabled) |
| `alignment` | string | `"center"` | Text alignment: `left`, `center`, or `right` |
| `orientation` | string | `"horizontal"` | Text direction: `horizontal`, `vertical`, or `sideways` |
| `verticalAlign` | string | `"center"` | Vertical alignment: `top`, `center`, or `bottom` |
| `markdown` | boolean | `false` | Enable markdown rendering |
| `autoFit` | boolean | `false` | Auto-fit text size to fill the container |
| `effect` | string | `"none"` | Text effect: `none`, `typewriter`, `fade-in`, `gradient-sweep`, or `glow` |
| `rotationEnabled` | boolean | `false` | Rotate through content split by separator |
| `rotationIntervalMs` | number | `5000` | Rotation interval in milliseconds |
| `rotationSeparator` | string | `"---"` | Separator string for splitting content into rotation items |
| `gradientEnabled` | boolean | `false` | Enable gradient text coloring |
| `gradientFrom` | string | `"#a78bfa"` | Gradient start color |
| `gradientTo` | string | `"#22d3ee"` | Gradient end color |
| `gradientAngle` | number | `90` | Gradient angle in degrees |
| `textTransform` | string | `"none"` | Text transform: `none`, `uppercase`, `lowercase`, or `capitalize` |
| `letterSpacing` | number | `0` | Letter spacing in pixels |
| `icon` | string | `""` | Icon prefix (emoji or short text shown before content) |
| `templateVariables` | boolean | `false` | Enable dynamic variables like `{{time}}`, `{{date}}`, `{{greeting}}` |
| `marquee` | boolean | `false` | Enable marquee (scrolling) text |
| `marqueeSpeed` | number | `5` | Marquee scroll speed |
| `marqueeDirection` | string | `"left"` | Marquee direction: `left`, `right`, `up`, or `down` |

**Text effects:**
- **typewriter** — Types out the text character by character
- **fade-in** — Fades the text in smoothly
- **gradient-sweep** — Animated gradient sweep across the text
- **glow** — Pulsing glow effect

**Template variables:** When enabled, special placeholders are replaced with live data: `{{time}}`, `{{date}}`, `{{greeting}}`, `{{dayOfWeek}}`, and more.

**Content rotation:** Split content by a separator (default `---`) and rotate through the chunks at a set interval — useful for rotating quotes, tips, or announcements.

### Image

Displays a static image.

| Option | Type | Default | Description |
|---|---|---|---|
| `src` | string | `""` | Image URL or path |
| `objectFit` | string | `"cover"` | How the image fills the container: `cover`, `contain`, or `fill` |
| `alt` | string | `""` | Alt text |

### Photo Slideshow

Rotates through images from a directory.

| Option | Type | Default | Description |
|---|---|---|---|
| `directory` | string | `""` | Directory name inside `public/backgrounds/` |
| `intervalMs` | number | `30000` | Time between transitions (30 sec) |
| `transition` | string | `"fade"` | Transition effect: `fade` or `none` |
| `objectFit` | string | `"cover"` | Image fit mode |
| `refreshIntervalMs` | number | `600000` | How often to re-scan the directory for new images (10 min) |

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

**Note:** Some websites (e.g. YouTube, Yahoo Finance, Twitter) set `frame-ancestors` or `X-Frame-Options` headers that prevent embedding. Self-hosted services, published Google Docs/Sheets, and sites that explicitly support embedding will work.

---

## Travel

### Traffic / Commute

Shows estimated travel times for configured routes.

| Option | Type | Default | Description |
|---|---|---|---|
| `routes` | array | `[]` | Routes, each with `label`, `origin`, and `destination` |
| `refreshIntervalMs` | number | `300000` | Refresh interval (5 min) |

Supports Google Routes API or TomTom as providers. Origins and destinations are address strings.

---

## Module Styling

Every module supports these style properties, configurable in the Property Panel:

| Property | Type | Default | Description |
|---|---|---|---|
| `opacity` | number | `1` | Module opacity (0–1) |
| `borderRadius` | number | `12` | Corner rounding in pixels |
| `padding` | number | `16` | Inner padding in pixels |
| `backgroundColor` | string | `"rgba(0,0,0,0.4)"` | Background color |
| `textColor` | string | `"#ffffff"` | Text color |
| `fontFamily` | string | `"Inter, system-ui, sans-serif"` | Font family |
| `fontSize` | number | `16` | Base font size in pixels |
| `backdropBlur` | number | `12` | Backdrop blur in pixels |
