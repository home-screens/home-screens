---
title: Editor Guide
nextjs:
  metadata:
    title: Editor Guide
    description: Drag-and-drop visual editor for Home Screens — add modules, customize styles, manage screens, and configure schedules.
    alternates:
      canonical: /docs/editor
---

The editor is the main interface for designing your display screens. Access it at `/editor`.

## Layout

The editor has five main areas:

- **Module Palette** (left sidebar) — browse and drag modules onto the canvas
- **Canvas** (center) — the visual representation of your screen at actual display resolution
- **Property Panel** (right sidebar) — configure the selected module's settings and appearance
- **Screen Tabs** (top) — manage multiple screens
- **Toolbar** (top right) — **Plugins** opens the add-on store, **Settings** opens the settings pages, and **Preview** opens the current display in a new tab so you can see your work full size. A small indicator next to them shows **Saving…** or **Saved**, and offers a **Retry** button if a save ever fails.

## Appearance

The editor has a **theme toggle** in the settings header that cycles through **Dark**, **Light**, and **System** (follow the OS preference). The choice is stored in `localStorage` and applied before first paint so reloads do not flash the wrong theme. The editor and the remote each remember their theme independently — setting the editor to Light does not affect what the remote looks like on your phone.

## Display Switcher (multi-display)

As soon as you register your first display, a **Display Switcher** pill appears in the editor toolbar showing the current display name and dimensions. (Registering a display also creates a **main** display alongside it, holding what you had before, so you will usually see two entries right away.) Click it to drop down to any registered display — the canvas, screen tabs, and property panel all switch to that display's content. The pill is hidden in single-display installs. See the [Multi-display guide](/docs/multi-display) for the full hub-and-spoke setup.

## Canvas Controls

The editor canvas includes a floating toolbar with controls for zoom, undo/redo, and snap-to-grid.

### Zoom & Pan

The canvas supports zooming from 20% to 400% in fixed steps (20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 300, 400):

- **Trackpad pinch** or **Ctrl+Scroll** — zoom in/out centered on the cursor, stepping through the same fixed increments
- **Zoom buttons** — use the **+** and **−** buttons in the floating toolbar
- **Keyboard** — `Cmd+=` / `Ctrl+=` to zoom in, `Cmd+-` / `Ctrl+-` to zoom out, `Cmd+0` / `Ctrl+0` to fit
- **Fit to screen** — click the fit button to reset zoom so the entire canvas is visible. The button only appears while you are zoomed in or out; at 100% there is nothing to fit
- The current zoom percentage is displayed in the toolbar

When zoomed in beyond the viewport, the canvas becomes scrollable.

### Undo & Redo

All canvas changes (moving, resizing, adding, deleting, and configuring modules) are tracked with a 50-step history:

- **Undo** — `Cmd+Z` (macOS) or `Ctrl+Z` (Windows/Linux), or click the undo button in the toolbar
- **Redo** — `Cmd+Shift+Z` / `Ctrl+Y`, or click the redo button in the toolbar

Rapid edits of the same type (e.g., dragging a module) are coalesced into a single history entry so undo steps feel natural.

### Snap to Grid

A toggle button in the floating toolbar controls grid snapping:

- **Enabled** (default) — modules snap to a 20px grid when dragging and resizing; a dot grid overlay is shown on the canvas
- **Disabled** — modules snap to pixel-level precision; the grid overlay is hidden

### Minimum Width

The editor requires a minimum viewport width of 768px. On smaller screens, a message prompts you to use a wider window or device.

## Adding Modules

1. Open the **Module Palette** on the left
2. Browse by category or use the search bar to find a module
3. Click and drag a module onto the canvas
4. Drop it where you want it — modules snap to a 20px grid (when snap is enabled)

Categories in the palette are collapsible. Click a category header to expand or collapse it.

## Selecting & Moving Modules

- **Click** a module on the canvas to select it
- **Drag** a selected module to reposition it
- **Resize** by selecting the module first, then dragging the small square handle at its bottom-right corner. That handle is the only way to resize, and it appears only while the module is selected. Modules can't be made smaller than 40 × 40
- **Delete** by selecting the module and clicking **Delete Module** at the bottom of the Property Panel. You'll be asked to confirm first. The Delete key does nothing on the canvas
- Position and size can also be set precisely using the X, Y, W, H fields in the Property Panel

When modules overlap, **click the same spot again** to cycle through the modules stacked under it, so a covered module is always reachable. To change which module draws on top, select it and use the **Bring to Front** and **Send to Back** buttons near the bottom of the Property Panel — each button is disabled once the module is already at that end of the stack.

## Configuring Modules

Select a module to open its settings in the **Property Panel** on the right. Related fields are grouped into labeled blocks sharing a visual container, so the panel stays scannable even on dense modules like the clock or chore chart. Each block is a collapsible section, so the panel shows only what you're actively editing.

### Property Panel

The panel has two operating states:

- **Module selected** — collapsible sections in this order: **Position & Size**, **Style**, **Config** (the module's own options), then for add-ons **Connection** and **Secrets**, and finally **Visibility**, **Schedule**, and **Conditions**. A **Delete Module** button sits at the bottom. The Background picker is hidden while a module is selected, so the panel stays focused on the module's own fields.
- **No module selected** — the panel shows **Screen settings** (the screen's name and module count, a rotation-duration override, and a schedule for the screen itself), followed by the Background picker for the current screen. You can set rotation, screen schedules, and backgrounds without first dropping a module on the canvas.

Full-screen modules (full-screen calendar, chore chart, meal planner, and photo) always fill the whole screen, so they have no Position & Size or Style sections at all.

### Module Settings

Each module type has its own configuration options. For example:

- **Clock** — toggle 24-hour format, seconds, date display
- **Countdown** — add/remove events with labels and dates
- **To-Do** — add/edit/check off items
- **News** — set the RSS feed URL
- **Stock Ticker** — enter comma-separated stock symbols
- **Display Control** — pick layout (bar / pad / panel), default target (self / all / specific display), allow runtime retargeting

See the [Module Reference](/docs/module-reference) for all available options.

### Style Settings

Every module (except the full-screen ones) can be styled. The controls are grouped into four blocks:

**Shape**

- **Border Radius** — round the corners (0–50)
- **Padding** — add inner spacing (0–64)
- **Border Width** — draw an outline around the module (0–4)

**Effects**

- **Opacity** — fade the module (0–1, in steps of 0.05)
- **Backdrop Blur** — apply a frosted glass effect behind the module (0–40)
- **Shadow Size** — drop a soft shadow behind the module (0–48)

**Color**

- **Background** — set the module's background (supports transparency via rgba)
- **Border Color** — the color of the outline set by Border Width
- **Text Color** — set the text color

**Text**

- **Card Title** — show a centered title at the top of the module. The title sits on the module card, above its content, and is cut off with an ellipsis when it is too long to fit. Leave it empty for no title. Some widgets (like the to-do list) also show a title of their own from their settings — setting both means you will see both
- **Title Size** — set the title's font size (8–72). It appears once a title is set and starts at the module's font size, so leaving the slider alone keeps them matched; use Reset to default to match the font size again. Clearing the title clears this too
- **Font Size** — set the base font size (8–72)
- **Font Weight** — make all of the module's text lighter or bolder (100–900). Leave it on Default to keep the module's built-in look, and use Reset to default to go back. The title always stays at its normal weight
- **Font Family** — choose from available fonts

## Managing Screens

The display can rotate through multiple screens automatically.

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

Right-click a screen tab and choose **Delete** from the context menu, or click the small **x** on the tab itself. You must have at least one screen, so the last one can't be deleted.

### Scheduling a Screen

A whole screen can come and go on a schedule, the same way an individual module can:

1. Click an empty area of the canvas to deselect any module
2. Open **Screen settings** in the Property Panel
3. Set the days of the week and the time window

Outside that window the display skips the screen in rotation, exactly as if you had disabled it, but it turns itself back on automatically. A scheduled tab shows a small clock icon, and hovering it says "scheduled". Handy for a school-morning screen or a weekend-only photo screen.

### Screen Rotation

The global rotation interval lives in **Settings > Screen > Rotation & appearance**. Screens cycle in order at this interval. The display view shows small indicator dots at the bottom.

Any individual screen can **override** the global interval via its `rotationDurationMs` field. Click an empty area of the canvas to deselect any module, then use the property panel's **Screen settings** section to set a custom duration for the current screen, or click **Reset** to go back to inheriting the global default. When a screen has a custom value, a small **duration pill** appears on its tab (e.g. `10s`) so you can see the override at a glance.

Setting the duration to **0** on a screen makes it **sticky** — the display pauses rotation on that screen entirely. The tab shows an amber `0s` pill as a warning, and the screen must be advanced manually (via `/api/display/next-screen`, the display-control module, or another touch). Useful for one-off "stay on this screen until I say otherwise" surfaces like a dinner timer or a guest-mode photo frame.

Per-screen durations also feed into module prefetch timing. Modules that pre-render their next rotation (e.g. `fullscreen-photo`) pick up the resolved duration from `resolveScreenDuration()`, so a screen with a 60 s override prefetches ~60 s ahead instead of ~30 s.

### Screen Transitions

Screen transitions control the visual effect when cycling between screens. There are 8 transition effects available:

- **fade** — smooth opacity crossfade (default)
- **slide** — horizontal slide left/right
- **slide-up** — vertical slide upward
- **zoom** — scale in/out
- **flip** — 3D card flip
- **blur** — blur out and in
- **crossfade** — overlapping crossfade
- **none** — instant switch with no animation

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

- **Screen** — Screen (rotation, appearance, sleep, and alerts) and Location & language
- **Content** — Weather, Calendar, Meals, and API keys
- **Automation** — Profiles, Rules, and Shared state (three tabs on one page)
- **Maintenance** — Security, Network, System & updates, Backups & data, and Status

Rather than documenting every field here, the fastest way to find one is the **search box at the top of the sidebar** — it matches individual setting names as well as page titles, so searching "brightness" or "timezone" jumps straight to that field and briefly highlights it, even if you don't know which page it lives on. What follows is the behaviour you can't infer from the labels.

### Defaults vs Per display

As soon as you register a second display, the sidebar splits into two groups:

- **Defaults** — the same pages as above, holding the shared source-of-truth values that apply to *every* display until a specific one overrides them. Each Defaults page shows a backlink banner listing which displays currently override its fields, with one click to jump there.
- **Per display** — one page per registered display, plus an **All displays** landing page holding the adoption card grid. Each display page has two sub-tabs: **Overview** (profile, identity, adoption info) and **Overrides** (screen, sleep, and alert settings). Every field that can inherit shows an **Override** button, and once overridden a **Reset to default** button, so you can always tell whether a value is this display's own or borrowed.

Resolution, rotation, and flip are the exception: every display has its own physical screen, so those are plain inputs with nothing to inherit. For the same reason, the orientation, resolution, and flip controls on the **Defaults > Screen** page only appear in single-display installs.

Multi-display features (the sidebar split, the All displays page, the Display Switcher pill, the remote's Display Picker) stay hidden until you register a display. See the [Multi-display guide](/docs/multi-display) for the full setup.

### Screen

Three tabs: **Rotation & appearance**, **Sleep & dimming**, and **Alerts**. Most controls are self-explanatory sliders and dropdowns; these are the ones that aren't:

- **Sleep & dimming** is grouped into three sections — inactivity dimming ("Dim after a few quiet minutes"), the daily schedules ("Dim in the evening" and "Turn off overnight"), and the dimmed appearance — with a 24-hour preview bar showing when the display will be bright, dimmed, or off. Turn the inactivity toggle off to keep full brightness all day while a schedule handles the night.
- **Dim and sleep schedules** support overnight spans — `23:00–06:00` works and wraps past midnight as you'd expect.
- **After a wake-up, stay on for** (shown when a schedule is on) — how long the display stays awake when someone touches it or wakes it from the remote during a scheduled dim or sleep window, before the schedule takes over again. Defaults to 5 minutes; set it to the minimum for the old behavior of going right back to sleep.
- **Screensaver** picks what shows during the *dimmed* state, before full sleep: a drifting clock, blank, or off (no clock — the display still dims).
- **Touchscreen Pause** (on by default) — double-tapping the active pagination dot on the display pauses screen rotation; double-tap again to resume. An optional auto-resume timeout (default 5 minutes) restarts rotation on its own.
- **Swipe to change screens** (on by default) — flick left anywhere on the display for the next screen, or right for the previous one. Vertical swipes are left alone so scrolling content like the chore chart keeps working.
- **Theme** sets the color scheme used by the full-screen modules, not the editor.

Sleep and dimming draw a black layer over the page rather than powering the panel down, so a dimmed display is still backlit. That distinction matters when [diagnosing a black screen](/docs/raspberry-pi#screen-keeps-going-black).

### Location & language

- **Location Lookup** searches by zip code or city name; **Detect** uses browser geolocation with an IP-based fallback. Weather modules show nothing until a location is set, whichever provider you use.
- **Timezone** overrides the server's OS timezone for time-based modules. The **Time Comparison** readout shows browser time and server time side by side so you can confirm it took.
- **Formatting Locale** (optional) overrides date and number formatting *only*, without changing the interface language. Useful when you want English text but European date order. Leave it blank to follow **Language**.
- **Time format** picks 12-hour or 24-hour times for calendar events everywhere they appear — the calendar module, the fullscreen calendar, and event detail popups — and serves as the default the meal planner follows (meal settings can still override it). The clock module keeps its own per-module setting.

### Weather

Units are a segmented control at the top; each of the {% $stats.weatherProviderCount %} providers is a card below with its own inline key field, a **Test** button, and a **Set as default** action. The status pill reads **Ready**, **Configured**, or **Needs setup**, with **Default ·** in front of the active one.

Which provider to pick, and which need a key, is covered in [Weather providers](/docs/getting-started#weather-providers-settings-weather).

### Calendar

Add feeds by URL under **iCal / ICS Feeds**, or sign in under **Google Calendar (OAuth)** or **iCloud Accounts** for a calendar picker with native colors. iCloud additionally offers a **Birthdays** calendar built from your contacts, and your app-specific password is verified against iCloud before saving and never leaves the server. **Public Holidays** overlays a country's holidays (from Nager.Date) onto calendar modules.

Full walkthroughs for all three, including how to choose, are in [Calendar setup](/docs/getting-started#calendar-setup).

**Source status** lists every calendar you have connected and when each one last brought in events, so a feed that quietly stopped working is visible here rather than just missing from the display. A source that is failing says so in plain words and keeps showing the last events it did fetch.

**People** is the household list: give each family member a name and a color, then pick which calendars are theirs. The Full-Screen Calendar's family grid and free time views draw one row per person from this list; a calendar you do not give to anyone counts as shared by the whole house. Other calendar views ignore it, so you only need to fill this in if you use those two views.

**Hide declined events** sits with the Google settings and applies to Google calendars only — it skips events the signed-in account has declined, so a turned-down invite stops taking up room.

### API keys

All keys live here and are stored in `data/secrets.json` — no `.env.local` needed. Each shows a configured/not-configured indicator and can be saved or removed individually. Weather keys are the exception and live on their provider's card under **Settings > Weather**.

Which integrations need which key is listed in [API keys](/docs/getting-started#api-keys-settings-api-keys). Two gotchas worth repeating:

- **TomTom** — the Geocoding, Reverse Geocoding, and Routing APIs must be enabled **on the key itself**, not just on your account, or the traffic module fails with an unhelpful error.
- **GitHub token** — only appears when **Advanced Mode** is on (System & updates).

### Security

The editor has no password until you set one. Once set, it covers the editor and `/remote`; the display authenticates separately with a display token, and the kids' `/chores` view deliberately stays open.

- **Change Password** invalidates every other session. **Revoke All Sessions** does the same without changing the password.
- **Remember Me** on the login page gives a 90-day session instead of the default 30.
- **Display Token** can be revealed, copied, or regenerated — regenerating requires the display to reload.
- **Forgot the password?** Run `home-screens-reset-password` on the device and set a new one. The same advice is on the `/login` page, which is where you actually are when you are locked out.

#### IP Allowlist

Two independent toggles over a shared CIDR list. Your current IP is shown above the list so you know what to add before enabling either.

- **Allow these IPs to bypass authentication** — trusted addresses reach the editor and write APIs without the password; everyone else still gets the login form.
- **Restrict access to these IPs** — blocks non-allowlisted addresses from every route except `/login` and `/api/auth/status`. Enabling it with your own IP outside the list triggers a lockout warning and is rejected until you add your IP or click **Save Anyway**.

Two things to know before enabling restriction:

1. Matching is **IPv4-only**. If the server sees your client as IPv6 (`::1`, `fe80::…`), add an IPv4 entry that matches your real address and make sure the client connects over IPv4. The panel warns you when it detects this.
2. It trusts the `x-forwarded-for` header. Behind a reverse proxy that doesn't strip client-supplied XFF, an attacker can spoof an allowlisted IP. Either run without a proxy or configure the proxy to overwrite XFF.

### Backups & data

**Full Backup** exports everything including chore and meal history. Your API keys and connected accounts are left out unless you tick **Include my API keys and connected accounts**, with an optional password to lock them inside the file ([details](/docs/configuration#backing-up-your-keys)). **Share Layout** exports only screens and modules, with no personal data, and is the safe one to hand to someone else. **Templates** start you from a pre-built layout while keeping your existing settings.

**Config Backups** are the snapshots taken automatically before each upgrade, listed here alongside your manual ones. **Backup Reminder** nags you on a configurable interval, or can be switched off.

### Status

A live dashboard: display state, hardware, cache statistics, CPU and thermal, memory, storage, configuration counts, and which integrations are configured. **CPU & Thermal** is the first place to look if the display feels sluggish — it reports whether the Pi is being throttled by heat or a weak power supply.

The **Server** card has a **Download bundle** button that exports a redacted diagnostics archive for bug reports, and **Anonymous Telemetry** holds the opt-out toggle plus an expandable list of exactly what gets sent.

### System & updates

Version info, **Check for Updates**, **Upgrade**, an expandable **Changelog**, and **Version History** with per-version rollback. **Power** restarts the Home Screens service or reboots the Pi.

- **Update Notification** is opt-in and off by default. Dismissals are tracked per release tag, so dismissing one upgrade prompt won't hide the next release.
- **Advanced Mode** is the gate for developer surfaces: turning it on reveals the Update Channel switcher here, the GitHub token card under API keys, and the Developer tab in the Plugins panel.

### Automation

Three tabs on one page:

- **Profiles** — named groups of screens that activate on a schedule or manually. See [Profiles](#profiles) below.
- **Rules** — make a display react to live conditions instead of just the clock, for example jumping to a camera screen when a doorbell sensor fires. See the [Display Rules guide](/docs/profiles#display-rules).
- **Shared state** — the values your installed add-ons are publishing. **Watching** lists what this display is actively using; **Available** is a searchable catalogue of everything your add-ons could share, grouped by add-on, whether or not anything uses it yet.

### Docs

A persistent link in the sidebar footer (not a settings page) to the full documentation, opened in a new tab.

## Profiles

Profiles let you define named groups of screens that activate based on a schedule or manually.

### Creating a Profile

1. Open **Settings > Automation > Profiles**
2. Click **Add Profile** and give it a name (e.g. "Morning", "Evening")
3. Select which screens to include and drag to set their display order

### Schedule-Based Activation

Each profile can have a schedule:

- **Days of Week** — which days the profile is active
- **Start Time / End Time** — the time window (supports overnight, e.g. 23:00–06:00)

When multiple profiles have overlapping schedules, the first matching profile wins.

### Manual Activation

Set a profile manually in Settings or via the `/api/display/profile` endpoint. Manual activation overrides any scheduled profile.

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

- **Show on display** — turn a module off without deleting it. A hidden module disappears from the display (and stops fetching data) but stays visible, dimmed, in the editor so you can turn it back on later.
- **Run hidden in the background** — keeps a module's data running behind the scenes without ever drawing it on screen, so the values it shares stay fresh across screen rotation. This one is background-only: if you want the widget visible too, add a second copy without this turned on. It only shows up on modules that can share values in the first place.

### Conditions

Conditions show a module only when live values match rules you define. Values come from add-ons that share state, for example a Home Assistant add-on publishing sensor readings.

- **Show only when conditions match** — the master switch for this section. Leave it off and the module ignores conditions entirely. Turn it on with no conditions added and the module always shows.
- **Conditions** — add one or more rules. There are six kinds:
  - **Value matches** — a value is (or is not) something, like "front door is open". You can list several values separated by commas to match any of them
  - **Number is in range** — a number is above and/or below a bound, like "temperature above 30"
  - **Time of day** — a plain clock and day-of-week window, with no sensor involved. Useful for fencing the rest of the rules to daytime hours
  - **All of…**, **Any of…**, **None of…** — group other conditions together
- **Before data arrives** — what to do while a value hasn't been reported yet: **Hide the module** (the default) or **Show the module**. This is worth knowing about, because it applies whenever *any* value your conditions mention is missing, and it decides the outcome before the rules are even looked at. If an add-on restarts, its values briefly go missing and, on the default setting, the module disappears until they come back. Switch this to **Show the module** if you'd rather it stay put.

When you have more than one condition at the top level, all of them must match for the module to show.

While you're editing, each condition shows a badge saying whether it is **Met**, **Not met**, or **Waiting** on the display right now, along with the display's current value for that key. If the value you typed differs only by capitalization, a warning points it out, since matching is case-sensitive. A summary line at the top of the section says whether the module is shown or hidden right now and why.

## Saving

Changes are saved automatically when you modify settings. The editor fetches and pushes configuration via the `/api/config` endpoint, which reads and writes `data/config.json`.

## Import & Export

See [Backups & data](#backups-and-data) in Global Settings for export/import options including layout sharing, templates, and full backup/restore.
