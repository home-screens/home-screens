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
**This page is a reference for power users.** Home Screens stores everything as JSON files, but you almost never need to touch them, the [editor](/docs/editor) manages all of this for you. This page exists to document the schema for scripting, external tooling, or debugging.
{% /callout %}

Home Screens stores all configuration as JSON files on disk. The main config file is `data/config.json`; a few feature-specific data files (meals, chores, rewards) live alongside it. There is no database, every file is read and written directly by the API with atomic writes (temp file + rename) to prevent corruption during power loss.

## Data files

| File | Purpose | API |
|---|---|---|
| `data/config.json` | Screens, modules, profiles, global settings, multi-display registry | `/api/config` |
| `data/secrets.json` | API keys for external integrations (weather, calendar, photos, etc.) | `/api/secrets` |
| `data/auth.json` | Password hash and session secret for editor authentication | (internal) |
| `data/meals.json` | Meal library, weekly plan, checked-off grocery items, household meal settings | `/api/meals/data` |
| `data/family.json` | Shared family members and legacy identity aliases | `/api/family` |
| `data/chores.json` | Chore definitions | `/api/chores/data` |
| `data/chore-completions.json` | Chore completion history (last 90 days) | `/api/chores` |
| `data/rewards.json` | Reward definitions, point balances, redemption history | `/api/rewards/data` |
| `data/google-tokens.json` | Google Calendar OAuth tokens | (internal) |
| `data/icloud-accounts.json` | iCloud account credentials (app-specific passwords) for calendar sync | `/api/icloud/accounts` |
| `data/todos.json` | Shared to-do lists (items, due days, people, repeats) | `/api/todo/lists` |
| `data/routines.json` | Saved timer routines (the steps, not a running timer) | `/api/timers/routines` |
| `data/timer-session.json` | The one timer running right now, as a snapshot plus timestamps so displays can count down on their own | `/api/timers/session` |
| `data/google-picker-tokens.json` | Google Photos Picker tokens, kept separate from the Calendar tokens above | (internal) |
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

## Schema

The configuration has the following structure:

- **ScreenConfiguration** contains a `version` number, a single **GlobalSettings** object, zero or more **Screen** objects, and zero or more **Profile** objects.
- Each **Screen** contains zero or more **ModuleInstance** objects.
- Each **ModuleInstance** has a **ModuleStyle** object, an optional **ModuleSchedule**, and a module-specific config object.
- Each **Profile** has an optional **ModuleSchedule** for auto-activation.

### Top Level

{% type-reference name="ScreenConfiguration" /%}

The `displays` field is opt-in. When it is undefined or empty, Home Screens runs in single-display mode and renders `screens` directly, this is the default for fresh installs and the unchanged behavior for any existing config that predates the multi-display feature. When `displays` is populated, each entry has its own owned screens, dimensions, and rotation; see [DisplayNode](#display-node-multi-display) below and the [Multi-display guide](/docs/multi-display) for the full multi-display flow.

### GlobalSettings

{% type-reference name="GlobalSettings" /%}

#### SleepSettings

{% type-reference name="SleepSettings" /%}

#### ScreensaverSettings

{% type-reference name="ScreensaverSettings" /%}

#### AlertSettings

{% type-reference name="AlertSettings" /%}

#### BackupReminderSettings

{% type-reference name="BackupReminderSettings" /%}

#### UpdateNotificationSettings

{% type-reference name="UpdateNotificationSettings" /%}

### WeatherSettings

{% type-reference name="WeatherSettings" /%}

### CalendarSettings

{% type-reference name="CalendarSettings" /%}

The family grid and free time views join `personSources` against `data/family.json`. Manage people under **Settings > Family** and their calendars under **Settings > Calendar > Whose calendars?** A calendar that no person claims is shared by the whole household. Legacy `people` records are preserved by the schema upgrade until the coordinated family migration folds them safely.

### ICalSource

{% type-reference name="ICalSource" /%}

### ICloudSource

{% type-reference name="ICloudSource" /%}

Account credentials (Apple ID + app-specific password) are **not** stored in the config file, they live in `data/icloud-accounts.json` and are referenced by `accountId`.

### TransitionEffect

{% type-reference name="TransitionEffect" /%}

### Screen

{% type-reference name="Screen" /%}

#### BackgroundRotation

{% type-reference name="BackgroundRotation" /%}

### ModuleInstance

{% type-reference name="ModuleInstance" /%}

The three visibility gates (`enabled`, `schedule`, `visibility`) are AND-combined: a module renders only when it is enabled, its schedule window matches, and its visibility conditions are met.

### ModuleSchedule

Controls when a module (or profile) is active based on day of week and time window.

{% type-reference name="ModuleSchedule" /%}

### ModuleVisibility

Shows or hides a module based on values published to the shared state bus. Most values come from plugins, via the SDK's `publishState`. Marking a plugin instance `backgroundProvider` keeps it publishing across screen rotation; the flag has no state-publishing effect on built-in modules, which do not publish anything of their own. Home Screens itself publishes a small set of built-in `calendar.*` values from the display's shared calendar fetch (next event, how many events today, whether something is on right now) whenever a calendar source is configured, those need no module on screen and survive rotation. Conditions follow Home Assistant-style semantics.

{% type-reference name="ModuleVisibility" /%}

#### VisibilityCondition

Each condition is one of these shapes, told apart by its `kind`:

{% type-reference name="VisibilityCondition" /%}

`sourceKey` references a published state key (plugin keys are prefixed `plugin:<id>:`, built-in ones are not). Conditions are edited visually in the editor's module Visibility panel; the key picker lists the built-in values first, under **Built-in**, followed by the keys plugins declare in their manifest's `providesState` field or compute from their config via a `deriveProvidedKeys` export. Check the **Or equal to** box next to a numeric bound to make it inclusive. See the [Plugins guide](/docs/plugin-development#shared-state-and-visibility-conditions) for the publishing side.

Save-time limits: at most 32 conditions per module (leaves and groups combined) and 5 levels of `and` / `or` / `not` nesting, and a group condition must have at least one child. Exceeding any of these makes `PUT /api/config` fail with a 400 rather than saving.

### Profile

Named groups of screens that can be activated manually or on a schedule.

{% type-reference name="Profile" /%}

Profiles support overnight windows (e.g. 23:00–06:00). Scheduled profiles take precedence: at each tick the first profile in list order whose schedule matches, and that still resolves to at least one screen, wins. `settings.activeProfile` is the fallback used when no scheduled profile matches. If neither produces screens, all screens are shown.

### DisplayRule

A condition → action rule owned by a display. Rules reuse the `VisibilityCondition` tree and evaluator unchanged, but are edge-triggered: a rule fires only on the false→true transition of its conditions, never while they merely stay true, so a reboot or a restarting state producer never slams the display onto an alert screen for a condition that has been true for hours. Rules live under **Settings > Automation > Rules** and are per-display in multi-display setups.

{% type-reference name="DisplayRule" /%}

When multiple rules could fire at once, the first one in list order wins; reorder rules by dragging their cards. In multi-display setups, a rule can be copied to another display, since screens are per-display, a copied `showScreen` action arrives with its target screen cleared, ready to point at a screen on the new display.

Save-time limit: at most 64 rules per display. The `when` tree obeys the same condition and nesting limits as `ModuleVisibility` above.

### RuleAction

{% type-reference name="RuleAction" /%}

### DisplayNode (multi-display)

A named display device. Each display owns its own list of screens, designed at its own resolution and orientation. Used in multi-display deployments where one server drives multiple Pi displays. See the [Multi-display guide](/docs/multi-display) for the install and adoption flow.

{% type-reference name="DisplayNode" /%}

Like `screens`, the `profiles` field is owned by the display: owned profile `screenIds` reference the display's own `screens`, not the global pool. When the first additional display is added to a single-display install, the existing `config.profiles` and `config.settings.activeProfile` migrate onto the auto-created `main` display alongside its screens; subsequent displays start with `profiles: []` so they build fresh against their own screens. In multi-display mode profiles are always per-display, there is no "shared pool" escape hatch, because a pool profile's `screenIds` would silently diverge from each display's owned screens as soon as either one is edited.

`DisplayNodeSettings` is a subset of `GlobalSettings` that can be overridden per display. Nested objects (`sleep`, `screensaver`, `alerts`) are full-replacement, not deep-merged, override the whole object or omit it:

{% type-reference name="DisplayNodeSettings" /%}

Per-display location overrides (`latitude`, `longitude`, `locationName`, `timezone`) are intentionally **not** available: the weather, air-quality, and calendar API routes read location via `readConfig()` directly rather than through `filterConfigForDisplay`, so a per-display override would only affect client rendering while the upstream fetch still used the hub's coordinates.

Per-display dimension fields (top-level on the DisplayNode) override the equivalents nested inside `settings`. Per-display `settings` override the global `settings` on a per-key basis. Rotation is authoritative for canvas orientation: the hub sorts the (width, height) pair so the long edge points along the landscape axis when the rotation is `normal`/`180` and along the portrait axis when it's `90`/`270`.

**Validation rules** (enforced when the config is written):

| Rule | Limit |
|---|---|
| Display ID format | URL-safe slug, lowercase letters, digits, hyphens; must start with a letter or digit |
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

{% type-reference name="BuiltinModuleType" /%}

### ModuleStyle

{% type-reference name="ModuleStyle" /%}

`title` and `titleFontSize` only apply to modules that render the standard card frame. Plugin modules and Display Control draw their content without the card, so a title strip can never appear on them, the editor hides the Card Title fields for those modules, and both keys are dropped from a plugin manifest's `defaultStyle` when a module is placed.

`fontFamily` stores a font registry **id**, not a raw CSS stack. The available ids are `inter`, `roboto`, `poppins`, `system-ui`, `playfair`, `lora`, `dm-serif`, `georgia`, `jetbrains`, `mono`, `bebas`, `caveat`, and `pacifico`. The fonts themselves are bundled at build time, so only these ids are guaranteed to load. A raw CSS stack is still accepted for backward compatibility, but anything the registry does not recognize is passed to the browser verbatim and will fall back to a system font.

## Module Configs

Each `ModuleInstance.config` object holds the fields for its module type. Those fields, with their defaults and allowed values, are documented one table per module in the **[Module Reference](/docs/module-reference)**: that page is the source of truth for module options, and the stored JSON matches it exactly.

## Shared data files

Three features deliberately keep their data **outside** `config.json`. The per-module config holds display options only; the data itself lives in a shared file so every module instance stays in sync, and so a save from the editor can never clobber something changed from `/remote` or tapped on a display.

### data/meals.json

The meal library, weekly plan, grocery check-offs, and household-wide planning settings, written atomically via `/api/meals/data`. Settings live here rather than on each module so `/remote` and every meal-planner instance agree.

{% type-reference name="MealData" /%}

#### SavedMeal

Each entry in `savedMeals`:

{% type-reference name="SavedMeal" /%}

Each of its `ingredients`:

{% type-reference name="MealIngredient" /%}

`MealSettings` is edited from the `/remote` Meals tab so every meal module on every display stays consistent:

{% type-reference name="MealSettings" /%}

`timeFormat` is optional: when omitted (the default), meal times follow the household `GlobalSettings.timeFormat`; an explicit `'12h'`/`'24h'` wins everywhere meals are shown. Versions before this setting existed wrote `'12h'` into every file whether or not the user had touched the picker, so on first read after upgrading, a stored `'12h'` is treated as never-configured and removed once (a `timeFormatLegacyStripped` marker in the file keeps a later deliberate `'12h'` pick from being stripped again). A stored `'24h'` was always deliberate and survives as an explicit override.

Each `PlannedMeal` uses an ISO date string to support multi-week planning:

{% type-reference name="PlannedMeal" /%}

Old configs that used `day: number` (day-of-week index) are automatically migrated to ISO date format on first read.

### data/family.json

The shared household roster, edited under **Settings > Family** or `/remote` > Settings > Family. `/api/family` returns its members and a revision required for writes.

{% type-reference name="FamilyData" /%}

Each entry in `members`:

{% type-reference name="FamilyMember" /%}

Chore identities survive migration and legacy restore by ID. Calendar identities are matched by ID or alias first, then by a unique normalized name. Existing rosters over 64 people and long legacy names are retained. The authoring API limits new additions to 64 people and new names to 40 characters.

### data/chores.json

Chore definitions, served by `/api/chores/data` and edited from the `/remote` Chores tab. Family members are read separately from `/api/family`.

{% type-reference name="ChoreData" /%}

{% type-reference name="ChoreDefinition" /%}

Completions live in a **separate** file, `data/chore-completions.json`, served by `/api/chores`:

{% type-reference name="CompletionsData" /%}

Each entry in `completions`:

{% type-reference name="ChoreCompletion" /%}

### data/todos.json

The family's shared to-do lists (see [Lists](/docs/lists)). Each list has a name, a colour, an optional start-fresh repeat, and its items with done state, due day and who it is for. A To-Do module only stores which list it shows, so editing a screen never touches a list and the same list can sit on any number of screens. The phone, the wall and the editor all write through `/api/todo/lists`.

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

Config files include a `version` number. When the schema changes between releases, migrations in `src/lib/migrations/` automatically transform older configs to the current format on load. The current schema version is **{% $schemaVersion %}**.

Migration runs when the config is read and the result is written back to disk automatically, so `version` in `data/config.json` updates itself the first time newer code reads an older config. If a migration fails, the un-migrated config is returned as-is rather than falling back to defaults, so a bad upgrade can never quietly replace your setup with an empty one.

Do not hand-edit `version`. A config marked with a version newer than the running code is left alone; there is no downgrade path.

## Validation CLI

Home Screens ships a standalone validator for `data/config.json` that you can run without starting the dev server. It checks the schema version, module types, screen and module structure, profile references, multi-display registry constraints, and settings bounds, then reports a typed list of diagnostics with colored output.

```bash
npm run config:check
```

A clean config exits with status `0` and a "Config is valid" summary. Any errors, unknown module types, duplicate screen IDs, profile references to non-existent screens, out-of-range display dimensions, etc., exit with a non-zero status and a list of diagnostic entries, making the CLI safe to wire into a pre-commit hook or CI step on a server that mounts `data/`. The same validation rules are exposed programmatically from `src/lib/validate-config.ts` if you want to reuse them from your own tooling.

## Backup & Restore

- **Export** from the editor's Data section or the remote's Settings sheet downloads a backup as JSON. The bundle contains your config, chores, chore completions, meals, and rewards.
- **Import** replaces the current config with an uploaded JSON file (available in both the editor and the remote)
- A configurable **backup reminder** shows a toast in the editor and a banner on the remote when you haven't backed up recently (Settings > Backups & data)

### Backing up your keys

By default a backup carries no keys at all. **This part needs an editor password** (Settings > Security): without one, anything on your network can ask the hub for your keys, and there is no way for it to tell you apart from anyone else. Until you set one, the checkbox below stays switched off.

In the editor, **Settings > Backups & data > Save a copy** has two checkboxes:

- **Include my API keys and connected accounts** adds your weather and map keys, your Google, iCloud, Immich and OneDrive sign-ins, your plugin logins, and your editor password to the file. Both boxes start unticked every time you open the page, so an accidental tick never becomes your standing default.
- **Protect them with a password** locks that part of the file. You choose the password, and you need it again to put the keys back.

A backup that carries keys is named `home-screens-backup-with-keys-<date>.json`, so you can tell it apart in a downloads folder.

There is no way to recover the password. If you lose it you can still restore the backup, choose **Restore without my keys** at the prompt, and everything except the keys comes back. Losing the password costs you the keys, not your setup.

Restoring a backup that includes your editor password signs you out, because the password on this device becomes the one from the backup. Sign in again with that password. If the backup also had network address rules turned on and this device isn't on the restored list, the rules are left switched off so you can't lock yourself out; turn them back on in Settings once you've added this device.

The remote control's Settings sheet has no password prompt. Restoring a key-carrying backup there restores everything except the keys and tells you so, finish that part in the editor.

{% callout type="warning" %}
**Keep a key-carrying backup private.** Without the password option, anyone who opens the file can use your accounts. With it, the keys are sealed and only your password opens them.

Plugin bundles themselves are still not in the backup, so a restored Pi comes up with its plugins missing (their saved logins return once you reinstall them). For a genuinely complete copy, take the whole `data/` directory instead. Copying `data/config.json` on its own is narrower still: it captures none of your chores, completions, meals, or rewards.
{% /callout %}

## Example

```json
{
  "version": 13,
  "settings": {
    "rotationIntervalMs": 30000,
    "displayWidth": 1080,
    "displayHeight": 1920,
    "latitude": 40.0150,
    "longitude": -105.2705,
    "timezone": "America/Denver",
    "weather": {
      "provider": "pirateweather",
      "latitude": 40.0150,
      "longitude": -105.2705,
      "units": "imperial"
    },
    "calendar": {
      "googleCalendarId": "",
      "googleCalendarIds": ["primary"],
      "icalSources": [],
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
