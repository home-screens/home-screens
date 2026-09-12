---
title: Module Reference
nextjs:
  metadata:
    title: Module Reference
    description: Every configuration option for all 44 built-in Home Screens modules, clocks, weather, calendars, sports, news, chore charts, meal planners, and more.
    alternates:
      canonical: /docs/module-reference
---

Exhaustive per-module option tables for every built-in module. If you're new to the module system, start with the [Modules guide](/docs/modules), this page assumes you already know which module you want and are looking for the exact field names.

Home Screens includes {% $stats.moduleCount %} built-in modules organized into {% $stats.categoryCount %} categories. Each module can be dragged onto the canvas from the module palette in the editor.

One of those categories, **Health & Fitness**, has no built-in modules yet. It is reserved for add-ons such as Strava and Garmin, stays hidden in the module palette until you install one, and so has no section below.

Where a module has a `refreshIntervalMs` option, its default comes from that module's fetch cache lifetime rather than a value written into the module itself, so it stays in step with how long the server caches the same data. The numbers below are the current defaults; you can always override them per module.

{% module-reference %}

{% category name="Full Screen" %}
These modules are designed to fill the entire display as ambient, always-on screens. They use the `fillsCanvas` flag, position, size, and style controls are hidden in the editor since the module always occupies the full display area.

**Themes:** all five full-screen modules share one `theme` field with twelve color palettes: `linen`, `paper`, `mist`, `sandstone`, `vellum`, and `bloom` (light), `charcoal`, `midnight`, `slate`, `aurora`, `obsidian`, and `horizon` (dark). Leave `theme` unset to inherit the display-wide default from **Settings > Screen** (`fullscreenTheme`). Anything that isn't one of the twelve ids falls back to Linen.

The six newer themes (`sandstone`, `vellum`, `bloom`, `aurora`, `obsidian`, `horizon`) additionally carry their own accent color and, on the Full-Screen Calendar only, an event style deciding how event blocks are painted: a faint tint (`linen` and the other original themes), a translucent card, a solid color fill, or a plain surface with a colored edge. All but `vellum` also paint a static gradient behind the module. On the calendar, chore chart, and meal planner, setting `accentColor` overrides the theme's own accent and leaving it empty follows the theme; the weather module's accent follows the sky instead, and the photo viewer has none.

The older `darkMode` boolean on Full-Screen Calendar and Full-Screen Chore Chart has been superseded by `theme` and is no longer shown in the editor. It still works as a fallback so older configurations keep rendering: `darkMode: true` maps to `charcoal` and `false` maps to `linen`. It is ignored entirely whenever `theme` is set.
{% /category %}

{% module type="fullscreen-calendar" %}
A fullscreen ambient calendar display inspired by Skylight, designed to fill the entire screen. Automatically sizes to the display dimensions and pins to position (0,0). Pulls from any iCal feed, Google Calendar (via iCal URL or OAuth), or iCloud (app-specific password), see [Calendar setup](/docs/calendars).

{% fields /%}

In the schedule and day timeline views, descriptions only draw when the event block is tall enough to fit them, so short events show the title alone even with the toggle on.

The up next view is a fixed box, so when descriptions would push its last row off the bottom, the listed events drop theirs first, then the big card, until everything fits. In the family grid a cell only reserves room for the descriptions its events actually have, so plain events still fit next to described ones.

**View details:**

- **schedule**: Multi-day time grid with events positioned by start/end time. Shows a "now" line and supports configurable hour range.
- **week-list**: Day-by-day vertical list of the current week's events with collapsible past days.
- **month-grid**: Traditional month calendar grid with event dots/names in each cell and today highlighted.
- **day-timeline**: Single-day vertical timeline with event blocks, location details, and hour markers.
- **agenda**: Scrollable list of upcoming events across multiple days, grouped by date.
- **family-grid**: People as rows, the week as columns. Each person set up under **Settings > Family** gets a row; events on calendars that belong to nobody sit once on an Everyone row. Without people, every calendar with an event this week gets its own row.
- **up-next**: The next event, big: title, time, place, countdown (or progress while it is running), then short lists for later today, earlier today, and tomorrow.
- **free-time**: One track per person for today, busy blocks and free gaps side by side, with a card naming when everyone is free. Events on shared calendars count as busy for the whole household.
- **rolling**: The next few weeks as a grid whose top-left cell is always today. Weekday columns shift one left each midnight, weekends are shaded, and each new month is marked on its first day. `rollingWeeksToShow` sets the week count (1–8, default 6).

**People:** the family grid and free time views read the household list under **Settings > Family**. Choose each person’s calendars under **Settings > Calendar > Whose calendars?** A calendar picked for nobody is shared.
{% /module %}

{% module type="fullscreen-chore-chart" %}
A fullscreen ambient chore chart display designed to fill the entire screen. Reads members from `data/family.json` and chores from `data/chores.json` so the fullscreen display, module views, and remote Chores tab all share the same source of truth. Automatically sizes to the display dimensions and pins to position (0,0).

{% fields /%}

**Layout details:**

- **Portrait**: Header with date and completion percentage, horizontal member chips with progress bars, stacked time-of-day bands (morning/afternoon/evening/anytime), and a star chart grid at the bottom for weekly tracking. By person, the chips give way to one section per person.
- **Landscape**: Top bar with date and member chips, one column per time of day (or per person), and a horizontal star chart in the footer.
- Only people with a chore today get a chip. Someone with chores on another day of the week is named in a "Day off" line under the chips; someone with no chores at all this week is left off the chart.

**Rewards store view:**

The `rewards-store` view displays a fullscreen rewards browsing and redemption interface. A member picker at the top shows each member's ticket balance. The main area shows a grid of available rewards with ticket costs and eligibility indicators. Members can redeem rewards directly from the display when they have enough tickets. When `showRewardsButton` is enabled, a toggle button in the chore board header lets users switch between the chore board and rewards store without changing the module config.
{% /module %}

{% module type="fullscreen-meal-planner" %}
A fullscreen ambient meal planner display that shows the weekly meal schedule at a glance. Reads from the same meal data as the standard meal planner module. Supports light/dark themes with multiple color palettes.

{% fields /%}

Enabled slots, week start day, default slot times, and 12/24h formatting are **household-level settings** stored in `data/meals.json`: edit them once under `/remote` > Meals > Settings and every meal-planner module on every display picks up the change. The time format defaults to the household **Time format** setting (Settings → Defaults → Location & language); pick an explicit 12- or 24-hour option in meal settings only if meals should differ from it.

**View details:**

- **week**: Full 7-day grid with meal cards organized by slot, today highlighted.
- **today**: Focused view of today's meals with large cards and details.
- **menu-board**: Restaurant-style board layout for displaying the week's menu.
- **next-meal**: Large display of the next upcoming meal with context label.
{% /module %}

{% module type="fullscreen-weather" %}
A fullscreen weather dashboard with six views. **Panorama** stacks the current conditions, an optional next-hour rain strip, a temperature curve, a 7-day outlook with range bars, and a row of stats. **Wide strip** is Panorama's parts side by side, for a module that spans the width of a landscape screen but not its height: the current conditions, then the temperature curve over the stats, then the outlook, with the text sized to the module's area rather than its height. In a portrait box the three columns stay, each in a tall form: the hours run down the middle column as rows and each forecast day gets a band of its own. **Almanac** is a grid of instrument cards: sun arc, moon phase, wind, humidity, pressure, UV, and visibility, plus the next 12 hours. **Ambient** is a large, plain read for across the room. **Week ahead** gives each forecast day its own band (or, on a landscape display, its own column) with the day's icon, description, rain chance, wind (when the weather source reports a daily figure), and a high/low bar on a shared scale. **Hour by hour** draws the next 24 hours as a timeline (48 on sources that report every three hours): a temperature curve through every hour, with rain chance and wind beside it. It runs down the page on a portrait display and across it on a landscape one.

Every view has a portrait and a landscape layout, picked automatically from the display's shape.

The background tint follows the current conditions and the position of the sun, layered behind the cards so it never affects how readable anything is. Set **Background tint** to Off for a plain themed background.

Some panels depend on what your weather source provides, and hide themselves when it has nothing to show:

- **Next-hour rain** needs minute-by-minute data, which only Pirate Weather offers today.
- **Weather warnings** need alerts, available from Pirate Weather and NOAA.
- **Pressure** and **dew point** come from NOAA, Open-Meteo, and the Met Office.
- **UV index** comes from Pirate Weather, the Met Office, WeatherAPI, and Open-Meteo.
- **Visibility** comes from NOAA.

The temperature curve draws however many hours your source returns, and its heading says how many. Most sources give 48 hours; OpenWeatherMap gives 5 days in 3-hour steps; NOAA gives about 6 days hourly.
{% /module %}

{% module type="fullscreen-photo" %}
A fullscreen digital photo frame that cycles through photos from a local directory, an Immich library, a OneDrive folder, or an iCloud shared album (with [Google Photos available as an import](/docs/backgrounds#google-photos)), **or displays a single pinned photo** as a static wallpaper. Supports transitions, shuffle, and an optional clock overlay, and can mix in videos from the same source.

The editor's **Mode** dropdown toggles between Slideshow and Single Photo. Single-photo mode simply sets the `file` field; the rotation, interval, transition, and shuffle controls are hidden while `file` is set. "Single Photo" is only an editor UI label, nothing stores a "mode" setting on the module itself.

{% fields /%}

{% callout type="note" title="Immich source" %}
The Immich options only appear in the editor when both **Immich Server URL** and **Immich API Key** are configured in Settings > API keys. Album and person filters are mutually exclusive, selecting one clears the other.
{% /callout %}

{% callout type="note" title="OneDrive source" %}
The OneDrive option only appears in the Photo Source picker once a Microsoft **Application (client) ID** is saved in Settings > API keys. Signing in happens in the module itself: click **Sign in with Microsoft** and enter the shown code at the link on any device. Photos shuffle on every refresh; very large folders use a random sample of 1,000 photos. The full walkthrough is in [OneDrive photos](/docs/modules#one-drive-photos).
{% /callout %}
{% /module %}

{% module type="fullscreen-news" %}
The News Headlines feeds on the whole canvas: one story at a time with its photo, or a newspaper-style front page. Follows the same feed list, shorthands, and filters as [News Headlines](#news-headlines).
{% /module %}

{% module type="clock" %}
Displays the current time with optional date information. Supports {% $stats.clockViewCount %} visual styles.
{% /module %}

{% module type="calendar" %}
Shows upcoming events from any iCal feed, Google Calendar (via iCal URL or OAuth), or iCloud (app-specific password), with multiple view modes.

{% fields /%}

Configure sources in **Settings > Calendar**: see [Calendar setup](/docs/calendars). Supports multiple calendars with color-coding (native colors when using Google OAuth; manual per-feed color when using iCal URLs).

**Colored event style:** In `colored` mode, timed events drop the dot and pill and render their start time plus title in the calendar's own color, the time prefix is constant-width and zero-padded (e.g. `08:05 AM`) and follows the household **Time format** setting. All-day events render as solid calendar-color pills with white or near-black text depending on the color's brightness. Day cells list all-day events first, then timed events by start time, in both styles.

**Grid themes:** The multi-week and month views share one grid and one theme. `banner` is the original look. The three newer themes share a cleaner grid, a month heading at the top, small day numbers with a filled badge on today, a ring around today's cell, and multi-day events drawn as one connected bar, and differ in how events render: `clean` shows a short colored time next to a bold title, `minimal` drops times so full titles always fit (best at 6+ weeks or across the room), and `vivid` fills every event with its calendar color for maximum pop. In the month view the days before and after the month are dimmed; in the multi-week view the days already passed this week are dimmed and each new month is marked on its first day. Calendar modules start on `banner`; switch the theme under the View Mode picker. The rolling weeks view (`viewMode: "rolling"`, 1–8 weeks via `weeksToShow`) uses the same themes; its top-left cell is always today, weekend cells are shaded under every theme (banner included), and each new month is marked on its first day.

{% module type="countdown" %}
Counts down to one or more future events with visual progress rings.
{% /module %}

{% module type="date" %}
A dedicated date display module with multiple visual layouts and optional metadata (week number, day of year).

{% fields /%}

**View details:**

- **full**: Large centered day number with month name and optional day name.
- **minimal**: Compact single-line format with custom date formatting.
- **stacked**: Vertically stacked layout with decorative divider lines.
- **editorial**: Horizontal layout with large day number on left and details on right.
- **banner**: Horizontal all-caps banner with elements separated by bullets.
{% /module %}

{% module type="year-progress" %}
Visual progress bars showing how far through the current time periods you are.
{% /module %}

{% module type="multi-month" %}
Displays multiple months in a vertical or horizontal layout with today highlighted.
{% /module %}

{% module type="weather" %}
Unified weather module with {% $stats.weatherViewCount %} views and {% $stats.weatherProviderCount %} provider options.

{% callout type="note" title="Set your location first" %}
Every weather view needs a latitude and longitude. Set them once in **Settings > Weather**. Without a location the module shows an error rather than a forecast.

Five providers work with no API key at all: **Open-Meteo**, **NOAA** (US only), **Yr.no**, **SMHI**, and **Environment Canada**. Four need a free key added on the provider's own card under **Settings > Weather**: **OpenWeatherMap**, **WeatherAPI**, **Pirate Weather**, and **Met Office**.
{% /callout %}

{% fields /%}

**View details:**

- **current**: Large current temperature with conditions, high/low, and optional stats.
- **hourly**: Horizontal scrolling hourly forecast.
- **daily**: Multi-day forecast with high/low temperatures.
- **combined**: Current conditions with hourly and daily sections in one view.
- **compact**: Minimal current temperature and icon, fits small spaces.
- **table**: Tabular hourly data with columns for each stat.
- **precipitation**: Minute-by-minute precipitation chart for the next 60 minutes. Requires Pirate Weather provider for minutely data.
- **alerts**: Active weather alerts with severity levels. Needs a provider that publishes alerts: **Pirate Weather** or **NOAA** (US only, no API key needed). Other providers return no alerts.
{% /module %}

{% module type="moon-phase" %}
Current moon phase with visual representation.

{% fields /%}

Uses the `suncalc` library for calculations based on your configured latitude/longitude.
{% /module %}

{% module type="sunrise-sunset" %}
Today's sunrise and sunset times with visual arc.

{% fields /%}

Uses the `suncalc` library based on your configured latitude/longitude. With `showAstroDark` on, the dark times always describe tonight: darkness starting this evening paired with its end tomorrow morning. On summer nights when the sky never gets fully dark, the dark rows are simply hidden. The `circle` view draws a 24-hour ring with noon at the top and midnight at the bottom, shading daylight, twilight, and full darkness to scale. In the `circle` view, the `sky` theme replaces those flat segments with a smooth gradient from sunrise through noon and sunset into the night, dotted with stars while full darkness lasts. Under the midnight sun the ring holds its daylight color with the sun always up; through a polar night the `sky` theme turns the whole ring dark with stars all around, while `simple` keeps its twilight shading (flat twilight when the sky never gets fully dark).
{% /module %}

{% module type="air-quality" %}
Air quality index and pollutant levels.

{% fields /%}

Requires an **OpenWeatherMap** API key (on its card under Settings > Weather) and a location set in **Settings > Weather**. The location is checked first, so a missing location shows an error even when the key is in place.
{% /module %}

{% module type="rain-map" %}
Animated precipitation radar map over an OpenStreetMap base map. Shows the past two hours of radar and the next hour of nowcast frames. Radar comes from [LibreWXR](https://github.com/JoshuaKimsey/LibreWXR), a free community server; a household running its own LibreWXR points the hub at it under **Settings > Weather > Rain radar**.
{% /module %}

{% module type="news" %}
Headlines from any RSS 2.0, RSS 1.0 (RDF), Atom, or JSON feed, several feeds merged into one list. The [News guide](/docs/news) walks through picking feeds, local news, topics, and filters.

Feeds are a list. Each entry is `{ "id", "url", "label"?, "color"?, "homeNetwork"?, "maxItems"? }`. `url` is a real feed address or one of the shorthands `local` (news near the household location in Settings), `topic:<keywords>`, `youtube:<channelId>`, or `reddit:<subreddit>`.
{% /module %}

{% module type="stock-ticker" %}
Real-time stock prices from Yahoo Finance.

{% fields /%}

Each chart is colored by its own period's move (the day chart by today's change, the week chart by the week's change) in both themes; the price-change text always shows today's change. In the `shaded` theme the day chart's width represents that symbol's full regular trading session on its own exchange (for example 9:30 to 16:00 Eastern for US stocks), so during the session the line stops at the current time and the empty part of the chart is the remaining trading time. Outside the session, or when the session bounds are not available, the points are spread evenly across the full width. The `classic` theme always spreads points evenly. The `single` view's chart honors `sparklineTheme`, `sparklineMode`, and `sparklineLabels` (its captions read `1-day` / `5-days`); when both charts are shown they share one vertical scale.
{% /module %}

{% module type="crypto" %}
Cryptocurrency prices from CoinGecko.
{% /module %}

{% module type="sports" %}
Live scores from ESPN.
{% /module %}

{% module type="standings" %}
League standings from the ESPN standings API with team logos and colors. Supports automatic rotation through division/conference groups.

{% fields /%}

**Supported leagues ({% $stats.standingsLeagueCount %}):** NFL, NBA, MLB, NHL, WNBA, MLS, Premier League (EPL), La Liga, Bundesliga, Serie A, Ligue 1, Liga MX.

**View details:**

- **table**: Full standings table with W-L record, winning percentage, games back, streak, and more. Rotates through groups automatically.
- **compact**: Condensed single-column layout showing team logo, abbreviation, and record. Rotates through groups.
- **conference**: Side-by-side conference view showing two groups simultaneously with team rankings.
{% /module %}

{% module type="dad-joke" %}
Displays a random dad joke that refreshes periodically.
{% /module %}

{% module type="quote" %}
Daily inspirational quote from ZenQuotes.
{% /module %}

{% module type="word-of-day" %}
Displays a vocabulary word with its part of speech and definition. Words come from a built-in list in your configured language (all seven shipped languages have their own list), and the word is picked from the date, so every display shows the same word on the same day.
{% /module %}

{% module type="history" %}
Historical events that happened on today's date. Fetches from two data sources, Wikipedia "On This Day" and MuffinLabs, in parallel, deduplicates by year (preferring Wikipedia's richer text), and shuffles. Each source degrades gracefully if the other fails. Both sources return English text (the Wikipedia feed this module uses is English-only), and each contributes up to 10 events per day.
{% /module %}

{% module type="todo" %}
Shows one of the family's shared lists (see [Lists](/docs/lists)). Items live in `data/todos.json`, not on the module, so the same list can sit on any number of screens and the phone, the wall and the editor always agree.

{% fields /%}

When every item is done the heading shows a green tick and "All done" in every view. A list with a repeat schedule says when it starts fresh.
{% /module %}

{% module type="sticky-note" %}
A colored note card for freeform text.
{% /module %}

{% module type="greeting" %}
Displays a time-aware greeting (Good morning/afternoon/evening). When weather-aware mode is enabled and location is configured, the greeting also shows a short contextual subtitle like "Rainy day ahead" or "Storm rolling in."
{% /module %}

{% module type="todoist" %}
Displays tasks from the Todoist API with filtering, grouping, and multiple view modes.

{% fields /%}

Requires a Todoist API token in settings. Markdown formatting in task content and descriptions (links, bold, italic, code, images) is stripped before rendering so kiosks don't show raw `[Watch](url)` syntax.

**View details:**

- **list**: Grouped task list with priority bars, due date badges, project/label metadata, and subtask nesting.
- **board**: Kanban-style columns (up to 3) grouped by the selected `groupBy` option.
- **focus**: Shows only today's and overdue tasks with a count of remaining items.
{% /module %}

{% module type="garbage-day" %}
Trash and recycling collection schedule. Highlights when collection day is approaching based on your chosen trigger mode.

{% fields /%}

Supports up to 3 collection types: trash, recycling, and a customizable third type (e.g. yard waste, compost). Each type can run on its own weekly or biweekly schedule.
{% /module %}

{% module type="affirmations" %}
Displays rotating positive affirmations with multiple visual styles. Time-aware selection adjusts messages based on time of day, day of week, and season. Weather-aware scoring quietly boosts entries that match the current conditions without hiding anything, so a rainy morning is more likely to surface a cozy gratitude entry and a snow day is more likely to surface a mindfulness entry tagged `snow`. The day-of-week and season rules are stricter than the weather one: an entry tagged for a specific day or season is held back entirely outside it, rather than just ranked lower.

{% fields /%}

**View details:**

- **elegant**: Large centered text with a subtle gradient backdrop.
- **card**: Rounded card with accent-colored left border.
- **minimal**: Simple text with no decoration.
- **typewriter**: Typewriter-style animation that types out each affirmation.
{% /module %}

{% module type="meal-planner" %}
A meal planning module for organizing daily meals across configurable slots (breakfast, lunch, dinner, snack). Time-aware slot detection highlights the current or next meal.

{% fields /%}

**Recipe links:** Meals saved with a recipe link (added from `/remote` > Meals) can open that recipe right on the display. With `qr`, tapping the meal shows a fullscreen QR code you scan with your phone; with `iframe`, the recipe page opens in an overlay on the display itself (some recipe sites block embedding, the QR option always works). In the editor preview, tapping opens the recipe in a new browser tab instead.

Enabled slots, week start day, default slot times, and 12/24h formatting are **household-level settings** edited once under `/remote` > Meals > Settings, every meal-planner module across every display picks them up from `data/meals.json` automatically. The time format defaults to the household **Time format** setting (Settings → Defaults → Location & language); pick an explicit 12- or 24-hour option in meal settings only if meals should differ from it. Meal data (saved meals and weekly plan) lives in the same file and is shared across the standard widget, fullscreen display, editor, and remote via `/api/meals/data`. The plan uses ISO date strings (e.g. `"2026-04-04"`) to support multi-week planning with week navigation. Old day-of-week configs are auto-migrated. Entries older than 12 weeks are pruned automatically.

**View details:**

- **week**: Grid showing all 7 days and meal slots at a glance with today highlighted.
- **today**: Vertical stack of slot cards for today with active slot highlighted.
- **next-meal**: Large display of the next upcoming meal with context label (Now/Coming Up/Tomorrow).
- **compact**: Two-column layout showing Today and Tomorrow side-by-side.
- **list**: Full week listed vertically with day headers, showing only days with meals.
{% /module %}

{% module type="chore-chart" %}
A chore tracking module for families or housemates. Assign chores to members with tickets, streaks, rotation schedules, and multiple visual layouts. Includes a **rewards system** where members earn tickets from completed chores and can redeem them for parent-defined rewards (managed via the remote's Chores tab).

{% fields /%}

**Members and chores are shared household data**, not module options. Members live in `data/family.json` and chores in `data/chores.json`. The family roster is available under **Settings > Family** even without a chore chart. Both are also edited from the editor's **Edit chore chart** button or from `/remote` > Chores, so every chore module on every display shows the same people and the same list. Each member has an `id`, `name`, `emoji`, and `color`. Each chore has an `id`, `name`, `emoji`, `points`, `frequency` (`daily`, `weekly`, `biweekly`, or `once`), `daysOfWeek`, `timeOfDay`, `specificDate` (YYYY-MM-DD, required when `frequency` is `once`), `assigneeIds`, `rotation`, and, when `rotation` is `schedule`, a `schedule` map of member ID to days-of-week.

**View details:**

- **board**: Kanban-style board grouping chores by status or member.
- **star-chart**: Kid-friendly star chart showing earned tickets per member.
- **today**: Today's chores only, grouped by time of day.
- **progress**: Progress bars showing completion rates per member.
- **compact**: Condensed view for small module sizes.

**Rotation modes:**

Each chore has a `rotation` field that controls how the `assigneeIds` list is resolved each day.

- **fixed**: Everyone in `assigneeIds` is responsible for the chore every time it appears. Use this for chores a single person always owns.
- **rotate-daily**: Cycles through `assigneeIds` one day at a time, so Alice handles it today, Bob handles it tomorrow, and so on.
- **rotate-weekly**: Same as daily rotation but the handoff happens at the start of each week.
- **schedule**: Per-day assignment via a `schedule` map of `memberId → number[]` (days-of-week, 0 = Sunday through 6 = Saturday). Lets you say "Alice on Mon/Wed, Bob on Tue/Thu, everyone on Fri–Sun" without creating separate chores. The editor and the remote both render a weekly grid UI for editing the schedule, and any day not covered by the schedule simply has no one assigned. A chore in schedule mode also shows a small **(schedule)** label in the board when resolved to a single assignee, so you can tell it apart from a fixed one-person chore at a glance.

Chore ticket values can be any non-negative integer, `0` is allowed and is useful for tracking routines that do not earn rewards.
{% /module %}

{% module type="text" %}
Rich text block with multiple display modes, effects, and styling options.

{% fields /%}

**Text effects:**
- **typewriter**: Types out the text character by character
- **fade-in**: Fades the text in smoothly
- **gradient-sweep**: Animated gradient sweep across the text
- **glow**: Pulsing glow effect
- **outline**: Hollow, stroked letters
- **shadow**: Offset drop shadow behind the letters
- **3d**: Layered letters for a raised, extruded look
- **neon**: Neon-tube style glow with a bright core
- **wave**: Letters ripple up and down one after another
- **bounce**: Letters bounce in sequence
- **shake**: Letters jitter in place
- **color-cycle**: Letters cycle through `colorCyclePalette`

**Template variables:** When enabled, seven placeholders are replaced with live data: `{{time}}` (24-hour), `{{time12}}` (12-hour), `{{date}}`, `{{day}}` (weekday name), `{{month}}`, `{{year}}`, and `{{greeting}}`. Anything else stays on screen exactly as typed, so watch the spelling: it is `{{day}}`, not `{{dayOfWeek}}`. The greeting words are currently English only.

**Shared-state tokens:** Single-brace `{<key>}` (separate from the double-brace template variables above) inserts a live value published by an add-on, e.g. `{plugin:ha:sensor.temp}`. Add a filter after a `|` to format it: `|round:1` rounds a numeric value to a set number of decimal places, and `|default:TEXT` supplies placeholder text for a key that hasn't published a value yet, e.g. `{plugin:ha:sensor.temp|round:1|default:n/a}`. Unknown keys render as an en dash with no filter.

**Content rotation:** Split content by a separator (default `---`) and rotate through the chunks at a set interval, useful for rotating quotes, tips, or announcements.
{% /module %}

{% module type="image" %}
Displays a static image.
{% /module %}

{% module type="video" %}
Plays a video clip, a file from your media library, a direct video URL, or a YouTube link. In the editor the module shows a still frame with a play badge; the video only plays on the actual display.

{% fields /%}

{% callout type="note" title="Best format for Raspberry Pi" %}
MP4 videos with H.264 encoding play smoothly on Raspberry Pi hardware. iPhone recordings (`.mov` files with HEVC) may not play on a Pi 4, if a clip shows a black box, convert it to MP4 (H.264) first. If a video fails to load or stalls, playback stops cleanly instead of freezing the screen, and in a photo slideshow the show advances to the next slide.
{% /callout %}

**Sound:** Videos are silent by default. To play sound, turn on the module's sound toggle. Sound also needs a setting on the display itself, which every install and upgrade turns on automatically. If sound stays off on an older Pi, re-run the upgrade.

**YouTube links:** Paste any YouTube link (`youtube.com/watch`, `youtu.be`, or a Short) into the URL field and the module plays it with YouTube's own player, autoplaying, without on-screen controls, using the privacy-friendly no-cookie player. The sound and repeat toggles work; the time limit doesn't apply (YouTube controls its own playback). Needs internet access on the display, and the video must allow embedding.
{% /module %}

{% module type="photo-slideshow" %}
Rotates through images from a local directory, an Immich photo library, a OneDrive folder, or an iCloud shared album. Can mix in videos from the same source, videos play muted, advance to the next slide when they finish, and use a hard cut instead of a crossfade. Google Photos works too, as an import: the **Import from Google Photos** button under the folder picker downloads photos you choose into your library, see [Google Photos](/docs/backgrounds#google-photos).

{% fields /%}

When using Immich as the source, the editor shows a connection status indicator, album and person dropdowns, a favorites toggle, a photo count slider, and a live preview strip of 4 photos matching the current filters. Album and person filters are mutually exclusive.

When using iCloud as the source, paste a public shared album link from the Photos app (**Share > Copy iCloud Link** on a shared album). No Apple account or API key is needed, the display loads photos straight from Apple's servers. The album must have a public website link enabled.

When using OneDrive as the source, the module signs in to your Microsoft account once with a short code, and then you pick a folder. That folder's photos feed the slideshow, subfolders included. The full walkthrough is in [OneDrive photos](/docs/modules#one-drive-photos). Photos shuffle on every refresh; very large folders use a random sample of 1,000 photos.

**Mixing in videos:** Set **Show** to *Photos + videos* (or *Videos only*) to include video clips. Photos advance on the slide interval; videos play to the end (or the video time limit) and then advance. Videos in slideshows are always silent. Immich mixed albums work out of the box; local videos are any MP4/WebM/MOV files in the same backgrounds folder.
{% /module %}

{% module type="qr-code" %}
Generates a QR code from any text, URL, or WiFi network credentials.
{% /module %}

{% module type="iframe" %}
Embeds any web page or dashboard. Acts as a universal adapter for Home Assistant, Grafana, Google Sheets, Notion, and any embeddable web content.

{% fields /%}

**About the sandbox list:** what you type is checked before it is applied. Only the 13 standard sandbox tokens are recognized and anything else is ignored. `allow-same-origin` is also dropped whenever `allow-scripts` is set, because that pair lets an embedded page step outside its own sandbox, so if a self-hosted dashboard needs same-origin access, turn the sandbox off entirely rather than combining the two. Only `http` and `https` addresses can be embedded; anything else shows an error in place of the page.

**Note:** Some websites (e.g. YouTube, Yahoo Finance, Twitter) set `frame-ancestors` or `X-Frame-Options` headers that prevent embedding. Self-hosted services, published Google Docs/Sheets, and sites that explicitly support embedding will work.

**Embedding video pages:** Pages that host a video player (a YouTube *embed* URL, a self-hosted stream page) can be shown through this module too. If the player doesn't start with sandbox enabled, the default sandbox permissions (`allow-scripts allow-forms allow-popups`) may need adjusting for that player, or turn the sandbox off. For plain video files, the dedicated **Video** module is simpler.
{% /module %}

{% module type="icon" %}
A single Font Awesome 7 glyph rendered at any size with color, rotation, flip, and optional animation. Useful as a visual accent or status badge alongside other modules. Picker covers the full Free Font Awesome set (solid, regular, brands).

{% fields /%}

**Note:** `style: 'regular'` only renders icons that ship in the regular outline set. If a chosen icon is not in the regular set the codepoint falls back to text, keep `style: 'solid'` unless you've confirmed the icon ships in `fa-regular-400`.
{% /module %}

{% module type="shape" %}
Decorative shapes and dividers for layout polish, the visual equivalent of a horizontal rule, a callout frame, or a star sticker. The `view` field switches between {% $stats.shapeViewCount %} distinct renderers; most options apply only to a subset of views (line variants vs. geometric vs. atmospheric vs. frame).

{% fields /%}

**Sizing:** Default size is 400×80, which gives a comfortable touch/grab target on the editor canvas. The visible glyph (e.g. a 2-px divider line) renders inside that box, the wrapper provides hit area, the line stays thin.
{% /module %}

{% module type="display-control" %}
Touch-friendly on-screen controls for putting a display to sleep or waking it, advancing screens, and adjusting brightness. Dispatches the same commands used by `/remote`: useful for bedside or hallway touchscreens where you want a physical control surface without pulling up a phone. Every button carries a word next to its icon (Previous screen, Next screen, Sleep with "hold for 1 second", Wake, Brightness). The `nav` layout is the pared-back one: only Previous and Next, filling the whole widget.

{% fields /%}

**Behavior:** The `nav` layout puts its two buttons side by side, and stacks them with up and down arrows when the widget is much taller than it is wide. Sleep requires a 1-second hold to confirm; a shorter tap flashes "Keep holding to sleep" over the button. Prev/next buttons are debounced at 200ms to collapse rapid taps. The brightness slider starts at the brightness the target display last reported (a dash until it has reported, or when "All displays" disagree) and commits on release so dragging doesn't spam the hub.

`defaultTarget` is resolved when the module mounts. A display id that doesn't match anything in the registry **silently falls back to `self`**: there's no error, so a typo here looks like the buttons are controlling the wrong screen rather than a broken setting.
{% /module %}

{% module type="traffic" %}
Shows estimated travel times for configured routes.

{% fields /%}

Supports Google Routes API or TomTom as providers. Origins and destinations are address strings.

{% callout type="warning" title="Requires an API key" %}
Add either a **Google Maps** key or a **TomTom** key under **Settings > API keys**. Google is used when both are present.

Without a key the module still shows travel times, but they are randomly generated placeholders rather than real ones. The response is marked `mock: true` if you ever need to confirm which you are looking at.

With TomTom, each origin and destination address is looked up on a map first, so addresses need to be specific enough to find.
{% /callout %}
{% /module %}

{% /module-reference %}

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

**Specific days** narrows a rule to fixed dates: a day of every month (payday on the 15th), a fixed date each year (October 31), the last day of the month (any month, or just one), or the nth weekday of the month — 1st through 5th or the last, so "the 4th Thursday of November" works. Days that don't exist in a month never match: the 31st simply skips shorter months. A rule's other choices (a badge, an outline, a background) then apply to exactly those days.

**Matching an event**: every field you set has to hold (they combine with AND), and a rule with an empty match applies to everything:

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

Rules run from the top of the list down, and **the first rule to set a property wins for that property**: so list order is priority, and a later rule can still fill in something an earlier one left alone.


## Module Styling

Every module supports these style properties, configurable in the Property Panel, except the full-screen modules and Display Control, which paint their own look and have no Style section:

| Property | Type | Default | Description |
|---|---|---|---|
| `opacity` | number | `1` | Module opacity (0–1) |
| `borderRadius` | number | `12` | Corner rounding in pixels |
| `padding` | number | `16` | Inner padding in pixels |
| `backgroundColor` | string | `"rgba(0, 0, 0, 0.4)"` | Background color |
| `textColor` | string | `"#ffffff"` | Text color |
| `fontFamily` | string | `"inter"` | Font id from the built-in font list: `inter`, `roboto`, `poppins`, `system-ui`, `playfair`, `lora`, `dm-serif`, `georgia`, `jetbrains`, `mono`, `bebas`, `caveat`, `pacifico`. Raw CSS font stacks saved by older versions still work |
| `fontSize` | number | `16` | Text size in pixels: the size on most modules, the smallest size on the ones that fit their text to their box (clock, countdown, date, greeting, weather, news, quote, dad joke, word of the day, this day in history, affirmations, sticky note, to-do list, multi-month calendar). Not edited directly any more: the editor's **Text size** slider is a percent, and a module with only this value shows it as a percent of what it shows on its own |
| `textScale` | number |, | **Text size**, a percent (10–450) of what the module shows on its own: the fitted size on the modules that fit their text to their box, the registry base `fontSize` everywhere else. Unset = the stored `fontSize` stands. Setting it in the editor resets `fontSize` to the base |
| `fontWeight` | number |, | Forces every piece of the module's text to one weight (100–900). Unset = each module keeps its own designed weights. Not available for plugin modules |
| `backdropBlur` | number | `12` | Backdrop blur in pixels |
| `borderWidth` | number | `1` | Border width in pixels |
| `borderColor` | string | `"rgba(255, 255, 255, 0.15)"` | Border color |
| `shadowSize` | number | `8` | Box shadow size in pixels |

The **Sticky Note** paints its own paper and ink: its background is the module's `noteColor` setting and its text is always dark, so the editor does not offer `backgroundColor` or `textColor` for it.

These are the values a newly added module starts with. A few modules override some of them on add: the four full-screen modules plus **Shape & Divider** and **Icon** start transparent with no padding, blur, border, or shadow; **Video** and **Web Embed** start with no padding; and **Multi-Month Calendar** and **Chore Chart** start at a larger base font size.

## Settings every module shares

Alongside the options above, every module on a screen carries four instance settings that decide *whether* it renders: an on/off switch, a day-and-time schedule, conditional visibility driven by live values published by add-ons, and a background-provider flag that keeps a module's data loop running while other screens are showing. See the [Configuration reference](/docs/configuration#module-instance) for their exact shape, and the [Editor guide](/docs/editor) for how to set them.
