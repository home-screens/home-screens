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
| `data/meals.json` | Meal library, weekly plan, checked-off grocery items, household meal settings | `/api/meals/data` |
| `data/chores.json` | Chore definitions and family members | `/api/chores/data` |
| `data/chore-completions.json` | Chore completion history (last 90 days) | `/api/chores` |
| `data/rewards.json` | Reward definitions, point balances, redemption history | `/api/rewards/data` |
| `data/google-tokens.json` | Google Calendar OAuth tokens | (internal) |
| `data/icloud-accounts.json` | iCloud account credentials (app-specific passwords) for calendar sync | `/api/icloud/accounts` |
| `data/todo-state.json` | Checked-off state for interactive todo modules | `/api/todo/state` |
| `data/backup-state.json` | Last-backup and last-dismissed timestamps behind the backup reminder | `/api/backup` |
| `data/port.conf` | Custom server port (preserved across upgrades) | (internal) |
| `data/plugins/` | Installed plugin bundles and manifests | `/api/plugins/*` |
| `data/plugin-tokens/` | Per-plugin account tokens from server-side auth adapters | `/api/plugins/auth/*` |
| `data/plugin-secrets/` | Per-plugin secrets you enter yourself, kept outside `data/plugins/` because a plugin upgrade replaces that folder wholesale | `/api/plugins/secrets` |

Chore definitions and chore completions are **two separate files**. Copying only `data/chores.json` leaves every completion (and therefore every earned point) behind.

Other files under `data/` (`backups/`, `kiosk.conf`, `telemetry.json`, `background-cache.json`) are written and managed by the app; they are not meant to be edited by hand.

The main config is read via `GET /api/config` and written via `PUT /api/config`. If you have set an editor password, both endpoints require an `hs-session` cookie: `PUT` accepts nothing else, and `GET` also accepts a display bearer token. With no password set, authentication is off and both are open on your local network.

{% callout type="warning" %}
**Close the editor tab before hand-editing `data/config.json`.** The editor loads the whole config into memory when the page opens and writes the whole file back when you save, so any change you made on disk in between is silently overwritten. `PUT /api/config` works the same way; it replaces the file wholesale rather than merging your changes into it.
{% /callout %}

## API Keys & Credentials

API keys and credentials are managed through the editor UI under **Settings > API keys** and stored server-side in `data/secrets.json` via the `/api/secrets` endpoint. They are **not** stored in `.env.local` or in the config file.

Supported secret keys:

| Key | Used By |
|---|---|
| `openweathermap_key` | Weather (OpenWeatherMap provider), Air Quality |
| `weatherapi_key` | Weather (WeatherAPI provider) |
| `pirateweather_key` | Weather (Pirate Weather provider) |
| `metoffice_key` | Weather (Met Office provider) |
| `unsplash_access_key` | Background rotation (Unsplash) |
| `todoist_token` | Todoist module |
| `google_maps_key` | Traffic module (Google Routes) |
| `tomtom_key` | Traffic module (TomTom) |
| `google_client_id` | Google Calendar OAuth |
| `google_client_secret` | Google Calendar OAuth |
| `google_web_client_id` | Google Photos import (web application OAuth client) |
| `google_web_client_secret` | Google Photos import (web application OAuth client) |
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
  rules?: DisplayRule[]       // Display rules for single-display mode (multi-display rules live on each DisplayNode)
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
  displayTransform?: 'normal' | '90' | '180' | '270'  // Screen rotation (default: '90', portrait)

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
  swipeEnabled?: boolean          // Flick left/right on the touchscreen to change screens (default true)

  backupReminder?: {
    enabled: boolean              // Show a reminder when backup is overdue (default true)
    intervalDays: number          // Days between reminders (default 7)
  }

  telemetryEnabled?: boolean      // Enable anonymous usage telemetry (on by default)

  updateNotification?: {
    enabled: boolean              // Show a banner when a new release is available
  }

  fullscreenTheme?: string        // Global theme preset for fullscreen modules. One of
                                  // "linen", "paper", "mist" (light) or "charcoal",
                                  // "midnight", "slate" (dark).

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
  icloudSources?: ICloudSource[]   // iCloud calendars picked from connected accounts
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

### ICloudSource

```typescript
{
  id: string
  accountId: string                // ICloudAccount.id in data/icloud-accounts.json
  kind: 'calendar' | 'birthdays'   // A CalDAV calendar, or contact birthdays via CardDAV
  url: string                      // CalDAV calendar URL; empty for kind 'birthdays'
  name: string
  color: string                    // Apple's calendar color, preserved from iCloud
  enabled: boolean
}
```

Account credentials (Apple ID + app-specific password) are **not** stored in the config file — they live in `data/icloud-accounts.json` and are referenced by `accountId`.

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
    source?: 'unsplash' | 'nasa-apod' | 'immich' | 'icloud'  // Image source
    query: string               // Unsplash search query (ignored for other sources)
    intervalMinutes: number
    immichAlbumId?: string      // Immich album filter
    immichPersonId?: string     // Immich person (face) filter
    immichFavoritesOnly?: boolean  // Only use Immich favorites
    icloudAlbumUrl?: string     // iCloud shared album link or bare token (icloud source)
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
  visibility?: ModuleVisibility         // Optional conditions over shared state
  backgroundProvider?: boolean          // true = never rendered on screen; mounts
                                        // once in a hidden layer so its data loop
                                        // (and published state) survives rotation
}
```

The three visibility gates (`enabled`, `schedule`, `visibility`) are AND-combined: a module renders only when it is enabled, its schedule window matches, and its visibility conditions are met.

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

### ModuleVisibility

Shows or hides a module based on values published to the shared state bus. Only plugins publish, via the SDK's `publishState`. Marking a plugin instance `backgroundProvider` keeps it publishing across screen rotation; the flag has no state-publishing effect on built-in modules, none of which publish anything. Conditions follow Home Assistant-style semantics.

```typescript
{
  conditions: VisibilityCondition[]   // Implicit AND across the array; met = show
  whenUnknown?: 'show' | 'hide'       // Outcome while any referenced key is not yet
                                      // published (default 'hide'); evaluated before
                                      // the condition tree
}
```

```typescript
type VisibilityCondition =
  | { kind: 'state';   sourceKey: string, equals?: string | string[], notEquals?: string | string[] }
  | {
      kind: 'numeric'; sourceKey: string
      above?: number, aboveInclusive?: boolean   // aboveInclusive: >= instead of >
      below?: number, belowInclusive?: boolean   // belowInclusive: <= instead of <
    }
  | {
      // Local time-of-day / day-of-week gate — no shared-state key, so it
      // fences a condition tree (or a rule) by the clock. daysOfWeek/startTime/
      // endTime use the same format as ModuleSchedule (no `invert` here — wrap
      // in a `not` condition to invert instead). All fields absent means
      // "always true"; this kind never evaluates to unknown.
      kind: 'time'; daysOfWeek?: number[], startTime?: string, endTime?: string
    }
  | { kind: 'and';     conditions: VisibilityCondition[] }
  | { kind: 'or';      conditions: VisibilityCondition[] }
  | { kind: 'not';     conditions: VisibilityCondition[] }
```

`sourceKey` references a published state key (plugin keys are prefixed `plugin:<id>:`). Conditions are edited visually in the editor's module Visibility panel; the key picker is sourced from the keys plugins declare in their manifest's `providesState` field, or compute from their config via a `deriveProvidedKeys` export. Check the **Or equal to** box next to a numeric bound to make it inclusive. See the [Plugins guide](/docs/plugins#shared-state-and-visibility-conditions) for the publishing side.

Save-time limits: at most 32 conditions per module (leaves and groups combined) and 5 levels of `and` / `or` / `not` nesting, and a group condition must have at least one child. Exceeding any of these makes `PUT /api/config` fail with a 400 rather than saving.

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

Profiles support overnight windows (e.g. 23:00–06:00). Scheduled profiles take precedence: at each tick the first profile in list order whose schedule matches, and that still resolves to at least one screen, wins. `settings.activeProfile` is the fallback used when no scheduled profile matches. If neither produces screens, all screens are shown.

### DisplayRule

A condition → action rule owned by a display. Rules reuse the `VisibilityCondition` tree and evaluator unchanged, but are edge-triggered: a rule fires only on the false→true transition of its conditions, never while they merely stay true, so a reboot or a restarting state producer never slams the display onto an alert screen for a condition that has been true for hours. Rules live under **Settings > Automation > Rules** and are per-display in multi-display setups.

```typescript
{
  id: string                      // Unique ID (UUID)
  name: string                    // e.g. "Doorbell → front camera"
  enabled?: boolean                // Default true
  when: VisibilityCondition[]     // Implicit AND, same tree as ModuleVisibility
  action: RuleAction
  cooldownSeconds?: number        // Seconds after a firing before it can re-fire. Default 0.
}
```

When multiple rules could fire at once, the first one in list order wins; reorder rules by dragging their cards. In multi-display setups, a rule can be copied to another display — since screens are per-display, a copied `showScreen` action arrives with its target screen cleared, ready to point at a screen on the new display.

Save-time limit: at most 64 rules per display. The `when` tree obeys the same condition and nesting limits as `ModuleVisibility` above.

### RuleAction

```typescript
type RuleAction =
  | {
      kind: 'showScreen'
      screenId: string             // Resolved against the owning display's screens
      mode: 'while' | 'for'        // 'while': pinned as long as the condition holds
                                    // (minimum 5s hold, to smooth out flapping sensors)
                                    // 'for': shown for `seconds`, then rotation resumes
      seconds?: number              // Required when mode is 'for'
    }
  | { kind: 'wake' }                // Wake from sleep; no-op if already awake
  | { kind: 'sleep' }               // Sleep, exactly like the remote sleep command; ends any active takeover
```

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
  rules?: DisplayRule[]            // Owned rules for this display (see DisplayRule above)
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
  swipeEnabled?: boolean
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
| Maximum displays | 64 per config |
| Maximum screens per display | 256 |
| Dimensions | Positive integers, ≤ 16384 |
| Owned profile IDs | Must be unique within the display's `profiles` list |
| Owned profile `screenIds` | Must reference the display's own `screens` (not the global pool) |
| `activeProfile` references | When owned profiles are present, must be a member of `profiles`; otherwise must reference the global profile list |

{% callout type="warning" %}
**Do not name a display `all`.** The command endpoints treat `all` as the keyword meaning "every display", so a display with that id never receives anything sent to it. This is not currently rejected when the config is saved, so the name has to be avoided by hand.
{% /callout %}

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
  | 'video'
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
  fontFamily: string            // Font registry id (default "inter"); see the list below
  fontSize: number              // Base font size in pixels
  backdropBlur: number          // Backdrop blur in pixels
  borderWidth: number           // Border width in pixels
  borderColor: string           // CSS color for border
  shadowSize: number            // Box shadow size in pixels
}
```

`fontFamily` stores a font registry **id**, not a raw CSS stack. The available ids are `inter`, `roboto`, `poppins`, `system-ui`, `playfair`, `lora`, `dm-serif`, `georgia`, `jetbrains`, `mono`, `bebas`, `caveat`, and `pacifico`. The fonts themselves are bundled at build time, so only these ids are guaranteed to load. A raw CSS stack is still accepted for backward compatibility, but anything the registry does not recognize is passed to the browser verbatim and will fall back to a system font.

## Module Configs

Each `ModuleInstance.config` object holds the fields for its module type. Those fields, with their defaults and allowed values, are documented one table per module in the **[Module Reference](/docs/module-reference)** — that page is the source of truth for module options, and the stored JSON matches it exactly.

## Shared data files

Three features deliberately keep their data **outside** `config.json`. The per-module config holds display options only; the data itself lives in a shared file so every module instance stays in sync, and so a save from the editor can never clobber something changed from `/remote` or tapped on a display.

### data/meals.json

The meal library, weekly plan, grocery check-offs, and household-wide planning settings, written atomically via `/api/meals/data`. Settings live here rather than on each module so `/remote` and every meal-planner instance agree.

```typescript
{
  settings: MealSettings      // Household-wide planning settings (enabled slots, week start, slot times, time format)
  savedMeals: SavedMeal[]     // Meal library (name, emoji, tags, prep/cook time, difficulty, ingredients, etc.)
  plan: PlannedMeal[]         // Weekly schedule entries
  groceryChecked: string[]    // Ingredient names that have been checked off. The grocery
                              // list itself is derived from the planned meals' ingredients
                              // and is not stored.
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
  time?: string               // Serving time, "HH:MM" 24h. Overrides
                              // settings.defaultSlotTimes[slot] for this one entry,
                              // so Tuesday's dinner can be at 18:30 and Friday's at 19:00.
}
```

Old configs that used `day: number` (day-of-week index) are automatically migrated to ISO date format on first read.

### data/chores.json

Family members and chore definitions, served by `/api/chores/data` and edited from the `/remote` Chores tab.

```typescript
{
  members: ChoreMember[]
  chores: ChoreDefinition[]
}
```

```typescript
interface ChoreMember {
  id: string
  name: string
  emoji: string
  color: string
}

interface ChoreDefinition {
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
}
```

Completions live in a **separate** file, `data/chore-completions.json`, served by `/api/chores`:

```typescript
{
  completions: { choreId: string; memberId: string; date: string }[]  // date is YYYY-MM-DD
}
```

### data/todo-state.json

For a To-Do module with `interactive` on, each item's `completed` value in `config.json` is only the *starting* state. Taps are persisted here instead, keyed by item id, via `/api/todo/state` and `/api/todo/toggle`. That keeps completions out of `config.json` so an editor save can't wipe them, and lets every display showing the same list stay in step.

## Display Resolution Presets

In the editor you pick a resolution and an orientation separately: four presets, labelled **720p HD**, **1080p Full HD**, **1440p QHD**, and **4K UHD**, each with a Portrait/Landscape toggle that swaps the two dimensions. That gives eight combinations:

| Preset | Width | Height |
|---|---|---|
| Portrait 720p | 720 | 1280 |
| Portrait 1080p | 1080 | 1920 |
| Portrait 1440p | 1440 | 2560 |
| Portrait 4K | 2160 | 3840 |
| Landscape 720p | 1280 | 720 |
| Landscape 1080p | 1920 | 1080 |
| Landscape 1440p | 2560 | 1440 |
| Landscape 4K | 3840 | 2160 |

## Config Migrations

Config files include a `version` number. When the schema changes between releases, migrations in `src/lib/migrations/` automatically transform older configs to the current format on load. The current schema version is **5**.

Migration runs when the config is read and the result is written back to disk automatically, so `version` in `data/config.json` updates itself the first time newer code reads an older config. If a migration fails, the un-migrated config is returned as-is rather than falling back to defaults, so a bad upgrade can never quietly replace your setup with an empty one.

Do not hand-edit `version`. A config marked with a version newer than the running code is left alone; there is no downgrade path.

## Validation CLI

Home Screens ships a standalone validator for `data/config.json` that you can run without starting the dev server. It checks the schema version, module types, screen and module structure, profile references, multi-display registry constraints, and settings bounds, then reports a typed list of diagnostics with colored output.

```bash
npm run config:check
```

A clean config exits with status `0` and a "Config is valid" summary. Any errors — unknown module types, duplicate screen IDs, profile references to non-existent screens, out-of-range display dimensions, etc. — exit with a non-zero status and a list of diagnostic entries, making the CLI safe to wire into a pre-commit hook or CI step on a server that mounts `data/`. The same validation rules are exposed programmatically from `src/lib/validate-config.ts` if you want to reuse them from your own tooling.

## Backup & Restore

- **Export** from the editor's Data section or the remote's Settings sheet downloads a backup as JSON. The bundle contains your config, chores, chore completions, meals, and rewards.
- **Import** replaces the current config with an uploaded JSON file (available in both the editor and the remote)
- A configurable **backup reminder** shows a toast in the editor and a banner on the remote when you haven't backed up recently (Settings > Backups & data)

{% callout type="warning" %}
**The export is not everything.** API keys, iCloud and Google credentials, plugin bundles, and plugin account tokens are deliberately left out of the backup file, so restoring on a new Pi comes up with your integrations disconnected and your plugins missing. Re-enter them after a restore. For a genuinely complete copy, take the whole `data/` directory instead. Copying `data/config.json` on its own is narrower still: it captures none of your chores, completions, meals, or rewards.
{% /callout %}

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
      "googleCalendarId": "",
      "googleCalendarIds": ["primary"],
      "icalSources": [],
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
            "view": "classic",
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
            "fontFamily": "inter",
            "fontSize": 16,
            "backdropBlur": 12,
            "borderWidth": 1,
            "borderColor": "rgba(255,255,255,0.15)",
            "shadowSize": 8
          }
        }
      ]
    }
  ]
}
```
