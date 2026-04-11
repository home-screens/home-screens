# Weather Provider Cards — Settings Redesign

**Date:** 2026-04-11
**Status:** Design approved, ready for implementation planning
**Scope:** `src/components/editor/settings/WeatherSection.tsx` redesign + small shared-primitive extraction

## Problem

Today, `WeatherSection` uses a single `<select>` dropdown to pick a weather provider, with a conditional API-key field appearing below it. This has two problems:

1. It feels inconsistent with `IntegrationsSection`, which uses a polished, card-based layout (per-service `IntegrationCard` + `SecretField`) that the user prefers as the house style for "external service configuration" surfaces.
2. The Units control is shoved to the bottom of the form, below the provider and API-key controls, even though units apply regardless of which provider you pick. It should live at the top.

## Goal

Rebuild `WeatherSection` so it mirrors the card layout of `IntegrationsSection`. Each of the five weather providers becomes its own card that can be configured independently. One provider is marked as the default (driving `config.weather.provider`). Units sit at the top of the section, not the bottom.

## Non-goals

- **Per-module provider override.** Individual weather widgets can already (or will separately) pick any configured provider. This design touches only the default-selection UI in settings.
- **Changing the weather data model.** `WeatherSettings` in `src/types/config.ts` keeps the same shape: `provider`, `units`, `lat`, `lon`. The `provider` field still stores the default.
- **New providers.** The same five providers remain: Open-Meteo, WeatherAPI, OpenWeatherMap, Pirate Weather, NOAA.
- **Unrelated refactors** to other settings sections.

## Key insight: "default", not "single-select"

The single-select feel of today's dropdown is misleading. In the multi-display / per-widget world, any configured provider can be picked by individual weather modules. `config.weather.provider` is just the _default_ that applies when a widget doesn't override. That matches integrations' multi-configure model almost perfectly — the only net-new concept is a "Default" marker on exactly one card at a time.

## Design

### Layout (top to bottom)

1. **Section header** — `h2` "Weather" + one-line description explaining that any configured provider can be picked per-widget and one is used as the default.
2. **Units control** — segmented two-button pill: `Imperial (°F, mph)` / `Metric (°C, km/h)`. Positioned directly under the header, before anything provider-related.
3. **Location warning banner** — existing warning, unchanged: shown when `lat === 0 && lon === 0`, reminds the user that weather will not work without a location.
4. **"Providers" subheading** — small uppercase tracking-wider label, matching the "Google Ecosystem" / "Photos & Backgrounds" subheadings in `IntegrationsSection`.
5. **Provider cards** — five cards in fixed order:
   - Open-Meteo (free, global, no key)
   - WeatherAPI.com (free tier, key required)
   - OpenWeatherMap (One Call 3.0, key required)
   - Pirate Weather (Dark Sky replacement, key required)
   - NOAA / NWS (free, US only, no key)

Fixed ordering is intentional: stable layout is easier for muscle memory than promoting the current default to the top.

### Card anatomy (reuses `IntegrationCard`)

Each card matches the existing `IntegrationCard` visual structure:

- **Icon** — branded per provider, rendered on a colored background square (see "Icon and color mapping" below).
- **Name** — e.g. "Open-Meteo".
- **Description** — one-liner tagline, e.g. "Free · global · no key".
- **Status pill** — rendered on the right of the card header.
- **Chevron** — expands/collapses the body. The default-provider card is open on mount (mirrors how the Google card in `IntegrationsSection` opens when `google.type !== 'none'`).

### Status pill states

| State | Pill color | Condition |
|---|---|---|
| `Default · Ready` | green | is default, free provider (no key needed) |
| `Default · Configured` | green | is default, paid provider with key saved |
| `Default · Needs setup` | orange (warning) | is default, paid provider with no key saved — _the provider is selected but unusable_ |
| `Configured` | subtle green | paid provider with key saved, not default |
| `Ready` | neutral | free provider, not default |
| `Needs setup` | gray | paid provider with no key saved, not default |

The warning `Default · Needs setup` state is important: it exists precisely so the user is visibly nagged when they remove the key from their default provider (see "Default-demotion semantics").

### Card body when expanded

**Free providers (Open-Meteo, NOAA):**

- A short helper paragraph — e.g. "No API key required. Open-Meteo is free and open-source with global coverage." / "No API key required. NOAA data is free and public (US only)."
- A "Set as default" button. Hidden entirely when the card is already the default.
- A "Test" button that probes `/api/weather?provider=...&lat=...&lon=...&units=...&type=hourly` and shows a success or error inline. **Unlike today's `testWeather()`**, the per-card test does _not_ call `saveConfig()` before hitting the endpoint — the probe already passes the provider as a query param, so there is no reason to mutate the persisted default just to test. Save, Set as default, and Test are three independent actions.

**Paid providers (WeatherAPI, OpenWeatherMap, Pirate Weather):**

- A `SecretField` component (reused from `IntegrationsSection`) bound to the provider's secret key:
  - WeatherAPI → `weatherapi_key`
  - OpenWeatherMap → `openweathermap_key`
  - Pirate Weather → `pirateweather_key`
  - Each has a tailored `placeholder` and `helpText` (e.g. "Free at weatherapi.com", "Requires One Call 3.0 subscription", "Free at pirateweather.net").
- A "Set as default" button. Disabled until the key is saved. Hidden entirely when the card is already the default.
- A "Test" button, same behavior as above.

### Default-demotion semantics

When a user removes the saved API key from whatever card is currently the default:

- The provider **remains** the default (we do not auto-switch).
- The card flips to the `Default · Needs setup` orange warning state.
- No silent fallback. The user must explicitly pick a new default.

Rationale: this matches the "no silent magic" tone of the rest of the settings UI. Auto-switching would hide a meaningful state change behind the user's back and could cause confusion if the user intended to briefly swap the key rather than demote the provider.

### "Set as default" action

Clicking "Set as default" inside a card writes `settings.weather.provider` via `updateSettings(...)` (same Zustand store mutation that today's `<select>` already performs). Exactly one card is the default at any time; clicking "Set as default" on another card unmarks whichever card was previously the default.

### Units control

Units become a small segmented control at the top of the section:

```
Units   [ Imperial (°F, mph) ] [ Metric (°C, km/h) ]
```

Both options are rendered as adjacent buttons inside a single `rounded-lg` group, with the active option visually highlighted (e.g. `bg-hs-accent-soft` on the selected pill). Wiring is unchanged: both buttons call `onChange({ units: 'imperial' | 'metric' })`. The underlying `WeatherSettings.units` field type does not change.

### Icon and color mapping

Proposed icon + background-color per provider. These are starting suggestions; final choices can be refined during implementation once the icons are seen on screen.

| Provider | Icon | Background |
|---|---|---|
| Open-Meteo | `Globe` from lucide-react | `#0ea5e9` (sky blue) |
| WeatherAPI | `CloudSun` from lucide-react | `#f59e0b` (amber) |
| OpenWeatherMap | `Cloud` from lucide-react | `#ea580c` (orange) |
| Pirate Weather | `Compass` or `Wind` from lucide-react | `#0d9488` (teal) |
| NOAA / NWS | `Flag` or `Radar` from lucide-react | `#1d4ed8` (indigo) |

Matches the style of `IntegrationsSection` (inline SVG or lucide icon, white fill on a solid color background).

## Shared-primitive extraction (targeted refactor)

`SecretField` and `IntegrationCard` are currently defined as private components inside `IntegrationsSection.tsx`. They are exactly what `WeatherSection` needs. Rather than duplicating ~150 lines, we extract both into a shared location:

- `src/components/editor/settings/shared/SecretField.tsx`
- `src/components/editor/settings/shared/IntegrationCard.tsx`

Both `IntegrationsSection` and `WeatherSection` then import from the shared location. This is a small, mechanical refactor with tiny blast radius (both files are the only callers), and it matches the project's habit of reusing primitives across related surfaces. Public API of both components stays identical — they are literally lifted, not changed.

Optional polish: rename `IntegrationCard` to `ServiceCard` or `ProviderCard` since it now represents both integrations and weather providers. Leaving the name as `IntegrationCard` is also fine if the rename feels like churn. Decision deferred to the implementation plan.

## File-level change list

- **`src/components/editor/settings/WeatherSection.tsx`** — rewritten. New layout (Units top, card list for providers). Same `Props` interface (`values`, `onChange`) so the call site in `DisplaySubtab.tsx` or wherever `WeatherSection` is rendered does not change.
- **`src/components/editor/settings/IntegrationsSection.tsx`** — imports `SecretField` and `IntegrationCard` from `shared/` instead of defining them locally. Otherwise unchanged.
- **`src/components/editor/settings/shared/SecretField.tsx`** — new file, content lifted verbatim from `IntegrationsSection.tsx`.
- **`src/components/editor/settings/shared/IntegrationCard.tsx`** — new file, content lifted verbatim from `IntegrationsSection.tsx`.
- **Tests** — no existing tests for these components. No new test requirement called out by this spec; the implementation plan can decide whether smoke-testing the new interactions is worth adding Vitest component tests or not.

## Open questions / decisions deferred to implementation

1. **Exact icon and background color per provider** — starting suggestions above, finalize when rendering on screen.
2. **Rename `IntegrationCard` to `ProviderCard`?** — left to the implementation plan to decide based on how jarring the rename feels.
3. **Component smoke tests** — decide during implementation whether the interaction complexity warrants a Vitest test for the new WeatherSection.

## Out of scope (explicit)

- Changing the `WeatherSettings` data shape.
- Changing the `/api/weather` route or its provider dispatch.
- Per-widget provider override UI inside the weather module itself.
- Touching any other settings section.
- Adding new weather providers.
