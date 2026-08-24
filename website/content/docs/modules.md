---
title: Modules
nextjs:
  metadata:
    title: Modules
    description: Overview of the Home Screens module system — how modules work, the 9 categories of built-in modules, and how to add them to your display.
    alternates:
      canonical: /docs/modules
---

A **module** is one widget on your display — a clock, a weather forecast, a calendar grid, a photo slideshow. Home Screens ships with {% $stats.moduleCount %} built-in modules across {% $stats.categoryCount %} categories, and you arrange them by dragging from the module palette onto the canvas in the editor. This page is a short tour of what's available and how to use it.

One of those categories, **Health & Fitness**, is reserved for add-ons and fills in the moment you install a fitness one; the built-in modules occupy the other eight.

Looking for every configuration option? Jump to the **[Module Reference](/docs/module-reference)** — every setting, default value, and allowed option for all {% $stats.moduleCount %} modules.

---

## How modules work

Open the **Editor** and you'll see three surfaces: the **module palette** on the left, the **canvas** in the middle (a portrait 1080×1920 frame by default), and the **property panel** on the right.

1. **Drag** a module from the palette onto the canvas. Each one lands at a sensible size for what it shows, so you don't have to size it yourself, and it can never be dropped off the edge of the canvas.
2. **Resize** it by dragging the bottom-right corner. **Move** it by dragging the module body. Positions snap to a 20-pixel grid while snapping is on, which is what keeps a row of modules lining up.
3. **Click** it to open its settings in the property panel. **Position & Size** and **Style** sit at the top as collapsed headers, the module's own settings open below them, and **Visibility**, **Schedule**, **Conditions**, and a Delete button follow at the bottom.
4. **Schedule** it to appear only on certain days or time windows via the Schedule accordion — handy for "only show the school-morning chore list Mon–Fri, 6–8 am."

Most modules have several **views**: different visual treatments of the same information, picked from a dropdown at the top of the module's settings. Half the catalogue offers more than one, and the clock alone has {% $stats.clockViewCount %}. It is worth flipping through them before deciding a module isn't what you wanted.

Modules persist in `data/config.json` and render the same way on the display as they do in the editor preview. There is no Save button and no publish step: every change saves itself about a second after you stop editing, and the toolbar shows *Saving…* and then a green *Saved*. The display picks the change up on its next check, a few seconds later.

---

## Before some modules will work

Most modules show something useful the moment you drop them on the canvas. A handful need one piece of setup first, and until they get it they show a short "needs setting up" message instead of data.

**Set your location once.** Weather, Moon Phase, Sunrise / Sunset, Air Quality, and Rain Map can't show anything until they know where you are. Set it in **Settings > Weather**, and every one of them picks it up. Greeting and Affirmations work without it but use it, when it's there, to match what they say to the weather outside.

**A few modules need a free account key.** Air Quality needs an OpenWeatherMap key even though it isn't the weather module, Traffic needs Google Maps or TomTom (without one it shows made-up travel times), and Todoist needs your API token. Photo modules only need a key if you point them at an Immich library. Weather needs one only for certain providers, and calendars are set up under **Settings > Calendar** rather than API keys.

The full list of which integration needs which key is in [API keys](/docs/getting-started#api-keys-settings-api-keys).

---

## The {% $stats.categoryCount %} categories

Each category in the palette groups related modules, with a count next to its name. Categories start expanded; click a header to collapse one. There's a search box above the list that matches module names, category names, and internal type names, so typing `iframe` finds the module even though it's labelled Web Embed.

### Full Screen

Ambient, always-on displays that fill the entire canvas. Position, size, and style controls are hidden because these modules always occupy the whole display.

- **Full-Screen Calendar** — 5 views (schedule, week-list, month-grid, day-timeline, agenda), Skylight-inspired
- **Full-Screen Weather** — 5 views (panorama, almanac, ambient, week ahead, hour by hour), with the background tinted by the current conditions and a portrait and landscape layout for each view
- **Full-Screen Chore Chart** — 2 views (the chore board and a rewards store), kid-friendly and ambient
- **Full-Screen Meal Planner** — 4 views for the weekly meal plan
- **Full-Screen Photo Viewer** — digital photo frame with transitions, shuffle, Ken Burns, Immich and iCloud shared-album support, and a single-photo "static wallpaper" mode

All five share one set of six color themes: Linen, Paper, and Mist for light rooms, Charcoal, Midnight, and Slate for dark ones. Pick one per module, or set a default for the whole display in **Settings > Screen**.

### Time & Date

- **Clock** — {% $stats.clockViewCount %} different visual styles (analog, digital, flip, word, etc.)
- **Calendar** — 5 views (daily, agenda, week, multi-week, month) of events from Google, iCloud, or iCal feeds, with classic or colored event styling
- **Countdown** — 2 views; days until a birthday, trip, or deadline
- **Date** — 5 layouts
- **Year Progress** — how much of the year is left as a bar
- **Multi-Month Calendar** — 2 layouts (vertical or horizontal) of a 3-month grid

### Weather & Environment

- **Weather** — {% $stats.weatherViewCount %} views (current, hourly, daily, combined, compact, table, precipitation, alerts) across {% $stats.weatherProviderCount %} providers (OpenWeatherMap, WeatherAPI, Pirate Weather, NOAA, Open-Meteo, Yr.no, SMHI, Met Office, Environment Canada)
- **Moon Phase** · **Sunrise / Sunset** (3 views) · **Air Quality** · **Rain Map**

### News & Finance

- **News Headlines** (RSS, 4 views) · **Stock Ticker** (Yahoo Finance, 4 views) · **Crypto Price** (CoinGecko, 4 views)
- **Sports Scores** (4 views) and **Sports Standings** (3 views) from ESPN, {% $stats.standingsLeagueCount %} leagues

### Knowledge & Fun

- **Dad Joke** · **Quote of the Day** · **Word of the Day** · **This Day in History**

### Personal

- **To-Do List** · **Sticky Note** · **Greeting** · **Todoist** (3 views)
- **Garbage Day** — trash/recycling reminders
- **Affirmations** — 4 views
- **Meal Planner** (5 views) · **Chore Chart** (5 views, rewards, rotation schedules)

### Health & Fitness

- Home to activity and wellness widgets from [plugins](/docs/plugins): the Strava plugin (activity feed, stat tiles, goal rings, training heatmap, route map; note that Strava only lets subscribers create the free developer app this connects through, so it needs an active Strava subscription) and the Garmin plugin (daily summary, Body Battery, sleep, recent activities, weekly training). No built-in modules live here yet — the section appears in the palette once you install a plugin that uses it.

### Media & Display

- **Text** — rich formatting, 13 effects, gradients, marquee
- **Image** · **Video** (library file, direct URL, or YouTube link; loop, optional sound) · **Photo Slideshow** (photos, videos, or both) · **QR Code** (custom or WiFi)
- **Web Embed** (iFrame) — embed any web page (Home Assistant, Grafana, Google Sheets, etc.)
- **Icon** — a single Font Awesome 7 glyph with color, rotation, flip, and animation (spin, beat, bounce, shake)
- **Shape & Divider** — {% $stats.shapeViewCount %} views (dividers, waves, dots, geometric shapes, frames, glow, gradients) for layout polish
- **Display Control** — 3 layouts of touch-friendly sleep / brightness / navigation controls. Drop it on a touchscreen and family members can run the display without a phone

### Travel

- **Traffic / Commute** — live drive times via Google Routes or TomTom

---

## Modules you can touch

If your display is a touchscreen, a handful of modules do more than just show information.

- **Chore Chart** and **Full-Screen Chore Chart** — kids tap a chore to check it off, right on the wall. **On by default.** The Full-Screen version can also show a rewards store where they spend the tickets they've earned.
- **To-Do List** — tap an item to tick it. **Off by default**; turn on *Interactive* in the module's settings. Ticks are kept separately from the list you type in the editor, so editing the list never wipes them, and every display showing the same list stays in step.
- **Todoist** — tap a task to complete it in Todoist itself. **Off by default.**
- **Meal Planner** and **Full-Screen Meal Planner** — tap a meal that has a saved recipe link to get a QR code you scan with your phone, or open the recipe page right on the display.
- **Display Control** — buttons for sleep, brightness, and moving between screens, aimed at this display or another one.

---

## Configuring a module

Selecting a module opens the property panel on the right, grouped into **Position & Size**, **Style**, the module's own settings, then **Visibility**, **Schedule**, and **Conditions**. Clicking empty canvas switches the panel to screen-level settings and the background picker instead.

Numeric fields clamp to sensible ranges and any field with a fixed set of choices becomes a dropdown, so you can't type an invalid value. The [Editor guide](/docs/editor#configuring-modules) covers each section in detail, and the [Module Reference](/docs/module-reference) lists the exact allowed values per module.

---

## Adding new modules

Need something that isn't built in? You have two options:

- **Plugins** — extra modules built by the community. Install with one click from the plugin browser in Settings, or from any HTTPS URL. See the [Plugins guide](/docs/plugins) for details on browsing, installing, and authoring plugins.
- **Custom built-in modules** — if you're forking Home Screens and want to add a module to the core, the [Development guide](/docs/development) has the **Adding a New Module** checklist.

Once installed, a plugin's modules sit right in the same palette with a violet **Plugin** badge, filed under whichever category the plugin declares — including a brand-new category of its own if it asks for one. From there they're placed, styled, scheduled, and switched on and off exactly like built-in modules.

---

## Next steps

- **[Module Reference](/docs/module-reference)** — every option for every built-in module
- **[Editor guide](/docs/editor)** — drag-and-drop, screens, rotation, backgrounds
- **[Profiles & Scheduling](/docs/profiles)** — show different modules at different times of day
- **[Plugins](/docs/plugins)** — build or install third-party modules
