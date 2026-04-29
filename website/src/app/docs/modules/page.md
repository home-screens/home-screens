---
title: Modules
nextjs:
  metadata:
    title: Modules
    description: Overview of the Home Screens module system — how modules work, the 8 categories of built-in modules, and how to add them to your display.
    alternates:
      canonical: /docs/modules
---

A **module** is one widget on your display — a clock, a weather forecast, a calendar grid, a photo slideshow. Home Screens ships with 39 built-in modules across 8 categories, and you arrange them by dragging from the module palette onto the canvas in the editor. This page is a short tour of what's available and how to use it.

Looking for every configuration option? Jump to the **[Module Reference](/docs/module-reference)** — every setting, default value, and allowed option for all 39 modules.

---

## How modules work

Open the **Editor** and you'll see three surfaces: the **module palette** on the left, the **canvas** in the middle (a portrait 1080×1920 frame by default), and the **property panel** on the right.

1. **Drag** a module from the palette onto the canvas.
2. **Resize** it by dragging the bottom-right corner. **Move** it by dragging the module body.
3. **Click** it to open its settings in the property panel. Module-specific options on top, style (opacity, colors, font, blur) below.
4. **Schedule** it to appear only on certain days or time windows via the Schedule accordion — handy for "only show the school-morning chore list Mon–Fri, 6–8 am."

Modules persist in `data/config.json` and render the same way on the display as they do in the editor preview. There is no publish step — hit **Save** and the display picks up the change on its next poll (every few seconds).

---

## The 8 categories

Each category in the palette groups related modules. Click a category header to expand.

### Full Screen

Ambient, always-on displays that fill the entire canvas. Position, size, and style controls are hidden because these modules always occupy the whole display.

- **Fullscreen Calendar** — five views (schedule, week-list, month-grid, day-timeline, agenda), Skylight-inspired
- **Fullscreen Chore Chart** — kid-friendly ambient chore surface
- **Fullscreen Meal Planner** — four views for the weekly meal plan
- **Fullscreen Photo Viewer** — digital photo frame with transitions, shuffle, Ken Burns, Immich support, and a single-photo "static wallpaper" mode

### Time & Date

- **Clock** — 18 different visual styles (analog, digital, flip, word, etc.)
- **Calendar** — compact Google/iCal event list
- **Countdown** — days until a birthday, trip, or deadline
- **Date** — 5 layouts
- **Year Progress** — how much of the year is left as a bar
- **Multi-Month Calendar** — 3-month grid

### Weather & Environment

- **Weather** — 8 views (current, forecast, hourly, etc.) across 9 providers (OpenWeatherMap, WeatherAPI, Pirate Weather, NOAA, Open-Meteo, Yr.no, SMHI, Met Office, Environment Canada)
- **Moon Phase** · **Sunrise / Sunset** · **Air Quality** · **Rain Map**

### News & Finance

- **News** (RSS) · **Stock Ticker** (Yahoo Finance) · **Crypto** (CoinGecko)
- **Sports Scores** and **Standings** (ESPN, 12 leagues)

### Knowledge & Fun

- **Dad Joke** · **Quote** · **Word of the Day** · **This Day in History**

### Personal

- **To-Do** · **Sticky Note** · **Greeting** · **Todoist**
- **Garbage Day** — trash/recycling reminders
- **Affirmations** — 4 views
- **Meal Planner** (5 views) · **Chore Chart** (5 views, rewards, rotation schedules)

### Media & Display

- **Text** — rich formatting, gradients, marquee
- **Image** · **Photo Slideshow** · **QR Code** (custom or WiFi)
- **iFrame** — embed any web page (Home Assistant, Grafana, Google Sheets, etc.)
- **Display Control** — touch-friendly wake / sleep / brightness / navigation controls. Drop it on a touchscreen and family members can run the display without a phone

### Travel

- **Traffic / Commute** — live drive times via Google Routes or TomTom

---

## Configuring a module

The property panel groups a module's options into labeled sections so dense modules (like the clock or chore chart) stay scannable.

- **Module settings** — fields specific to this module type (e.g. a clock's 24-hour toggle, a weather module's provider + location)
- **Style** — opacity, border radius, padding, background color, text color, font family/size, backdrop blur, shadow — applies to every module
- **Schedule** — optional day-of-week and time-window filter. Invert the toggle to *hide* during the window instead of show
- **Background** (when no module is selected) — per-screen background image picker

Numeric fields clamp to sensible ranges, and any field with a fixed set of choices becomes a dropdown — so you can't accidentally type an invalid value. The reference page lists the exact allowed values for each module.

---

## Adding new modules

Need something that isn't built in? You have two options:

- **Plugins** — extra modules built by the community. Install with one click from the plugin browser in Settings, or from any HTTPS URL. See the [Plugins guide](/docs/plugins) for details on browsing, installing, and authoring plugins.
- **Custom built-in modules** — if you're forking Home Screens and want to add a module to the core, the [Development guide](/docs/development) has the 8-step "Adding a module" checklist.

---

## Next steps

- **[Module Reference](/docs/module-reference)** — every option for every built-in module
- **[Editor guide](/docs/editor)** — drag-and-drop, screens, rotation, backgrounds
- **[Profiles & Scheduling](/docs/profiles)** — show different modules at different times of day
- **[Plugins](/docs/plugins)** — build or install third-party modules
