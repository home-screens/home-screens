---
title: Editor Guide
nextjs:
  metadata:
    title: Editor Guide
    description: Drag-and-drop visual editor for Home Screens, add modules, customize styles, manage screens, and configure schedules.
    alternates:
      canonical: /docs/editor
---

The editor is where you design what the wall shows. Open it at `/editor` on a laptop; it needs a wide window. New here? [Your first screen](/docs/first-screen) walks through the first ten minutes. {% .lead %}

## Layout

{% screenshot name="editor-areas" caption="1 screens, 2 modules, 3 your screen, 4 settings for what you picked, 5 the toolbar." /%}

- **Screen tabs** (top): one tab per screen. The wall cycles through them in order.
- **Module palette** (left): every module you can add, in groups. Drag one onto the screen.
- **Canvas** (middle): the screen you are designing, at the wall's own shape.
- **Property panel** (right): settings for whatever you clicked. Click empty canvas and it shows the screen's own settings and its background instead.
- **Toolbar** (top right): **Plugins** opens the plugin browser, **Settings** opens the settings pages, and **Preview** opens the screen you are editing in a new tab at full size. A small indicator beside them shows **Saving…** or **Saved**, and offers **Retry** if a save ever fails.

## Appearance

The settings header has a **theme toggle** that cycles through **Dark**, **Light**, and **System** (follow the OS preference). The choice is remembered on that browser. The editor and the family remote each remember their theme separately, so setting the editor to Light does not change what the remote looks like on your phone.

## Display Switcher (multi-display)

As soon as you add a second display, a **Display Switcher** pill appears in the editor toolbar showing the current display's name and size. (Adding a display also creates a **main** display alongside it, holding what you had before, so you will usually see two entries right away.) Click it to switch to any display; the canvas, screen tabs, and property panel all switch to that display's screens. The pill is hidden while you have one display. See the [Multi-display guide](/docs/multi-display).

## Canvas Controls

The editor canvas includes a floating toolbar with controls for zoom, undo/redo, and snap-to-grid.

### Zoom & Pan

The canvas supports zooming from 20% to 400% in fixed steps (20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 300, 400):

- **Trackpad pinch** or **Ctrl+Scroll**: zoom in/out centered on the cursor, stepping through the same fixed increments
- **Zoom buttons**: use the **+** and **−** buttons in the floating toolbar
- **Keyboard**: `Cmd+=` / `Ctrl+=` to zoom in, `Cmd+-` / `Ctrl+-` to zoom out, `Cmd+0` / `Ctrl+0` to fit
- **Fit to screen**: click the fit button to reset zoom so the entire canvas is visible. The button only appears while you are zoomed in or out; at 100% there is nothing to fit
- The current zoom percentage is displayed in the toolbar

When zoomed in beyond the viewport, the canvas becomes scrollable.

### Undo & Redo

All canvas changes (moving, resizing, adding, deleting, and configuring modules) are tracked with a 50-step history:

- **Undo**: `Cmd+Z` (macOS) or `Ctrl+Z` (Windows/Linux), or click the undo button in the toolbar
- **Redo**: `Cmd+Shift+Z` / `Ctrl+Y`, or click the redo button in the toolbar

Rapid edits of the same type (e.g., dragging a module) are coalesced into a single history entry so undo steps feel natural.

### Snap to Grid

A toggle button in the floating toolbar controls grid snapping:

- **Enabled** (default), modules snap to a 20px grid when dragging and resizing; a dot grid overlay is shown on the canvas
- **Disabled**: modules snap to pixel-level precision; the grid overlay is hidden

### Minimum Width

The editor requires a minimum viewport width of 768px. On smaller screens, a message prompts you to use a wider window or device.

## Adding Modules

1. Open the **Module Palette** on the left
2. Browse by category or use the search bar to find a module
3. Click and drag a module onto the canvas
4. Drop it where you want it, modules snap to a 20px grid (when snap is enabled)

Categories in the palette are collapsible. Click a category header to expand or collapse it.

## Selecting & Moving Modules

- **Click** a module on the canvas to select it
- **Drag** a selected module to reposition it
- **Resize** by selecting the module first, then dragging the small square handle at its bottom-right corner. That handle is the only way to resize, and it appears only while the module is selected. Modules can't be made smaller than 40 × 40
- **Delete** by selecting the module and clicking **Delete Module** at the bottom of the Property Panel. You'll be asked to confirm first. The Delete key does nothing on the canvas
- Position and size can also be set precisely using the X, Y, W, H fields in the Property Panel

When modules overlap, **click the same spot again** to cycle through the modules stacked under it, so a covered module is always reachable. To change which module draws on top, select it and use the **Bring to Front** and **Send to Back** buttons near the bottom of the Property Panel, each button is disabled once the module is already at that end of the stack.

## Configuring Modules

Select a module to open its settings in the **Property Panel** on the right. Related fields are grouped into labeled blocks sharing a visual container, so the panel stays scannable even on dense modules like the clock or chore chart. Each block is a collapsible section, so the panel shows only what you're actively editing.

### Property Panel

The panel has two operating states:

- **Module selected**: collapsible sections in this order: **Position & Size**, **Style**, **Config** (the module's own options), then for plugins **Connection** and **Secrets**, and finally **Visibility**, **Schedule**, and **Conditions**. A **Delete Module** button sits at the bottom. The Background picker is hidden while a module is selected, so the panel stays focused on the module's own fields.
- **No module selected**: the panel shows **Screen settings** (the screen's name and module count, a rotation-duration override, and a schedule for the screen itself), followed by the Background picker for the current screen. You can set rotation, screen schedules, and backgrounds without first dropping a module on the canvas.

Full-screen modules (full-screen calendar, chore chart, meal planner, and photo) always fill the whole screen, so they have no Position & Size or Style sections at all.

### Module Settings

Each module type has its own configuration options. For example:

- **Clock**: toggle 24-hour format, seconds, date display
- **Countdown**: add/remove events with labels and dates
- **To-Do**: add/edit/check off items
- **News**: set the RSS feed URL
- **Stock Ticker**: enter comma-separated stock symbols
- **Display Control**: pick layout (bar / pad / panel), default target (self / all / specific display), allow runtime retargeting

See the [Module Reference](/docs/module-reference) for all available options.

### Style Settings

Every module can be styled except the full-screen ones and Display Control, which draw their own look and have no Style section. The controls are grouped into four blocks:

**Shape**

- **Border Radius**: round the corners (0–50)
- **Padding**: add inner spacing (0–64)
- **Border Width**: draw an outline around the module (0–4)

**Effects**

- **Opacity**: fade the module (0–1, in steps of 0.05)
- **Backdrop Blur**: apply a frosted glass effect behind the module (0–40)
- **Shadow Size**: drop a soft shadow behind the module (0–48)

**Color**

- **Background**: set the module's background (supports transparency via rgba)
- **Border Color**: the color of the outline set by Border Width
- **Text Color**: set the text color

**Text**

- **Card Title**: show a centered title at the top of the module. The title sits on the module card, above its content, and is cut off with an ellipsis when it is too long to fit. Leave it empty for no title. Some modules (like the to-do list) also show a title of their own from their settings; setting both means you will see both
- **Title Size**: set the title's font size (8–72). It appears once a title is set and starts at the module's font size, so leaving the slider alone keeps them matched; use Reset to default to match the font size again. Clearing the title clears this too
- **Font Size**: set the text size (8–72). Some modules (the clock, date, weather, news, quote and a few others) already fit their text to the size of their box; for those, this makes that fitted text bigger or smaller. For every other module the text stays at this size no matter how big the box is. The slider says which of the two the selected module does
- **Font Weight**: make all of the module's text lighter or bolder (100–900). Leave it on Default to keep the module's built-in look, and use Reset to default to go back. The title always stays at its normal weight
- **Font Family**: choose from available fonts

## Managing Screens

The display can rotate through multiple screens automatically. Most screen actions are on the menu you get by right-clicking a screen tab.

{% screenshot name="editor-screen-tab-menu" caption="Right-click a screen tab." /%}

### Adding a Screen

Click the **+** button in the Screen Tabs and choose **Blank Screen** to start from scratch, **From Template…** to start from a pre-built layout, or **From File…** to bring in a layout someone shared with you (or one you exported earlier) as new screens on the current display. Importing this way only adds screens; the ones you already have are left alone. Each screen has its own set of modules and background.

### Enabling and Disabling a Screen

Right-click a screen tab to open the context menu and choose **Disable** or **Enable**. Disabled screens remain fully configurable in the editor but are excluded from display rotation -- the display skips them entirely.

- Disabled tabs appear dimmed with a **⊘** icon next to the name
- Profile screen lists show an amber "(disabled)" label for disabled screens
- Setting a screen to disabled is non-destructive -- all modules and settings are preserved and the screen can be re-enabled at any time

This is useful for temporarily hiding a screen (e.g., a seasonal or holiday screen) without deleting it.

### Renaming a Screen

Right-click a screen tab to open the context menu and choose **Rename**, or double-click the tab name.

### Reordering Screens

Drag screen tabs left or right to reorder them. You can also right-click a tab and choose **Move Left** or **Move Right** from the context menu. Screen order determines the rotation sequence on the display.

### Exporting a Single Screen

Right-click a screen tab and choose **Export This Screen** to save just that screen's layout to a file. Useful for sharing one screen with someone else without handing over your whole configuration.

### Removing a Screen

Right-click a screen tab and choose **Delete**, or click the small **x** on the tab itself. Either way you are asked to confirm. You must have at least one screen, so the last one can't be deleted.

### Scheduling a Screen

A whole screen can come and go on a schedule, the same way an individual module can:

1. Click an empty area of the canvas to deselect any module
2. Open **Screen settings** in the Property Panel
3. Set the days of the week and the time window

Outside that window the display skips the screen in rotation, exactly as if you had disabled it, but it turns itself back on automatically. A scheduled tab shows a small clock icon, and hovering it says "scheduled". Handy for a school-morning screen or a weekend-only photo screen.

### Screen Rotation

The global rotation interval lives in **Settings > Screen > Rotation & appearance**. Screens cycle in order at this interval. The display view shows small indicator dots at the bottom.

Any screen can have its own time. Click an empty area of the canvas, then under **Screen settings** click **Use a different time** and set it, or reset to go back to the shared default. A screen with its own time shows a small pill on its tab (for example `10s`) so you can see it at a glance.

Setting a screen's time to **0** makes it **sticky**: the wall stays on that screen until something moves it along (the family remote, a Display Control module, or a swipe). The tab shows an amber `0s` pill as a warning. Useful for a dinner timer or a guest-mode photo frame.

### Screen Transitions

Screen transitions control the visual effect when cycling between screens. There are 8 transition effects available:

- **fade**: smooth opacity crossfade (default)
- **slide**: horizontal slide left/right
- **slide-up**: vertical slide upward
- **zoom**: scale in/out
- **flip**: 3D card flip
- **blur**: blur out and in
- **crossfade**: overlapping crossfade
- **none**: instant switch with no animation

The transition effect and duration are configurable in **Settings > Screen**. The default duration is 0.6 seconds.

## Backgrounds

Click an empty area of the canvas to deselect any module; the **Background** section appears in the right sidebar only when no module is selected.

### Upload a Background

1. Switch to the **Local** tab and click **Upload Background**
2. Pick an image file from your computer
3. Images are stored in `public/backgrounds/`
4. Maximum file size: 10 MB per image
5. Supported image formats: JPEG, PNG, WebP, GIF, AVIF

Backgrounds are still images only. Videos live in the same library but are picked from a photo or video module's settings, not from here.

You can also fill your library from Apple Photos, using **Import from an iCloud link** to download everything a shared album link (or a "Copy iCloud Link" photo link) contains. That button lives in the media library browser, which opens from the settings of an Image, Video, Photo slideshow, or Full-screen photo module. Anything you import there lands in the same library the background picker's Local tab reads from. See the [Backgrounds guide](/docs/backgrounds#i-cloud-shared-albums) for details.

### Unsplash Integration

If you've set an Unsplash access key in Settings, you can:

- Browse and select from Unsplash photos
- Enable background rotation to automatically cycle through Unsplash images

### Per-Screen Backgrounds

Each screen can have its own background image. Select a screen tab, deselect any module, then choose a background.

## Global Settings

Open the **Settings Panel** to configure system-wide options. Pages are grouped under four headers:

- **Screen**: Screen (rotation, appearance, sleep, and alerts) and Location & language
- **Content**: Weather, Calendar, Meals, On your phone, and API keys
- **Automation**: Profiles, Rules, and Shared state (three tabs on one page)
- **Maintenance**: Security, Network, System & updates, Backups & data, and Status

{% screenshot name="settings-screen" caption="Settings, with the four groups in the sidebar. The search box at the top finds any field by name." /%}

Rather than documenting every field here, the fastest way to find one is the **search box at the top of the sidebar**: it matches individual setting names as well as page titles, so searching "brightness" or "timezone" jumps straight to that field and briefly highlights it, even if you don't know which page it lives on. What follows is the behaviour you can't infer from the labels.

### Defaults vs Per display

As soon as you register a second display, the sidebar splits into two groups:

- **Defaults**: the same pages as above, holding the shared source-of-truth values that apply to *every* display until a specific one overrides them. Each Defaults page shows a backlink banner listing which displays currently override its fields, with one click to jump there.
- **Per display**: one page per registered display, plus an **All displays** landing page holding the adoption card grid. Each display page has two sub-tabs: **Overview** (profile, identity, adoption info) and **Overrides** (screen, sleep, and alert settings). Every field that can inherit shows an **Override** button, and once overridden a **Reset to default** button, so you can always tell whether a value is this display's own or borrowed.

Resolution, rotation, and flip are the exception: every display has its own physical screen, so those are plain inputs with nothing to inherit. For the same reason, the orientation, resolution, and flip controls on the **Defaults > Screen** page only appear in single-display installs.

Multi-display features (the sidebar split, the Displays page, the Display Switcher pill, the remote's **Send to** row) stay hidden until you add a display. See the [Multi-display guide](/docs/multi-display) for the full setup.

### Screen

Three tabs: **Rotation & appearance**, **Sleep & dimming**, and **Alerts**. Most controls are self-explanatory sliders and dropdowns; these are the ones that aren't:

- **Sleep & dimming** is grouped into three sections, inactivity dimming ("Dim after a few quiet minutes"), the daily schedules ("Dim in the evening" and "Turn off overnight"), and the dimmed appearance, with a 24-hour preview bar showing when the display will be bright, dimmed, or off. Turn the inactivity toggle off to keep full brightness all day while a schedule handles the night.
- **Dim and sleep schedules** support overnight spans, `23:00–06:00` works and wraps past midnight as you'd expect.
- **After a wake-up, stay on for** (shown when a schedule is on), how long the display stays awake when someone touches it or wakes it from the remote during a scheduled dim or sleep window, before the schedule takes over again. Defaults to 5 minutes; set it to the minimum for the old behavior of going right back to sleep.
- **Screensaver** picks what shows during the *dimmed* state, before full sleep: a drifting clock, blank, or off (no clock, the display still dims).
- **Touchscreen Pause** (on by default), double-tapping the active pagination dot on the display pauses screen rotation; double-tap again to resume. An optional auto-resume timeout (default 5 minutes) restarts rotation on its own.
- **Swipe to change screens** (on by default), flick left anywhere on the display for the next screen, or right for the previous one. Vertical swipes are left alone so scrolling content like the chore chart keeps working.
- **Theme** sets the color scheme used by the full-screen modules, not the editor.

Sleep and dimming draw a black layer over the page rather than powering the panel down, so a dimmed display is still backlit. That distinction matters when [diagnosing a black screen](/docs/troubleshooting#display-is-blank).

### Location & language

- **Your town or zip code**: type it and click **Look up**, or click **Use my internet location** to guess from your connection. Every module that needs a location (weather, sunrise, moon, air quality, rain map, local news) uses this one. **Edit coordinates manually** takes exact numbers.
- **Timezone** follows the town you pick; change it only if the clocks look wrong. **Clock check** shows the browser's time and the Pi's side by side so you can tell.
- **Language** sets the words on the editor, every display and the family remote. **More options** holds a separate formatting locale for dates and numbers, for English text with European date order.
- **Time format** picks 12-hour or 24-hour for every time the display shows: calendar events, weather, sports, sunrise and sunset, moon rise and set, the full-screen photo clock and Todoist due times. It is also the default the meal planner follows. The clock module keeps its own setting.

### Weather

Units are a segmented control at the top; each of the {% $stats.weatherProviderCount %} providers is a card below with its own inline key field, a **Test** button, and a **Set as default** action. The status pill reads **Ready**, **Configured**, or **Needs setup**, with **Default ·** in front of the active one.

Which provider to pick, and which need a key, is covered on the [Weather](/docs/weather) page.

### Calendar

Two areas. **What to show** has **Days Ahead**, the furthest any calendar module looks, and **Hide events you declined** (Google only). **Where events come from** lists the ways in:

- **Google Calendar**: **Sign in with Google** once your Google login is on the API keys page, then **Select calendars to display**.
- **iCloud Calendar**: **Add iCloud account** with an app-specific password, pick calendars, and optionally **Birthdays** from your contacts.
- **iCal / ICS feeds**: **Add Feed**, paste the link, name it, pick a colour. Each row says **Updated** a moment ago or **Not updating**, so a feed that quietly broke is visible here.
- **Public Holidays** for a country, **People** (name, colour, and which calendars are theirs, used by the full-screen calendar's family grid and free time views), and **Source status** for every source at once.

The walkthroughs for all three ways in, and how to choose, are on the [Calendars](/docs/calendars) page.

### On your phone

The two phone addresses (the kids' chores page and the family remote) with QR codes, a **Print** button, and the switch that puts a password on the family remote. See [On your phone](/docs/remote-control).

### API keys

Keys and logins that unlock extra content, one card per service, each showing whether it is set up. They are stored on the Pi and never sent anywhere else. Weather keys are the exception and live on their provider's card under **Settings > Weather**.

Which service needs which key is listed under [API keys](/docs/calendars#api-keys). Two gotchas worth repeating:

- **TomTom**: the Geocoding, Reverse Geocoding, and Routing APIs must be enabled **on the key itself**, not just on your account, or the traffic module fails with an unhelpful error.
- **GitHub token**: only appears when **Show advanced options** is on (System & updates).

### Security

The editor has no password until you set one. Once set, it covers the editor and the family remote; the display signs in on its own with a display key, and the kids' chores page deliberately stays open.

- **No password yet** and a **Set a password** button is the starting state. With a password on, the page offers **Change password**, **Turn the password off**, **Sign out**, and **Sign everyone out**, which ends every session on every device.
- **Remember me** on the login page gives a 90-day session instead of 30.
- **Display key** is the long string displays and bookmarked commands use instead of the password. **Reveal**, **Copy**, or **Make a new key**; each display reloads once to pick up a new one.
- **Forgot the password?** Run `home-screens-reset-password` on the Pi and set a new one. The login page says the same.

#### Allowed networks

Two switches over one list of network ranges (most home networks are `192.168.1.0/24`). **Let these networks in without the password** skips the login for devices on them; **Only allow these networks** blocks everything else, apart from the login page. Your own address is shown above the list, and turning on the second switch without your address in the list gets a **You may lock yourself out** warning with **Save anyway**.

Two things to know: addresses with colons (IPv6) never match, so add the IPv4 range and connect over IPv4; and behind a reverse proxy the check reads the proxy's forwarded-for header, so make sure the proxy sets it rather than passing a client's own through.

### Backups & data

- **Save a copy**: **Save a backup** downloads everything, chores and meals included. Tick **Include my keys and connected accounts** to add them, and **Protect them with a password** to lock them inside the file ([details](/docs/configuration#backing-up-your-keys)). **Restore from a file** puts a backup back; a locked backup asks for its password and offers **Restore without my keys**.
- **Share Layout**: **Export Layout** writes only screens and modules, with no personal data, and is the safe one to hand to someone else. **Import Layout** brings one in as new screens.
- **Templates**: **Browse Templates** starts a screen from a ready-made layout while keeping your settings.
- **Automatic snapshots** are taken before every update, each with **Download** and **Restore**.
- **Backup Reminder**: **Remind me if I haven't backed up**, with **Remind after** a number of days.

### Status

A live page: the display's state, current screen and last check-in; **Storage** and **Memory**; **CPU & Thermal** (Pi model, load, throttling and temperature, from the hub itself or a display's reporter); **Home Screens data**; **Configuration** counts with a **Module breakdown**; **Integrations**; and **Saved data**, the display's cache, behind **Show details**. **CPU & Thermal** is the first place to look if the display feels sluggish; it says whether the Pi is throttled by heat or a weak power supply.

**Diagnostics bundle** exports a redacted archive for bug reports. **Anonymous Telemetry** holds the **Send anonymous usage data** switch and **What we collect**, the list of exactly what is sent.

### System & updates

- **Version** says **You're on version** so-and-so. **Check for Updates** looks for a newer release and offers **Update Now**; the update downloads a pre-built release, swaps it in and restarts, with no build step on the Pi.
- **Update Notification**: **Notify me when an update is available** shows a note in the editor and on the family remote. Off by default; a dismissed note stays dismissed for that release only.
- **Changelog**: **View Changelog** for each release's notes.
- **If an update caused trouble** lists earlier versions with **Go back to this** on each. Going back downloads that release again, so it needs an internet connection; older versions may not understand newer settings.
- **If something seems stuck**: **Restart Home Screens** (a few seconds) and **Restart the whole device** (a minute or two).
- **Advanced**: **Show advanced options** reveals the **Stable channel** / **Pre-release channel** switch here, the GitHub token card on the API keys page, and the Developer tab in the Plugins panel.

### Automation

Three tabs on one page:

- **Profiles**: named groups of screens that activate on a schedule or manually. See [Profiles](#profiles) below.
- **Rules**: make a display react to live conditions instead of just the clock, for example jumping to a camera screen when a doorbell sensor fires. See the [Display Rules guide](/docs/profiles#display-rules).
- **Shared state**: the values your installed plugins are publishing. **Watching** lists what this display is actively using; **Available** is a searchable catalogue of everything your plugins could share, grouped by plugin, whether or not anything uses it yet.

### Docs

A persistent link in the sidebar footer (not a settings page) to the full documentation, opened in a new tab.

## Profiles

Profiles let you define named groups of screens that activate based on a schedule or manually.

### Creating a Profile

1. Open **Settings > Automation > Profiles**
2. Click **Add a profile** and give it a name; the page suggests **School mornings**, **Evening**, **Weekend** and **Guests**
3. Add screens from **Available** and drag to set their order

### Schedule-Based Activation

Turn on **Auto-activate on schedule** for a profile and set the days of the week, **From** and **Until** (overnight windows such as 23:00 to 06:00 work). **Invert** hides the profile during the window instead. When two profiles are due at once, the one higher in the list wins.

### Manual Activation

**Showing right now** at the top of the Profiles tab picks a profile by hand, and the family remote has the same pills. A profile picked by hand overrides any scheduled one.

## Module Scheduling

Individual modules can be shown or hidden based on a schedule:

1. Select a module on the canvas
2. In the Property Panel, expand **Schedule**
3. Set the days of week and time window
4. Optionally toggle **Invert** to hide the module during the window instead of showing it

This is useful for showing a commute module only on weekday mornings or a sports scores module only on game days.

## Module Visibility

Beyond scheduling, the Property Panel has two separate sections that control when a module appears. **Visibility** sits just above Schedule, and **Conditions** sits just below it.

### Visibility

- **Show on display**: turn a module off without deleting it. A hidden module disappears from the display (and stops fetching data) but stays visible, dimmed, in the editor so you can turn it back on later.
- **Run hidden in the background**: keeps a module's data running behind the scenes without ever drawing it on screen, so the values it shares stay fresh across screen rotation. This one is background-only: if you want the widget visible too, add a second copy without this turned on. It only shows up on modules that can share values in the first place.

### Conditions

Conditions show a module only when live values match rules you define. Values come from plugins that share state, for example the Home Assistant plugin publishing sensor readings.

- **Show only when conditions match**: the master switch for this section. Leave it off and the module ignores conditions entirely. Turn it on with no conditions added and the module always shows.
- **Conditions**: add one or more rules. There are six kinds:
  - **Value matches**: a value is (or is not) something, like "front door is open". You can list several values separated by commas to match any of them
  - **Number is in range**: a number is above and/or below a bound, like "temperature above 30"
  - **Time of day**: a plain clock and day-of-week window, with no sensor involved. Useful for fencing the rest of the rules to daytime hours
  - **All of…**, **Any of…**, **None of…**: group other conditions together
- **Before data arrives**: what to do while a value hasn't been reported yet: **Hide the module** (the default) or **Show the module**. This is worth knowing about, because it applies whenever *any* value your conditions mention is missing, and it decides the outcome before the rules are even looked at. If a plugin restarts, its values briefly go missing and, on the default setting, the module disappears until they come back. Switch this to **Show the module** if you'd rather it stay put.

When you have more than one condition at the top level, all of them must match for the module to show.

While you're editing, each condition shows a badge saying whether it is **Met**, **Not met**, or **Waiting** on the display right now, along with the display's current value for that key. If the value you typed differs only by capitalization, a warning points it out, since matching is case-sensitive. A summary line at the top of the section says whether the module is shown or hidden right now and why.

## Saving

There is no Save button. Every change is saved about a second after you stop editing, the toolbar shows **Saved**, and the wall picks it up a few seconds later.

## Import & Export

See [Backups & data](#backups-and-data) in Global Settings for export/import options including layout sharing, templates, and full backup/restore.

## Next steps

- [Modules](/docs/modules): what every module shows and needs
- [Profiles and schedules](/docs/profiles): different screens at different times of day
- [Photos and backgrounds](/docs/backgrounds): your own photos on the wall
