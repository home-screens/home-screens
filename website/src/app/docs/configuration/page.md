---
title: Configuration
nextjs:
  metadata:
    title: Configuration
    description: Complete configuration reference for Home Screens.
    alternates:
      canonical: /docs/configuration
---

{% callout type="note" %}
**This page is a reference for power users.** Home Screens stores everything as JSON files, but you almost never need to touch them — the [editor](/docs/editor) manages all of this for you. This page exists to document the schema for scripting, external tooling, or debugging.
{% /callout %}

Home Screens stores all configuration as JSON files on disk. The main config file is `data/config.json`; a few feature-specific data files (meals, chores, rewards) live alongside it. There is no database — every file is read and written directly by the API with atomic writes (temp file + rename) to prevent corruption during power loss.

## Data files

| File | Purpose | API |
|---|---|---|
| `data/config.json` | Screens, modules, profiles, global settings, multi-display registry | `/api/config` |
| `data/secrets.json` | API keys for external integrations (weather, calendar, photos, etc.) | `/api/secrets` |
| `data/auth.json` | Password hash and session secret for editor authentication | (internal) |
| `data/meals.json` | Meal library, weekly plan, grocery list, household meal settings | `/api/meals/data` |
| `data/chores.json` | Chore definitions, members, completion records | `/api/chores/data` |
| `data/rewards.json` | Reward definitions, point balances, redemption history | `/api/rewards/data` |
| `data/google-tokens.json` | Google Calendar OAuth tokens | (internal) |
| `data/port.conf` | Custom server port (preserved across upgrades) | (internal) |
| `data/plugins/` | Installed plugin bundles and manifests | `/api/plugins/*` |

The main config is read via `GET /api/config` and written via `PUT /api/config`.

## API Keys & Credentials

API keys and credentials are managed through the editor UI under **Settings > Integrations** and stored server-side in `data/secrets.json` via the `/api/secrets` endpoint. They are **not** stored in `.env.local` or in the config file.

Supported secret keys:

| Key | Used By |
|---|---|
| `openweathermap_key` | Weather (OpenWeatherMap provider), Air Quality |
| `weatherapi_key` | Weather (WeatherAPI provider) |
| `pirateweather_key` | Weather (Pirate Weather provider) |
| `unsplash_access_key` | Background rotation (Unsplash) |
| `todoist_token` | Todoist module |
| `google_maps_key` | Traffic module (Google Routes) |
| `tomtom_key` | Traffic module (TomTom) |
| `google_client_id` | Google Calendar OAuth |
| `google_client_secret` | Google Calendar OAuth |
| `nasa_api_key` | Background rotation (NASA APOD) |
| `immich_url` | Immich server URL (e.g. `http://192.168.1.50:2283`) |
| `immich_api_key` | Immich API key (Account Settings → API Keys) |
| `github_token` | GitHub API rate limit for version checks |

## Schema

The configuration has the following structure:

- **ScreenConfiguration** contains a `version` number, a single **GlobalSettings** object, zero or more **Screen** objects, and zero or more **Profile** objects.
- Each **Screen** contains zero or more **ModuleInstance** objects.
- Each **ModuleInstance** has a **ModuleStyle** object, an optional **ModuleSchedule**, and a module-specific config object.
- Each **Profile** has an optional **ModuleSchedule** for auto-activation.

### Top Level

```typescript
{
  version: number             // Config schema version (for migrations)
  settings: GlobalSettings    // System-wide settings
  screens: Screen[]           // Array of display screens (used in single-display mode)
  profiles?: Profile[]        // Named screen groups with optional schedules
  displays?: DisplayNode[]    // Multi-display registry (omitted = single-display mode)
}
```

The `displays` field is opt-in. When it is undefined or empty, Home Screens runs in single-display mode and renders `screens` directly — this is the default for fresh installs and the unchanged behavior for any existing config that predates the multi-display feature. When `displays` is populated, each entry has its own owned screens, dimensions, and rotation; see [DisplayNode](#displaynode-multi-display) below and the [Multi-display guide](/docs/multi-display) for the full hub-and-spoke flow.

### GlobalSettings

```typescript
{
  rotationIntervalMs: number    // Screen rotation interval (default: 30000)
  displayWidth: number          // Canvas width in pixels (default: 1080)
  displayHeight: number         // Canvas height in pixels (default: 1920)
  displayTransform?: 'normal' | '90' | '180' | '270'  // Screen rotation

  latitude: number              // Global location latitude
  longitude: number             // Global location longitude
  locationName?: string         // Human-readable location name
  timezone?: string             // IANA timezone (e.g. "America/Chicago")

  weather: WeatherSettings      // See WeatherSettings below
  calendar: CalendarSettings    // See CalendarSettings below

  sleep?: {
    enabled: boolean
    dimAfterMinutes: number     // Auto-dim after inactivity
    sleepAfterMinutes: number   // Auto-sleep after inactivity
    dimBrightness: number       // Dim level (0-100)
    dimSchedule?: {             // Scheduled dimming
      startTime: string         // "HH:mm" format
      endTime: string           // "HH:mm" format
    }
    schedule?: {                // Scheduled sleep
      startTime: string         // "HH:mm" format
      endTime: string           // "HH:mm" format
    }
  }

  screensaver?: {
    mode: string                // "clock", "blank", or "off"
  }

  cursorHideSeconds?: number      // Seconds of idle before cursor hides (default: 3)
  activeProfile?: string          // Currently active profile ID
  transitionEffect?: TransitionEffect  // Screen transition effect
  transitionDuration?: number     // Transition duration in seconds (default: 0.6)
  updateChannel?: 'stable' | 'dev'    // Update channel for system upgrades
  advancedMode?: boolean              // Reveal developer surfaces (release-channel switcher,
                                       // GitHub PAT card, Plugins → Developer tab). Default false.

  alerts?: {                      // Display alert overlay settings
    enabled: boolean
    position: 'top' | 'bottom'
    maxVisible: number
    defaultDuration: number       // ms — 0 means use per-type defaults
    scale?: number                // 0.75–2.0, default 1.0 — scales alert dimensions
  }

  pauseEnabled?: boolean          // Allow double-tap on pagination dot to pause rotation (default true)
  pauseTimeoutSeconds?: number    // Auto-resume after this many seconds (0 = never, default 300)

  backupReminder?: {
    enabled: boolean              // Show a reminder when backup is overdue (default true)
    intervalDays: number          // Days between reminders (default 7)
  }

  telemetryEnabled?: boolean      // Enable anonymous usage telemetry (on by default)

  fullscreenTheme?: string        // Global preset for fullscreen modules (e.g. "lavender", "sunset")

  locale?: string                 // BCP-47 tag (e.g. "en-US", "de-DE"). Defaults to "en-US".
                                  // Controls display language, dictionary lookup, and (unless
                                  // formattingLocale overrides it) date/number formatting.
  formattingLocale?: string       // Optional BCP-47 override that affects ONLY date/number
                                  // formatting — leaves the active dictionary unchanged.
                                  // Falls back to `locale` when omitted.
}
```

### WeatherSettings

```typescript
{
  provider: 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo' | 'yr' | 'smhi' | 'metoffice' | 'envcanada'
  latitude: number            // Weather-specific latitude (overrides global)
  longitude: number           // Weather-specific longitude (overrides global)
  units: 'metric' | 'imperial'
}
```

### CalendarSettings

```typescript
{
  googleCalendarId: string         // Primary calendar ID (legacy)
  googleCalendarIds: string[]      // Multiple calendar IDs
  icalSources: ICalSource[]        // iCal/ICS feed sources
  maxEvents: number                // Max events to display
  daysAhead: number                // Days to look ahead
  holidayCountry?: string          // ISO 3166-1 alpha-2 country code (e.g. "US")
}
```

### ICalSource

```typescript
{
  id: string
  type: 'ical'
  name: string
  url: string
  color: string
  enabled: boolean
}
```

### TransitionEffect

```typescript
type TransitionEffect =
  | 'fade' | 'slide' | 'slide-up' | 'zoom'
  | 'flip' | 'blur' | 'crossfade' | 'none';
```

### Screen

```typescript
{
  id: string                    // Unique ID (UUID)
  name: string                  // Display name (shown in editor tabs)
  enabled?: boolean             // Whether the screen is shown on display (default: true)
  backgroundImage: string       // Path to background image
  backgroundRotation?: {        // Optional background rotation
    enabled: boolean
    source?: 'unsplash' | 'nasa-apod' | 'immich'  // Image source
    query: string               // Unsplash search query (ignored for other sources)
    intervalMinutes: number
    immichAlbumId?: string      // Immich album filter
    immichPersonId?: string     // Immich person (face) filter
    immichFavoritesOnly?: boolean  // Only use Immich favorites
  }
  modules: ModuleInstance[]     // Modules on this screen
  rotationDurationMs?: number   // Per-screen override of settings.rotationIntervalMs.
                                // undefined = inherit; 0 = sticky (no auto-rotation,
                                // manual advance only); positive = exact ms.
  schedule?: ModuleSchedule     // Optional show/hide schedule for the whole screen.
                                // Filtered out of the rotation pool before profile
                                // resolution; falls back to all enabled screens if
                                // no scheduled screen currently matches.
}
```

### ModuleInstance

```typescript
{
  id: string                    // Unique ID (UUID)
  type: ModuleType              // Module type (e.g. "clock", "weather")
  enabled?: boolean             // false = hidden on display and excluded from
                                // shared-data fetches; omitted/true = shown
  position: { x: number, y: number }   // Top-left position in pixels
  size: { w: number, h: number }       // Width and height in pixels
  zIndex: number                        // Stacking order
  config: Record<string, unknown>       // Module-specific configuration
  style: ModuleStyle                    // Visual styling
  schedule?: ModuleSchedule             // Optional show/hide schedule
}
```

### ModuleSchedule

Controls when a module (or profile) is active based on day of week and time window.

```typescript
{
  daysOfWeek?: number[]    // 0=Sun, 1=Mon, ... 6=Sat (omit = every day)
  startTime?: string       // "06:00" (omit = from midnight)
  endTime?: string         // "09:00" (omit = until midnight)
  invert?: boolean         // if true, HIDE during this window instead of show
}
```

### Profile

Named groups of screens that can be activated manually or on a schedule.

```typescript
{
  id: string                    // Unique ID (UUID)
  name: string                  // Display name (e.g. "Morning", "Evening")
  screenIds: string[]           // Subset of screen IDs to show
  schedule?: ModuleSchedule     // Optional schedule for auto-activation
}
```

Profiles support overnight windows (e.g. 23:00–06:00). When multiple profiles have overlapping schedules, the first matching profile wins. Manual activation via `settings.activeProfile` overrides scheduled profiles.

### DisplayNode (multi-display)

A named display device. Each display owns its own list of screens, designed at its own resolution and orientation. Used in hub-and-spoke deployments where one server drives multiple Pi displays. See the [Multi-display guide](/docs/multi-display) for the install and adoption flow.

```typescript
{
  id: string                       // URL-safe slug used as the route segment: /display/<id>
  name: string                     // Human-readable label shown in the editor
  screens: Screen[]                // Owned screens for this display, designed at its resolution
  displayWidth?: number            // Canvas width in pixels (overrides GlobalSettings.displayWidth)
  displayHeight?: number           // Canvas height in pixels (overrides GlobalSettings.displayHeight)
  displayTransform?: 'normal' | '90' | '180' | '270'  // Per-display rotation
  profiles?: Profile[]             // Owned profiles for this display
  activeProfile?: string           // Per-display active profile (falls back to settings.activeProfile)
  settings?: DisplayNodeSettings   // Per-display setting overrides
}
```

Like `screens`, the `profiles` field is owned by the display: owned profile `screenIds` reference the display's own `screens`, not the global pool. When the first additional display is added to a single-display install, the existing `config.profiles` and `config.settings.activeProfile` migrate onto the auto-created `main` display alongside its screens; subsequent displays start with `profiles: []` so they build fresh against their own screens. In multi-display mode profiles are always per-display — there is no "shared pool" escape hatch, because a pool profile's `screenIds` would silently diverge from each display's owned screens as soon as either one is edited.

`DisplayNodeSettings` is a subset of `GlobalSettings` that can be overridden per display. Nested objects (`sleep`, `screensaver`, `alerts`) are full-replacement, not deep-merged — override the whole object or omit it:

```typescript
{
  displayWidth?: number
  displayHeight?: number
  displayTransform?: 'normal' | '90' | '180' | '270'
  rotationIntervalMs?: number
  transitionEffect?: TransitionEffect
  transitionDuration?: number
  sleep?: SleepSettings
  screensaver?: ScreensaverSettings
  alerts?: AlertSettings
  fullscreenTheme?: string
  cursorHideSeconds?: number
  pauseEnabled?: boolean
  pauseTimeoutSeconds?: number
}
```

Per-display location overrides (`latitude`, `longitude`, `locationName`, `timezone`) are intentionally **not** available: the weather, air-quality, and calendar API routes read location via `readConfig()` directly rather than through `filterConfigForDisplay`, so a per-display override would only affect client rendering while the upstream fetch still used the hub's coordinates.

Per-display dimension fields (top-level on the DisplayNode) override the equivalents nested inside `settings`. Per-display `settings` override the global `settings` on a per-key basis. Rotation is authoritative for canvas orientation: the hub sorts the (width, height) pair so the long edge points along the landscape axis when the rotation is `normal`/`180` and along the portrait axis when it's `90`/`270`.

**Validation rules** (enforced when the config is written):

| Rule | Limit |
|---|---|
| Display ID format | URL-safe slug — lowercase letters, digits, hyphens; must start with a letter or digit |
| Display ID length | ≤ 64 characters |
| IDs must be unique | Yes |
| Reserved IDs | `all` cannot be used (it is the broadcast keyword on command endpoints) |
| Maximum displays | 64 per config |
| Maximum screens per display | 256 |
| Dimensions | Positive integers, ≤ 16384 |
| Owned profile IDs | Must be unique within the display's `profiles` list |
| Owned profile `screenIds` | Must reference the display's own `screens` (not the global pool) |
| `activeProfile` references | When owned profiles are present, must be a member of `profiles`; otherwise must reference the global profile list |

### ModuleType

There are {% $stats.moduleCount %} built-in module types. Plugin modules use the `plugin:<name>` format.

```typescript
type BuiltinModuleType =
  | 'clock'
  | 'calendar'
  | 'weather'
  | 'countdown'
  | 'dad-joke'
  | 'text'
  | 'image'
  | 'quote'
  | 'todo'
  | 'sticky-note'
  | 'greeting'
  | 'news'
  | 'stock-ticker'
  | 'crypto'
  | 'word-of-day'
  | 'history'
  | 'moon-phase'
  | 'sunrise-sunset'
  | 'photo-slideshow'
  | 'qr-code'
  | 'year-progress'
  | 'traffic'
  | 'sports'
  | 'air-quality'
  | 'todoist'
  | 'rain-map'
  | 'multi-month'
  | 'garbage-day'
  | 'standings'
  | 'affirmations'
  | 'date'
  | 'display-control'
  | 'meal-planner'
  | 'iframe'
  | 'icon'
  | 'shape'
  | 'chore-chart'
  | 'fullscreen-calendar'
  | 'fullscreen-chore-chart'
  | 'fullscreen-meal-planner'
  | 'fullscreen-photo';

type PluginModuleType = `plugin:${string}`;

type ModuleType = BuiltinModuleType | PluginModuleType;
```

### ModuleStyle

```typescript
{
  opacity: number               // 0–1
  borderRadius: number          // Pixels
  padding: number               // Pixels
  backgroundColor: string      // CSS color (e.g. "rgba(0,0,0,0.4)")
  textColor: string             // CSS color (e.g. "#ffffff")
  fontFamily: string            // CSS font-family
  fontSize: number              // Base font size in pixels
  backdropBlur: number          // Backdrop blur in pixels
  borderWidth: number           // Border width in pixels
  borderColor: string           // CSS color for border
  shadowSize: number            // Box shadow size in pixels
}
```

## Module Configs

### ClockConfig

```typescript
{
  view: ClockView              // one of the 18 view names below
  format24h: boolean
  showSeconds: boolean
  showDate: boolean
  dateFormat: string
  showWeekNumber: boolean
  showDayOfYear: boolean

  // View-specific fields (safe to leave at defaults for views that ignore them)
  showNumerals: boolean        // analog: hour numbers on the clock face
  animateFlip: boolean         // flip: animate digit flips
  accentColor: string          // shared accent color for several views
  worldZones: WorldClockZone[] // world: up to 3 extra timezones
  referenceTime: string        // elapsed: ISO timestamp or time string
  referenceLabel: string       // elapsed: label ("market open", "shift start")
  countUp: boolean             // elapsed: count up (true) or down (false)
}

type ClockView =
  | 'classic' | 'digital' | 'analog' | 'minimal' | 'flip'
  | 'word'    | 'binary'  | 'vertical' | 'split' | 'progress'
  | 'fuzzy'   | 'world'   | 'dot-matrix' | 'radial' | 'arc'
  | 'neon'    | 'bar'     | 'elapsed'

interface WorldClockZone {
  label: string
  timezone: string             // IANA zone, e.g. "America/Los_Angeles"
}
```

### CalendarConfig

```typescript
{
  viewMode: 'daily' | 'agenda' | 'week' | 'month'
  daysToShow: number
  showTime: boolean
  showLocation: boolean
  maxEvents: number
  showWeekNumbers: boolean
  accentColor?: string         // Event indicator bar and today highlights (default '#3b82f6')
}
```

### FullscreenCalendarConfig

Fullscreen ambient calendar display with 5 views. Uses the `fillsCanvas` flag to auto-size to display dimensions.

```typescript
{
  view: 'schedule' | 'week-list' | 'month-grid' | 'day-timeline' | 'agenda'
  density: 'cozy' | 'snug'
  typographySize: 'small' | 'medium' | 'large' | 'extra-large' | '2x-large' | '3x-large' | '4x-large'
  accentColor: string
  dimPastEvents: boolean
  shadeWeekends: boolean
  showWeather: boolean
  showNowLine: boolean
  sourceFilter?: string[]        // Calendar source IDs (empty = all)
  darkMode: boolean

  // Schedule view
  scheduleDaysToShow: number     // 1-7, 0 = auto
  scheduleHourStart: number      // 0-23
  scheduleHourEnd: number        // 1-24

  // Week list view
  weekCollapsePastDays: boolean

  // Month grid view
  monthShowWeekNumbers: boolean
  monthMaxEventsPerCell: number  // 0 = auto

  // Day timeline view
  dayHourStart: number
  dayHourEnd: number
  dayShowLocation: boolean

  // Agenda view
  agendaDaysAhead: number        // 7-30
  agendaHideEmptyDays: boolean
}
```

### WeatherConfig

{% $stats.weatherProviderCount %} providers are supported: **OpenWeatherMap**, **WeatherAPI**, **Pirate Weather** (a Dark Sky replacement with minutely precipitation and alerts), **NOAA** (free, no API key, US only), **Open-Meteo** (free, no API key, global coverage), **Yr.no** (free, no API key, Norwegian Meteorological Institute, global coverage), **SMHI** (free, no API key, Swedish Meteorological and Hydrological Institute, Nordic coverage), **Met Office** (free, no API key, UK coverage), and **Environment Canada** (free, no API key, Canadian cities via ECCC citypage feeds). {% $stats.weatherViewCount %} views are available.

```typescript
{
  view: 'current' | 'hourly' | 'daily' | 'combined' | 'compact' | 'table' | 'precipitation' | 'alerts'
  iconSet: 'outline' | 'color'
  provider: 'global' | 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo' | 'yr' | 'smhi' | 'metoffice' | 'envcanada'
  hoursToShow: number
  showFeelsLike: boolean
  daysToShow: number
  showHighLow: boolean
  showPrecipAmount: boolean
  showPrecipitation: boolean
  showHumidity: boolean
  showWind: boolean
  showPressure: boolean
  showVisibility: boolean
  showDewPoint: boolean
  hideWhenNoAlerts: boolean    // For alerts view: hide module when no active alerts
}
```

### CountdownConfig

```typescript
{
  events: CountdownEvent[]
  showPastEvents: boolean
  scale: number               // 0.5 – 4, default 1
  view: 'all' | 'next'
  holidayCountry?: string
}
```

### CountdownEvent

```typescript
{
  id: string
  name: string
  date: string                // ISO date string
  recurring?: 'yearly'
  source?: 'custom' | 'holiday'
  backgroundImage?: string
}
```

### DadJokeConfig

```typescript
{
  refreshIntervalMs: number
  accentColor?: string         // Accent color for background tint and decorative elements
  showDividers?: boolean       // Show decorative dividers (default true)
}
```

### TextConfig

```typescript
{
  content: string
  alignment: 'left' | 'center' | 'right'
  orientation?: 'horizontal' | 'vertical' | 'sideways'
  verticalAlign?: 'top' | 'center' | 'bottom'
  markdown?: boolean                    // Enable markdown rendering
  autoFit?: boolean                     // Auto-fit text to container
  effect?: 'none' | 'typewriter' | 'fade-in' | 'gradient-sweep' | 'glow'
  rotationEnabled?: boolean             // Rotate through content chunks
  rotationIntervalMs?: number           // Rotation interval
  rotationSeparator?: string            // Separator for splitting content
  gradientEnabled?: boolean             // Enable gradient text
  gradientFrom?: string                 // Gradient start color
  gradientTo?: string                   // Gradient end color
  gradientAngle?: number                // Gradient angle
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  letterSpacing?: number                // Letter spacing in px
  icon?: string                         // Icon prefix (emoji)
  templateVariables?: boolean           // Enable {{time}}, {{date}}, etc.
  marquee?: boolean                     // Enable marquee scrolling
  marqueeSpeed?: number                 // Marquee scroll speed
  marqueeDirection?: 'left' | 'right' | 'up' | 'down'
}
```

### ImageConfig

```typescript
{
  src: string
  objectFit: 'cover' | 'contain' | 'fill'
  alt: string
}
```

### QuoteConfig

```typescript
{
  refreshIntervalMs: number
  accentColor?: string         // Accent color for decorative elements and borders
}
```

### TodoConfig

```typescript
{
  title: string
  items: { id: string; text: string; completed: boolean }[]
  accentColor?: string         // Accent color for checkboxes and progress indicator
}
```

### StickyNoteConfig

```typescript
{
  content: string
  noteColor: string
}
```

### GreetingConfig

```typescript
{
  name: string
  accentColor?: string         // Accent color for the greeting text
  weatherAware?: boolean       // Default true. Shows a contextual subtitle
                               // like "Rainy day ahead" when weather data
                               // is available. Requires location configured
                               // in Settings > Weather.
}
```

### NewsConfig

```typescript
{
  feedUrl: string
  view: 'headline' | 'list' | 'ticker' | 'compact'
  refreshIntervalMs: number
  rotateIntervalMs: number
  maxItems: number
  showTimestamp: boolean
  showDescription: boolean
  tickerSpeed: number
  accentColor?: string         // List bullet color (optional)
}
```

### StockTickerConfig

```typescript
{
  symbols: string
  refreshIntervalMs: number
  view: 'cards' | 'ticker' | 'table' | 'compact'
  cardScale: number
  tickerSpeed: number
}
```

### CryptoConfig

```typescript
{
  ids: string
  refreshIntervalMs: number
  view: 'cards' | 'ticker' | 'table' | 'compact'
  cardScale: number
  tickerSpeed: number
}
```

### WordOfDayConfig

```typescript
{
  accentColor?: string         // Accent color for underline and part-of-speech tag
  showDividers?: boolean       // Show decorative dividers (default true)
}
```

### HistoryConfig

```typescript
{
  refreshIntervalMs: number
  rotationIntervalMs: number
  accentColor?: string         // Accent color for years-ago badge and dividers
  showDividers?: boolean       // Show decorative dividers (default true)
  sourceMuffinLabs?: boolean   // Enable MuffinLabs data source (default true)
  sourceWikipedia?: boolean    // Enable Wikipedia "On This Day" data source (default true)
}
```

### MoonPhaseConfig

```typescript
{
  showIllumination: boolean
  showMoonTimes: boolean
}
```

### SunriseSunsetConfig

```typescript
{
  view: 'default' | 'arc'   // 'default' text layout, or arc-shaped day diagram
  showDayLength: boolean
  showGoldenHour: boolean
}
```

### PhotoSlideshowConfig

```typescript
{
  directory: string
  intervalMs: number
  transition: 'fade' | 'none'
  objectFit: 'cover' | 'contain' | 'fill'
  refreshIntervalMs: number
  source?: 'local' | 'immich'          // Photo source (default: local)
  immichAlbumId?: string               // Immich album filter
  immichPersonId?: string              // Immich person (face) filter
  immichFavoritesOnly?: boolean        // Only use Immich favorites
  immichCount?: number                 // Photos per refresh (10–200, default 50)
}
```

### QRCodeConfig

```typescript
{
  mode: 'custom' | 'wifi'
  // Custom mode
  data: string
  label: string
  // WiFi mode
  ssid: string
  password: string
  authType: 'WPA' | 'WEP' | 'nopass'
  hiddenNetwork: boolean
  showPassword: boolean
  showNetworkName: boolean
  // Shared
  fgColor: string
  bgColor: string
}
```

### YearProgressConfig

```typescript
{
  showYear: boolean
  showMonth: boolean
  showWeek: boolean
  showDay: boolean
  showPercentage: boolean
  accentColor?: string         // Accent color for progress bars and glow effects
}
```

### TrafficConfig

```typescript
{
  routes: { label: string; origin: string; destination: string }[]
  refreshIntervalMs: number
}
```

### SportsConfig

```typescript
{
  view: 'scoreboard' | 'cards' | 'list' | 'ticker'
  leagues: string[]
  refreshIntervalMs: number
  tickerSpeed: number
}
```

### AirQualityConfig

```typescript
{
  showAQI: boolean
  showPollutants: boolean
  refreshIntervalMs: number
}
```

### TodoistConfig

Connects to the Todoist API (requires a Todoist API token configured in Settings > Integrations).

```typescript
{
  viewMode: 'list' | 'board' | 'focus'
  groupBy: 'none' | 'project' | 'priority' | 'date' | 'label'
  sortBy: 'default' | 'priority' | 'due_date' | 'alphabetical'
  projectFilter: string
  labelFilter: string
  showNoDueDate: boolean
  showSubtasks: boolean
  showLabels: boolean
  showProject: boolean
  showDescription: boolean
  maxTasks: number
  refreshIntervalMs: number
  title: string
}
```

### RainMapConfig

Animated precipitation radar overlay on a map tile layer. Uses RainViewer API.

```typescript
{
  latitude: number
  longitude: number
  zoom: number
  animationSpeedMs: number
  extraDelayLastFrameMs: number
  colorScheme: number
  smooth: boolean
  showSnow: boolean
  opacity: number
  showTimestamp: boolean
  showTimeline: boolean
  refreshIntervalMs: number
  mapStyle: 'dark' | 'standard'
}
```

### MultiMonthConfig

Displays multiple months in a calendar grid.

```typescript
{
  view: 'vertical' | 'horizontal'
  monthCount: number
  startDay: 'sunday' | 'monday'
  showWeekNumbers: boolean
  highlightWeekends: boolean
  showAdjacentDays: boolean
}
```

### GarbageDayConfig

Tracks collection schedules for trash, recycling, and a custom bin. Supports weekly or biweekly frequencies.

```typescript
{
  trashDay: number            // 0=Sun, 1=Mon, ..., 6=Sat, -1=disabled
  trashFrequency: 'weekly' | 'biweekly'
  trashStartDate: string      // ISO date anchor for biweekly calculation
  trashColor: string
  recyclingDay: number
  recyclingFrequency: 'weekly' | 'biweekly'
  recyclingStartDate: string
  recyclingColor: string
  customDay: number
  customFrequency: 'weekly' | 'biweekly'
  customStartDate: string
  customColor: string
  customLabel: string
  highlightMode: 'day-of' | 'day-before'
}
```

### AffirmationsConfig

Rotating positive affirmations with 4 visual styles and 5 categories. Supports time-aware selection and optional weather-aware scoring.

```typescript
{
  view: 'elegant' | 'card' | 'minimal' | 'typewriter'
  categories: ('affirmations' | 'compliments' | 'motivational' | 'gratitude' | 'mindfulness')[]
  rotationIntervalMs: number
  showCategoryLabel: boolean
  timeAware: boolean           // Adjust messages based on time of day, day of week, season
  weatherAware?: boolean       // Default true. Boosts entries tagged with
                               // a matching weather condition (+2 score)
                               // without hiding non-matching entries.
                               // Requires location configured in
                               // Settings > Weather.
  customEntries: { id: string; text: string; attribution?: string }[]
  accentColor: string          // Accent color for card/typewriter views
}
```

### StandingsConfig

Displays league standings from ESPN. Supports {% $stats.standingsLeagueCount %} leagues with team colors. Three views: full table, compact, and conference.

```typescript
{
  view: 'table' | 'compact' | 'conference'
  league: string
  grouping: 'division' | 'conference' | 'league'
  teamsToShow: number
  showPlayoffLine: boolean
  rotationIntervalMs: number
  refreshIntervalMs: number
}
```

### DateConfig

Date display module with 5 visual styles.

```typescript
{
  view: 'full' | 'minimal' | 'stacked' | 'editorial' | 'banner'
  dateFormat: string
  showDayName: boolean
  showYear: boolean
  showWeekNumber: boolean
  showDayOfYear: boolean
  accentColor: string
}
```

### MealPlannerConfig

Weekly meal planning with 5 views and 4 meal slots. Time-aware display highlights the current or next meal. The per-module config only contains visual options — the meal library, weekly plan, grocery list, and household-wide settings (enabled slots, week start day, default serving times, time format) all live in `data/meals.json` via the `/api/meals/data` endpoint with atomic writes. This keeps every meal-planner module on the same display in sync without duplicating settings into each module.

```typescript
{
  view: 'week' | 'today' | 'next-meal' | 'compact' | 'list'
  showEmoji: boolean
  showPrepTime: boolean
  showTags: boolean
  accentColor: string
}
```

Meal data is stored separately in `data/meals.json`:

```typescript
{
  settings: MealSettings      // Household-wide planning settings (enabled slots, week start, slot times, time format)
  savedMeals: SavedMeal[]     // Meal library (name, emoji, tags, prep/cook time, difficulty, ingredients, etc.)
  plan: PlannedMeal[]         // Weekly schedule entries
  grocery: string[]           // Grocery list items
}
```

`MealSettings` is edited from the `/remote` Meals tab so every meal module on every display stays consistent:

```typescript
{
  enabledSlots: ('breakfast' | 'lunch' | 'dinner' | 'snack')[]
  weekStartDay: 'sunday' | 'monday'
  defaultSlotTimes: { breakfast?: string; lunch?: string; dinner?: string; snack?: string }  // "HH:MM" 24h
  timeFormat: '12h' | '24h'
}
```

Each `PlannedMeal` uses an ISO date string to support multi-week planning:

```typescript
{
  date: string                // ISO date (e.g. "2026-04-04")
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  mealId?: string             // References a SavedMeal.id
  customText?: string         // Freeform text (e.g. "Eating out", "Leftovers")
  notes?: string
}
```

Old configs that used `day: number` (day-of-week index) are automatically migrated to ISO date format on first read.

### IframeConfig

Embeds an external web page. Supports configurable refresh and sandboxing.

```typescript
{
  url: string
  refreshIntervalMs: number
  scrollable: boolean
  sandboxEnabled: boolean
  sandbox: string
  title: string
}
```

### ChoreChartConfig

Family chore tracking with 5 views, point system, and rotation support.

```typescript
{
  view: 'board' | 'star-chart' | 'today' | 'progress' | 'compact'
  members: { id: string; name: string; emoji: string; color: string }[]
  chores: {
    id: string
    name: string
    emoji: string
    points: number            // 0 or greater (a 0-point chore has no reward impact)
    frequency: 'daily' | 'weekly' | 'biweekly' | 'once'
    specificDate?: string     // Only used when frequency === 'once'. ISO YYYY-MM-DD.
    daysOfWeek: number[]
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'anytime'
    assigneeIds: string[]
    rotation: 'fixed' | 'rotate-daily' | 'rotate-weekly' | 'schedule'
    schedule?: Record<string, number[]>  // memberId → days-of-week (0–6).
                                          // Only used when rotation === 'schedule'.
                                          // Lets you assign different members to
                                          // different days, e.g. Alice Mon/Wed,
                                          // Bob Tue/Thu, everyone Fri–Sun.
  }[]
  weekStartDay: 'sunday' | 'monday'
  showPoints: boolean
  showStreaks: boolean
  showTimeOfDay: boolean
  allowDisplayComplete: boolean
  accentColor: string
}
```

### FullscreenChoreChartConfig

Fullscreen ambient chore chart display. Uses the `fillsCanvas` flag to auto-size to display dimensions. Reads members and chores from shared `data/chores.json` rather than per-module config.

```typescript
{
  view: 'chores' | 'rewards-store'
  showRewardsButton: boolean
  weekStartDay: 'sunday' | 'monday'
  showPoints: boolean
  showStreaks: boolean
  showTimeOfDay: boolean
  darkMode: boolean
  density: 'cozy' | 'snug'
  typographySize: 'small' | 'medium' | 'large' | 'extra-large' | '2x-large' | '3x-large' | '4x-large'
  accentColor: string
}
```

## Display Resolution Presets

| Preset | Width | Height |
|---|---|---|
| Portrait 1080p | 1080 | 1920 |
| Portrait 1440p | 1440 | 2560 |
| Portrait 4K | 2160 | 3840 |
| Landscape 720p | 1280 | 720 |
| Landscape 1080p | 1920 | 1080 |
| Landscape 1440p | 2560 | 1440 |
| Landscape 4K | 3840 | 2160 |

## Config Migrations

Config files include a `version` number. When the schema changes between releases, migrations in `src/lib/migrations/` automatically transform older configs to the current format on load.

## Validation CLI

Home Screens ships a standalone validator for `data/config.json` that you can run without starting the dev server. It checks the schema version, module types, screen and module structure, profile references, multi-display registry constraints, and settings bounds, then reports a typed list of diagnostics with colored output.

```bash
npm run config:check
```

A clean config exits with status `0` and a "No issues found" summary. Any errors — unknown module types, duplicate screen IDs, profile references to non-existent screens, out-of-range display dimensions, etc. — exit with a non-zero status and a list of diagnostic entries, making the CLI safe to wire into a pre-commit hook or CI step on a server that mounts `data/`. The same validation rules are exposed programmatically from `src/lib/validate-config.ts` if you want to reuse them from your own tooling.

## Backup & Restore

- **Export** from the editor's Data section or the remote's Settings sheet downloads a full backup as JSON
- **Import** replaces the current config with an uploaded JSON file (available in both the editor and the remote)
- A configurable **backup reminder** shows a toast in the editor and a banner on the remote when you haven't backed up recently (Settings > Data)
- Manual backups: copy `data/config.json` to a safe location

## Example

```json
{
  "version": 5,
  "settings": {
    "rotationIntervalMs": 30000,
    "displayWidth": 1080,
    "displayHeight": 1920,
    "latitude": 44.7133,
    "longitude": -93.4227,
    "timezone": "America/Chicago",
    "weather": {
      "provider": "pirateweather",
      "latitude": 44.7133,
      "longitude": -93.4227,
      "units": "imperial"
    },
    "calendar": {
      "googleCalendarIds": ["primary"],
      "maxEvents": 10,
      "daysAhead": 7
    }
  },
  "screens": [
    {
      "id": "abc-123",
      "name": "Main",
      "backgroundImage": "/backgrounds/sunset.jpg",
      "modules": [
        {
          "id": "mod-1",
          "type": "clock",
          "position": { "x": 20, "y": 40 },
          "size": { "w": 1040, "h": 220 },
          "zIndex": 1,
          "config": {
            "format24h": false,
            "showSeconds": true,
            "showDate": true
          },
          "style": {
            "opacity": 1,
            "borderRadius": 12,
            "padding": 16,
            "backgroundColor": "rgba(0,0,0,0.4)",
            "textColor": "#ffffff",
            "fontFamily": "Inter, system-ui, sans-serif",
            "fontSize": 16,
            "backdropBlur": 12
          }
        }
      ]
    }
  ]
}
```
