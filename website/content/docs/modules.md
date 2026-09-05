---
title: Modules
nextjs:
  metadata:
    title: Modules
    description: Overview of the Home Screens module system, how modules work, the 9 categories of built-in modules, and how to add them to your display.
    alternates:
      canonical: /docs/modules
---

A **module** is one thing on your display: a clock, a weather forecast, a calendar grid, a photo slideshow. Home Screens ships with {% $stats.moduleCount %} built-in modules across {% $stats.categoryCount %} categories, and you arrange them by dragging from the module palette onto the canvas in the editor. This page is a short tour of what's available and how to use it.

One of those categories, **Health & Fitness**, is reserved for plugins and fills in the moment you install a fitness one; the built-in modules occupy the other eight.

Looking for every configuration option? Jump to the **[Module Reference](/docs/module-reference)**: every setting, default value, and allowed option for all {% $stats.moduleCount %} modules.

---

## How modules work

Open the **Editor** and you'll see three surfaces: the **module palette** on the left, the **canvas** in the middle (a portrait 1080×1920 frame by default), and the **property panel** on the right.

1. **Drag** a module from the palette onto the canvas. Each one lands at a sensible size for what it shows, so you don't have to size it yourself, and it can never be dropped off the edge of the canvas.
2. **Resize** it by dragging the bottom-right corner. **Move** it by dragging the module body. Positions snap to a 20-pixel grid while snapping is on, which is what keeps a row of modules lining up.
3. **Click** it to open its settings in the property panel. **Position & Size** and **Style** sit at the top as collapsed headers, the module's own settings open below them, and **Visibility**, **Schedule**, **Conditions**, and a Delete button follow at the bottom.
4. **Schedule** it to appear only on certain days or time windows via the Schedule accordion, handy for "only show the school-morning chore list Mon–Fri, 6–8 am."

Most modules have several **views**: different visual treatments of the same information, picked from a dropdown at the top of the module's settings. Half the catalogue offers more than one, and the clock alone has {% $stats.clockViewCount %}. It is worth flipping through them before deciding a module isn't what you wanted.

Modules persist in `data/config.json` and render the same way on the display as they do in the editor preview. There is no Save button and no publish step: every change saves itself about a second after you stop editing, and the toolbar shows *Saving…* and then a green *Saved*. The display picks the change up on its next check, a few seconds later.

---

## Before some modules will work

Most modules show something useful the moment you drop them on the canvas. A handful need one piece of setup first, and until they get it they show a short "needs setting up" message instead of data.

**Set your location once.** Weather, Moon Phase, Sunrise / Sunset, Air Quality, and Rain Map can't show anything until they know where you are. Set it once in **Settings > Location & language**, and every one of them picks it up. Greeting and Affirmations work without it but use it, when it's there, to match what they say to the weather outside.

**A few modules need a free account key.** Air Quality needs an OpenWeatherMap key even though it isn't the weather module, Traffic needs Google Maps or TomTom (without one it shows made-up travel times), and Todoist needs your API token. Photo modules only need a key if you point them at an Immich library or a OneDrive folder. Weather needs one only for certain providers, and calendars are set up under **Settings > Calendar** rather than API keys.

### OneDrive photos

Photo Slideshow and Full-Screen Photo Viewer can pull photos straight from a personal OneDrive folder.

1. Create a free app registration: sign in at [portal.azure.com](https://portal.azure.com), open **App registrations**, and choose **New registration**. Give it a name of your choice and pick "Personal accounts only". Leave the Redirect parts empty. Click Register.
2. Open **Manage > Authentication > Settings** and enable **Allow public client flows**. Click Save.
3. Click on **Overview** and Copy the **Application (client) ID** and paste it into the **Microsoft OneDrive** card under **Settings > API keys**.
4. Back in the module's Photo Source picker choose **OneDrive**, click **Sign in with Microsoft**, and enter the shown code at the link on any device (a phone works well). The code works for 15 minutes; if it runs out, start the sign-in again.
5. Pick a folder. Photos come from that folder and every folder inside it. Photos shuffle on every refresh; very large folders use a random sample of 1,000 photos.

If the saved sign-in ever stops working on its own, click **Sign in with Microsoft** again.

The full list of which service needs which key is in [API keys](/docs/calendars#api-keys).

---

## The {% $stats.categoryCount %} categories

Each category in the palette groups related modules, with a count next to its name. Categories start expanded; click a header to collapse one. The search box above the list matches module names and category names, so typing `iframe` finds the module even though it is labelled Web Embed.

Every module below names what it shows, the **views** you can pick from the dropdown at the top of its settings, and what it needs before it works. Every setting, with its exact allowed values, is in the [Module Reference](/docs/module-reference).

### Full Screen

Ambient displays that fill the whole screen. They have no position, size or style controls, and they share one set of twelve colour themes: Linen, Paper, Mist, Sandstone, Vellum and Bloom for light rooms, Charcoal, Midnight, Slate, Aurora, Obsidian and Horizon for dark ones. Pick one per module, or set a default for the whole display under **Settings > Screen**.

- **Full-Screen Calendar** ([reference](/docs/module-reference#full-screen-calendar)): the family's week or month on the whole wall. Views: **Schedule**, **Week list**, **Month grid**, **Day timeline**, **Agenda**, **Family grid** (one row per person), **Up next** and **Free time**. The week list can show planned meals and chore progress too. Needs a [calendar](/docs/calendars); the family grid and free time views also need **People** on the Calendar page.
- **Full-Screen Weather** ([reference](/docs/module-reference#full-screen-weather)): a weather wall, with the background tinted by the sky outside. Views: **Panorama**, **Wide strip** (for a module across the foot of the screen), **Almanac**, **Ambient**, **Week** and **Hourly**, each with a portrait and a landscape layout. Needs a [location](/docs/weather).
- **Full-Screen Chore Chart** ([reference](/docs/module-reference#full-screen-chore-chart)): the chore board for the whole family, grouped by time of day or by person, with each person's tickets and the week's stars. Views: **Chores** and **Rewards store**, where kids browse what their tickets can buy. Needs people and chores from the [family remote](/docs/chores). Kids can check things off on a touchscreen.
- **Full-Screen Meal Planner** ([reference](/docs/module-reference#full-screen-meal-planner)): the week's meals. Views: **Week**, **Today**, **Menu board** and **Next meal**. Needs meals planned from the [family remote](/docs/meals).
- **Full-Screen News** ([reference](/docs/module-reference#full-screen-news)): headlines with their photos. Views: **Story** (one story at a time) and **Front page** (a lead story and five more). Uses the same feed list as the News Headlines tile; see the [News](/docs/news) page.
- **Full-Screen Photo Viewer** ([reference](/docs/module-reference#full-screen-photo-viewer)): a digital photo frame with transitions, shuffle and a slow Ken Burns drift, from your own library, Immich, OneDrive or an iCloud shared album, or a single photo as a fixed wallpaper. Needs photos; see [Photos and backgrounds](/docs/backgrounds). Putting one on a screen also switches on the family remote's Photos tab.

### Time & Date

- **Clock** ([reference](/docs/module-reference#clock)): {% $stats.clockViewCount %} looks, from **Classic**, **Digital** and **Analog** to **Flip**, **Word**, **Binary**, **Neon** and **World**. Follows the display's 12 or 24-hour setting or picks its own, seconds on or off, and an optional date line. Needs nothing.
- **Calendar** ([reference](/docs/module-reference#calendar)): the next few days of events in a tile. Views: **Daily**, **Agenda**, **Week**, **Multi-week** and **Month**, with classic or coloured event styling. Needs a [calendar](/docs/calendars).
- **Countdown** ([reference](/docs/module-reference#countdown)): days until a birthday, a trip or the last day of school. Add as many events as you like; views **All** or just the **Next** one. Needs nothing.
- **Date** ([reference](/docs/module-reference#date)): today's date in five layouts: **Full**, **Minimal**, **Stacked**, **Editorial** and **Banner**. Needs nothing.
- **Year Progress** ([reference](/docs/module-reference#year-progress)): how much of the year has gone, as a bar. Needs nothing.
- **Multi-Month Calendar** ([reference](/docs/module-reference#multi-month-calendar)): a three-month grid, **Vertical** or **Horizontal**, with today marked. Needs nothing.

### Weather & Environment

All of these use the location under **Settings > Location & language**; see [Weather](/docs/weather).

- **Weather** ([reference](/docs/module-reference#weather)): the forecast in {% $stats.weatherViewCount %} views: **Current**, **Hourly**, **Daily**, **Combined**, **Compact**, **Table**, **Precipitation** and **Alerts**. A **Weather source** setting picks a provider other than the default. Works with no key on the default provider.
- **Moon Phase** ([reference](/docs/module-reference#moon-phase)): tonight's moon, its name and how much of it is lit.
- **Sunrise / Sunset** ([reference](/docs/module-reference#sunrise-sunset)): today's sunrise and sunset. Views: **Default**, **Arc** and a 24-hour **Circle**.
- **Air Quality** ([reference](/docs/module-reference#air-quality)): the air quality index and its parts. Needs an OpenWeatherMap key on the Weather page, whichever weather provider you use.
- **Rain Map** ([reference](/docs/module-reference#rain-map)): an animated rain radar centred on your home. Works with no key.

### News & Finance

- **News Headlines** ([reference](/docs/module-reference#news-headlines)): stories from any site, blog, YouTube channel or subreddit, several feeds at once. Views: **Headline**, **List**, **Ticker**, **Compact** and **Cards**. The [News](/docs/news) page covers feeds and family-friendly filters. Needs nothing.
- **Stock Ticker** ([reference](/docs/module-reference#stock-ticker)): prices for the symbols you list. Views: **Cards**, **Ticker**, **Table**, **Compact** and **Single**. Needs nothing.
- **Crypto Price** ([reference](/docs/module-reference#crypto-price)): the same for coins. Views: **Cards**, **Ticker**, **Table** and **Compact**. Needs nothing.
- **Sports Scores** ([reference](/docs/module-reference#sports-scores)): live and recent scores for your teams. Views: **Scoreboard**, **Cards**, **List** and **Ticker**. Needs nothing.
- **Sports Standings** ([reference](/docs/module-reference#sports-standings)): league tables for {% $stats.standingsLeagueCount %} leagues. Views: **Table**, **Compact** and **Conference**. Needs nothing.

### Knowledge & Fun

- **Dad Joke** ([reference](/docs/module-reference#dad-joke)), **Quote of the Day** ([reference](/docs/module-reference#quote-of-the-day)), **Word of the Day** ([reference](/docs/module-reference#word-of-the-day)) and **This Day in History** ([reference](/docs/module-reference#this-day-in-history)): one fresh item each, refreshed on a schedule you set. All need nothing.

### Personal

- **To-Do List** ([reference](/docs/module-reference#to-do-list)): a list you type in the editor. Turn on **Interactive** and it can be ticked off on a touchscreen; ticks are kept apart from the list itself, so editing the list never clears them. Needs nothing.
- **Todoist** ([reference](/docs/module-reference#todoist)): your Todoist tasks. Views: **List**, **Board** and **Focus**. Needs a Todoist token on the API keys page.
- **Sticky Note** ([reference](/docs/module-reference#sticky-note)): a note for the family. Needs nothing.
- **Greeting** ([reference](/docs/module-reference#greeting)): "Good morning, Taylor" and a line for the time of day. Needs nothing.
- **Garbage Day** ([reference](/docs/module-reference#garbage-day)): trash, recycling and yard-waste reminders on the schedule you set, with a warning the night before. Needs nothing.
- **Affirmations** ([reference](/docs/module-reference#affirmations)): a kind line for the day in four views: **Elegant**, **Card**, **Minimal** and **Typewriter**. Needs nothing.
- **Meal Planner** ([reference](/docs/module-reference#meal-planner)): this week's meals in a tile. Views: **Week**, **Today**, **Next meal**, **Compact** and **List**. Needs meals from the [family remote](/docs/meals).
- **Chore Chart** ([reference](/docs/module-reference#chore-chart)): today's chores in a tile. Views: **Board** (a column per person), **Star chart** (the week), **Today**, **Progress** (a bar per person) and **Compact**. Needs people and chores from the [family remote](/docs/chores). Kids can check things off on a touchscreen.

### Health & Fitness

- Home to activity and wellness modules from [plugins](/docs/plugins): the Strava plugin (activity feed, stat tiles, goal rings, training heatmap, route map; note that Strava only lets subscribers create the free developer app this connects through, so it needs an active Strava subscription) and the Garmin plugin (daily summary, Body Battery, sleep, recent activities, weekly training). No built-in modules live here yet; the section appears in the palette once you install a plugin that uses it.

### Media & Display

- **Text** ([reference](/docs/module-reference#text)): any words, with rich formatting, gradients, thirteen effects and a scrolling marquee. Needs nothing.
- **Image** ([reference](/docs/module-reference#image)): one picture from your library or a link. **Video** ([reference](/docs/module-reference#video)): a video from your library, a direct link or YouTube, looping, with or without sound.
- **Photo Slideshow** ([reference](/docs/module-reference#photo-slideshow)): photos, videos or both from a folder in your library, Immich, OneDrive or an iCloud shared album. See [Photos and backgrounds](/docs/backgrounds).
- **QR Code** ([reference](/docs/module-reference#qr-code)): any link, or your WiFi so guests can join by scanning. Needs nothing.
- **Web Embed** ([reference](/docs/module-reference#web-embed-i-frame)): any web page in a tile: a Home Assistant dashboard, a Grafana chart, a Google Sheet. Needs a page that allows being embedded.
- **Icon** ([reference](/docs/module-reference#icon)): a single Font Awesome icon with colour, rotation and a spin, beat, bounce or shake. **Shape & Divider** ([reference](/docs/module-reference#shape-and-divider)): {% $stats.shapeViewCount %} views of lines, waves, dots, frames, glows and gradients for tidying a layout.
- **Display Control** ([reference](/docs/module-reference#display-control)): touch buttons for sleep, brightness and moving between screens, aimed at this display, another one by name, or all of them. Three layouts: **Bar**, **Pad** and **Panel**. For touchscreens.

### Travel

- **Traffic / Commute** ([reference](/docs/module-reference#traffic-commute)): live drive times for the trips you set up. Needs a Google or TomTom key on the API keys page; without one it shows made-up times so you can see the layout.

---

## Modules you can touch

If your display is a touchscreen, a handful of modules do more than just show information.

- **Chore Chart** and **Full-Screen Chore Chart**: kids tap a chore to check it off, right on the wall. **On by default.** The Full-Screen version can also show a rewards store where they spend the tickets they've earned.
- **To-Do List**: tap an item to tick it. **Off by default**; turn on *Interactive* in the module's settings. Ticks are kept separately from the list you type in the editor, so editing the list never wipes them, and every display showing the same list stays in step.
- **Todoist**: tap a task to complete it in Todoist itself. **Off by default.**
- **Meal Planner** and **Full-Screen Meal Planner**: tap a meal that has a saved recipe link to get a QR code you scan with your phone, or open the recipe page right on the display.
- **News Headlines** and **Full-Screen News**: tap a story to get a QR code that opens it on your phone, or the story's summary. **On by default**; change or turn it off under *When a story is tapped*.
- **Display Control**: buttons for sleep, brightness, and moving between screens, aimed at this display or another one.

---

## Configuring a module

Selecting a module opens the property panel on the right, grouped into **Position & Size**, **Style**, the module's own settings, then **Visibility**, **Schedule**, and **Conditions**. Clicking empty canvas switches the panel to screen-level settings and the background picker instead.

Numeric fields clamp to sensible ranges and any field with a fixed set of choices becomes a dropdown, so you can't type an invalid value. The [Editor guide](/docs/editor#configuring-modules) covers each section in detail, and the [Module Reference](/docs/module-reference) lists the exact allowed values per module.

---

## Adding new modules

Need something that isn't built in? You have two options:

- **Plugins**: extra modules such as Home Assistant, Garmin and Strava. Install with one click from the **Plugins** button in the editor toolbar, or from a link. See the [Plugins guide](/docs/plugins) for installing them and [Plugin development](/docs/plugin-development) for writing one.
- **Custom built-in modules**: if you're forking Home Screens and want to add a module to the core, the [Development guide](/docs/development) has the **Adding a New Module** checklist.

Once installed, a plugin's modules sit right in the same palette with a violet **Plugin** badge, filed under whichever category the plugin declares, including a brand-new category of its own if it asks for one. From there they're placed, styled, scheduled, and switched on and off exactly like built-in modules.

---

## Next steps

- **[Module Reference](/docs/module-reference)**: every option for every built-in module
- **[Editor guide](/docs/editor)**: drag-and-drop, screens, rotation, backgrounds
- **[Profiles & Scheduling](/docs/profiles)**: show different modules at different times of day
- **[Plugins](/docs/plugins)**: build or install third-party modules
