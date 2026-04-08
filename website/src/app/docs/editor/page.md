---
title: Editor Guide
nextjs:
  metadata:
    title: Editor Guide
    description: Drag-and-drop visual editor for Home Screens — add modules, customize styles, manage screens, and configure schedules.
---

The editor is the main interface for designing your display screens. Access it at `/editor`.

## Layout

The editor has four main areas:

- **Module Palette** (left sidebar) — browse and drag modules onto the canvas
- **Canvas** (center) — the visual representation of your screen at actual display resolution
- **Property Panel** (right sidebar) — configure the selected module's settings and appearance
- **Screen Tabs** (top) — manage multiple screens

## Display Switcher (multi-display)

When the hub has more than one display registered, a **Display Switcher** pill appears in the editor toolbar showing the current display name and dimensions. Click it to drop down to any registered display — the canvas, screen tabs, and property panel all switch to that display's content. The pill is hidden in single-display installs. See the [Multi-display guide](/docs/multi-display) for the full hub-and-spoke setup.

## Canvas Controls

The editor canvas includes a floating toolbar with controls for zoom, undo/redo, and snap-to-grid.

### Zoom & Pan

The canvas supports zooming from 25% to 300%:

- **Trackpad pinch** or **Ctrl+Scroll** — zoom in/out centered on the cursor
- **Zoom buttons** — use the **+** and **−** buttons in the floating toolbar
- **Fit to screen** — click the fit button to reset zoom so the entire canvas is visible
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
- **Resize** by dragging the module's edges or corners
- Position and size can also be set precisely using the X, Y, W, H fields in the Property Panel

## Configuring Modules

Select a module to open its settings in the **Property Panel** on the right. The panel has two sections:

### Module Settings

Each module type has its own configuration options. For example:

- **Clock** — toggle 24-hour format, seconds, date display
- **Countdown** — add/remove events with labels and dates
- **To-Do** — add/edit/check off items
- **News** — set the RSS feed URL
- **Stock Ticker** — enter comma-separated stock symbols

See the [Modules Reference](/docs/modules) for all available options.

### Style Settings

Every module can be styled with:

- **Opacity** — fade the module (0–1 slider)
- **Border Radius** — round the corners
- **Padding** — add inner spacing
- **Background Color** — set the module's background (supports transparency via rgba)
- **Text Color** — set the text color
- **Font Family** — choose from available fonts
- **Font Size** — set the base font size
- **Backdrop Blur** — apply a frosted glass effect behind the module

## Managing Screens

The display can rotate through multiple screens automatically.

### Adding a Screen

Click the **+** button in the Screen Tabs to create a new screen. Each screen has its own set of modules and background.

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

### Removing a Screen

Right-click a screen tab and choose **Delete** from the context menu. You must have at least one screen.

### Screen Rotation

Set the rotation interval in **Settings > Display**. Screens cycle in order at this interval. The display view shows small indicator dots at the bottom.

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

The transition effect and duration are configurable in **Settings > Display**. The default duration is 0.6 seconds.

## Backgrounds

Open the **Background Picker** to manage screen backgrounds.

### Upload a Background

1. Click the upload area or drag an image file onto it
2. Images are stored in `public/backgrounds/`
3. Maximum file size: 10 MB
4. Supported formats: JPEG, PNG, WebP, GIF

### Unsplash Integration

If you've set an Unsplash access key in Settings, you can:

- Browse and select from Unsplash photos
- Enable background rotation to automatically cycle through Unsplash images

### Per-Screen Backgrounds

Each screen can have its own background image. Select a screen tab, then choose a background.

## Global Settings

Open the **Settings Panel** to configure system-wide options. In a **single-display install**, the sidebar is a single flat list of pages:

**Display** · **Sleep** · **Alerts** · **Location** · **Weather** · **Calendar** · **Meals** · **Profiles** · **Integrations** · **Security** · **Data** · **Stats** · **System** · **Docs**

When you add a second display, the sidebar automatically splits into two groups:

- **Defaults** — the same set of pages above, holding the shared source-of-truth values that apply to *every* display until a specific one overrides them. Each Defaults page shows a backlink banner at the top listing which displays currently override its fields, with one click to jump to that display.
- **Per display** — one drill-down page per registered display (plus an **All displays** landing page that holds the adoption card grid). Each display page has six sub-tabs: **Overview**, **Display**, **Sleep**, **Alerts**, **Profile**, **Identity**. Every inheritable field on a sub-tab is rendered as an **OverrideRow** with explicit **Override** / **Reset to default** actions, so the provenance of each value is visible instead of inferred. Resolution, rotation, and flip live directly on the `DisplayNode` and render as plain inputs on the Display sub-tab — they have no shared default to inherit from.

See the [Multi-display guide](/docs/multi-display) for the full hub-and-spoke setup.

### Display

- **Orientation** — toggle between portrait and landscape mode (swaps width and height)
- **Resolution Preset** — choose from standard resolutions (720p, 1080p, 1440p, 4K) or set a custom resolution (320–7680px)
- **Flip Display** — rotate the output 180° for physically inverted mounts
- **Screen Rotation** — how long each screen is shown before cycling (5–120 seconds, default 30)
- **Transition Effect** — animation when cycling between screens (see [Screen Transitions](#screen-transitions) above for the full list)
- **Transition Duration** — how long the transition takes (0.3–2 seconds, default 0.6)
- **Cursor Auto-Hide** — cursor hides after a configurable idle period (1–30 seconds, default 3); move the mouse to restore it
- **Touchscreen Pause** — when enabled (default), double-tapping the active pagination dot on the display pauses screen rotation; double-tap again to resume. An optional auto-resume timeout (default 5 minutes) resumes rotation after a period of inactivity

### Per display (All displays)

The **All displays** landing page under **Per display** manages the hub-and-spoke registry when more than one Pi spoke is connected to the hub. Each registered display appears as a card with its name, dimensions, rotation, online dot, last-seen timestamp, source IP, and screen count. Powered-on Pi spokes that haven't been registered yet appear under **Unadopted Displays** and can be adopted with one click.

- **Adopt** — register an unadopted spoke. Give it a friendly name and confirm the dimensions/rotation (pre-filled from the spoke's reported viewport). The display ID cannot be changed at adoption time because the spoke continues using its original ID.
- **Edit screens** — switch the editor's selected display to this one and drop the canvas onto its screens.
- **Open display** — jump into the display's drill-down page (Overview / Display / Sleep / Alerts / Profile / Identity sub-tabs) to edit its friendly name, dimensions, rotation, per-display overrides, and active profile. The `main` display is edited the same way — it's a regular display node that owns its own dimensions.
- **Delete** — remove a display. Spokes still pointed at the deleted URL show a 60-second countdown and auto-navigate to the current default display.

Multi-display features (the Defaults / Per display sidebar split, the All displays landing page, the Display Switcher pill, the remote's Display Picker) are hidden in single-display installs. See the [Multi-display guide](/docs/multi-display) for the full setup, including the spoke install command.

### Profiles

Profiles let you define named groups of screens that activate based on a schedule or manually. See the [Profiles](#profiles-1) section below for details.

### Sleep

- **Enable/Disable** — master toggle for display sleep
- **Dim After** — minutes of inactivity before dimming (1–60, default 10)
- **Sleep After Dimming** — minutes after dimming before fully blanking (0–120, 0 = never)
- **Dim Brightness** — how much to dim (5–80%, default 20%)
- **Screensaver** — what to show during the dimmed state: drifting clock, blank, or off (skip to sleep)
- **Dim Schedule** — automatically dim during set hours (supports overnight spans like 23:00–06:00)
- **Sleep Schedule** — fully blank the screen during set hours (ignores activity, supports overnight spans)

### Alerts

- **Enable/Disable** — toggle the alert notification overlay
- **Position** — display alerts at the top or bottom of the screen
- **Max Visible** — limit how many alerts show simultaneously (1–10, default 3)
- **Default Duration** — how long alerts remain visible before auto-dismissing (0 = per-type defaults)
- **Alert Size** — scale alert dimensions from 75% to 200% (default 100%); affects text, padding, border radius, and icons proportionally

### Location

- **Location Lookup** — search by zip code or city name to auto-fill coordinates
- **Detect** — auto-detect location via browser geolocation or IP-based fallback
- **Manual Coordinates** — expandable section for editing latitude/longitude directly
- **Timezone** — override the server's OS timezone for time-based modules (all IANA timezones available)
- **Time Comparison** — displays browser time and server time side-by-side to verify timezone settings

### Weather

- **Provider** — choose from five weather providers:
  - **Open-Meteo** — free, no API key required, global coverage (default)
  - **WeatherAPI** — free tier, no credit card required
  - **OpenWeatherMap** — requires One Call 3.0 subscription
  - **Pirate Weather** — free Dark Sky replacement
  - **NOAA / NWS** — free, no API key required, US only
- **API Key** — manage the API key for the selected provider (not needed for Open-Meteo or NOAA)
- **Units** — metric (°C, km/h) or imperial (°F, mph)
- **Test Connection** — verify your weather setup with a live API call

### Calendar

- **Google Calendar** — OAuth device flow sign-in; requires OAuth credentials configured in Integrations first
- **Calendar Selection** — choose which Google calendars to display (multi-select with color indicators)
- **iCal / ICS Feeds** — add external calendar feeds by URL (works with any iCal-compatible service)
- **Public Holidays** — select a country to show public holidays on calendar widgets (data from Nager.Date)
- **Max Events** — limit the number of events shown (1–100, default 10)
- **Days Ahead** — how far ahead to look for events (1–90, default 7)

### Integrations

The **Integrations** tab is where you configure all API keys and external service connections. Keys are stored separately in `data/secrets.json` — no `.env.local` needed. Each key shows a status indicator (configured/not configured) and can be saved or removed individually.

- **Google OAuth Client ID** — required for Google Calendar (create at Google Cloud Console, type: TVs and Limited Input devices)
- **Google OAuth Client Secret** — the client secret from the same OAuth credential
- **Google Maps API Key** — optional, for the traffic/commute widget (requires Routes API)
- **Unsplash Access Key** — enables browsing HD photos in the background picker (free at unsplash.com/developers)
- **NASA API Key** — enables Astronomy Picture of the Day browsing and rotation (free at api.nasa.gov)
- **Todoist API Token** — for the Todoist task integration
- **Immich Server URL** — your Immich server address (e.g. `http://192.168.1.50:2283`) for self-hosted photo library integration
- **Immich API Key** — generated from your Immich account settings (Account Settings → API Keys); enables Immich as a photo source for slideshows, fullscreen photo, and background rotation
- **TomTom API Key** — alternative to Google Maps for traffic data (free at developer.tomtom.com)
- **GitHub Personal Access Token** — optional, increases rate limit for version checks from 60 to 5,000 requests/hour

### Security

The editor can be protected with a password to prevent unauthorized access. Once enabled, accessing the editor and all write operations requires entering the password. The display view authenticates separately using a display token.

- **Set Password** — enable authentication with a new password (minimum 8 characters)
- **Change Password** — update the password (invalidates all other sessions)
- **Disable Authentication** — remove the password (requires current password)
- **Remember Me** — check this box on the login page for a 90-day session (default is 30 days)
- **Display Token** — auto-generated Bearer token used by the display and remote to authenticate API requests; can be revealed, copied to clipboard, or regenerated (regenerating requires the display to reload)
- **Revoke All Sessions** — invalidate all active sessions immediately (useful if a device is lost or compromised)
- **Log Out** — end the current session
- **Password Reset** — if you forget your password, delete `data/auth.json` on the device to reset

### Data

- **Share Layout** — export your screen layout (screens, modules, visual settings) without personal data; safe to share with others
- **Import Layout** — import a previously exported layout file
- **Templates** — start from a pre-built template while preserving your existing settings
- **Full Backup** — export or restore the entire configuration including all settings, location, calendars, and device preferences
- **Backup Reminder** — a configurable reminder that shows a toast when you haven't backed up in a while; set the interval or disable it entirely

### Stats

The Stats tab provides a live dashboard of system health and application state:

- **Display Status** — connection state (active, dimmed, sleeping), current screen, and active profile
- **Data Cache** — cache entries, hit rate, fresh/stale counts, and a detail table showing individual cached API responses
- **Disk Usage** — filesystem usage and a breakdown of Home Screens data (backgrounds, backups, config)
- **Configuration** — screen count, module count, profiles, and a breakdown of module types in use
- **Integrations** — which API keys are configured at a glance
- **Server** — hostname, platform, Node.js version, uptime, and memory usage
- **Anonymous Telemetry** — opt-in toggle for anonymous usage statistics; expandable "What we collect" section

### System

- **Version** — current app version with commit hash and installation method (git or release)
- **Update Channel** — switch between Stable and Pre-release (dev) channels
- **Check for Updates** — query GitHub for new releases
- **Upgrade** — download and install a newer version (with confirmation dialog)
- **Changelog** — expandable view of recent release notes
- **Version History** — list of installed versions with rollback option for each
- **Config Backups** — auto-created before each upgrade, with download and restore options
- **Power** — restart the Home Screens service, or reboot the entire Raspberry Pi

### Docs

Links to the full documentation at [homescreens.dev/docs](https://homescreens.dev/docs), organized by section (Introduction, Guides, Reference). Each link opens in a new tab.

## Profiles

Profiles let you define named groups of screens that activate based on a schedule or manually.

### Creating a Profile

1. Open **Settings > Profiles**
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

This is useful for showing a commute widget only on weekday mornings or a sports scores widget only on game days.

## Saving

Changes are saved automatically when you modify settings. The editor fetches and pushes configuration via the `/api/config` endpoint, which reads and writes `data/config.json`.

## Import & Export

See [Data](#data) in Global Settings for export/import options including layout sharing, templates, and full backup/restore.
