---
title: Editor Guide
nextjs:
  metadata:
    title: Editor Guide
    description: How to use the Home Screens visual editor.
---

The editor is the main interface for designing your display screens. Access it at `/editor`.

## Layout

The editor has four main areas:

- **Module Palette** (left sidebar) — browse and drag modules onto the canvas
- **Canvas** (center) — the visual representation of your screen at actual display resolution
- **Property Panel** (right sidebar) — configure the selected module's settings and appearance
- **Screen Tabs** (top) — manage multiple screens

## Adding Modules

1. Open the **Module Palette** on the left
2. Browse by category or use the search bar to find a module
3. Click and drag a module onto the canvas
4. Drop it where you want it — modules snap to a 20px grid

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

### Renaming a Screen

Double-click a screen tab to rename it.

### Removing a Screen

Click the **x** button on a screen tab. You must have at least one screen.

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

Open the **Settings Panel** to configure system-wide options. Settings are organized into twelve tabs:

**Display** · **Profiles** · **Sleep** · **Alerts** · **Location** · **Weather** · **Calendar** · **Integrations** · **Security** · **Data** · **Stats** · **System**

### Display

- **Resolution Preset** — choose from standard resolutions (1080p portrait, 4K, landscape, etc.)
- **Display Transform** — rotate the output (for physically rotated screens)
- **Cursor Auto-Hide** — cursor hides after a configurable idle period (default 3 seconds); move the mouse to restore it

### Profiles

Profiles let you define named groups of screens that activate based on a schedule or manually. See the [Profiles](#profiles-1) section below for details.

### Sleep

- **Dim Schedule** — automatically dim the display during set hours
- **Dim Brightness** — how much to dim (0–100%)
- **Sleep Schedule** — fully blank the screen during set hours
- **Screensaver** — show a minimal clock during sleep

### Alerts

- **Enable/Disable** — toggle the alert notification overlay
- **Position** — display alerts at the top or bottom of the screen
- **Max Visible** — limit how many alerts show simultaneously
- **Default Duration** — how long alerts remain visible before auto-dismissing

### Location

- **Latitude / Longitude** — set coordinates for weather, sunrise/sunset, and other location-aware modules
- **Location Lookup** — search by city name to auto-fill coordinates
- **Timezone** — set the timezone for all time-aware modules (clock, calendar, sunrise/sunset, etc.)

### Weather

- **Provider** — choose OpenWeatherMap, WeatherAPI, Pirate Weather, or NOAA (free, US only)
- **Units** — metric or imperial

### Calendar

- **Sign In** — initiate the OAuth device flow for Google Calendar
- **Calendar Selection** — choose which calendars to display
- **Max Events** — limit the number of events shown
- **Days Ahead** — how far ahead to look for events

### Integrations

The **Integrations** tab is where you configure all API keys and external service connections. Keys are stored in the config file — no `.env.local` needed.

- **OpenWeatherMap** — API key for weather, air quality, and UV data
- **WeatherAPI** — alternative weather provider API key
- **Pirate Weather** — Dark Sky replacement API key
- **Unsplash** — access key for background photo browsing
- **Todoist** — API token for task integration
- **TomTom** — API key for traffic data
- **Google Calendar** — OAuth device flow sign-in

### Security

The editor can be protected with a password to prevent unauthorized access. Once enabled, accessing the editor requires entering the password. The display view remains publicly accessible.

### Data

- **Share Layout** — export your screen layout (screens, modules, visual settings) without personal data; safe to share with others
- **Templates** — start from a pre-built template while preserving your existing settings
- **Full Backup** — export or restore the entire configuration including all settings, location, calendars, and device preferences

### Stats

View system and application statistics including disk usage, memory, OS info, module counts by type, and configured integrations.

### System

- **Version** — current app version
- **Changelog** — recent release notes
- **Update Channel** — switch between Stable and Dev (pre-release) channels for updates
- **Upgrade** — download and install the latest version
- **Rollback** — revert to a previous version
- **Backup/Restore** — export and import your configuration
- **Logs** — view application logs
- **Power** — restart or shut down the Raspberry Pi from the UI

## Profiles

Profiles let you define named groups of screens that activate based on a schedule or manually.

### Creating a Profile

1. Open **Settings > Profiles**
2. Click **Add Profile** and give it a name (e.g. "Morning", "Evening")
3. Select which screens to include in this profile

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

- **Export** — download your current configuration as a JSON file
- **Import** — upload a previously exported JSON file to restore a configuration

This is useful for backing up before making major changes or transferring configurations between devices.
