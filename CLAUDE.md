# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Custom smart display system (Dakboard/MagicMirror replacement). Web-based, runs on Raspberry Pi in Chromium kiosk mode. Portrait 1080×1920 display. All data stored locally as JSON — no database, no cloud.

## Commands

```bash
npm run dev          # Start dev server (Next.js)
npm run build        # Production build
npm run lint         # ESLint (flat config, next/core-web-vitals + typescript)
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npx vitest run src/lib/__tests__/config.test.ts  # Run a single test file
npm run test:e2e     # Playwright E2E suite (run `npm run build` first)
npx playwright test --project=editor   # Run one surface's E2E specs
```

## Tech Stack

- Next.js 16 + React 19 (App Router)
- Tailwind CSS v4
- @dnd-kit for drag-and-drop editor
- Zustand for editor state management
- Framer Motion for UI animations (editor panels, some module content); screen transitions use the browser's View Transitions API (`ScreenRotator.startScreenTransition`), not Framer Motion
- Vitest for testing
- Path alias: `@/*` → `./src/*`

## Architecture

### Route Groups
- `(display)` — fullscreen kiosk view, no chrome. Legacy `/display` and per-display `/display/[displayId]`. When the displays registry is populated, legacy `/display` **renders the main display inline** (not a redirect) — Chromium `--app` mode duplicates its window when following a 307 RSC redirect, so the route resolves the target display server-side and renders `ScreenRotator` directly with the correct `displayId`.
- `(editor)` — configuration editor at `/editor`, has toolbars/panels
- `(auth)` — authentication at `/login`
- `(remote)` — remote control + chores at `/remote`

### Module System
The codebase uses a **module registry pattern**. There are 42 built-in module types. Each requires:
1. A React component in `src/components/modules/`
2. A type in the `ModuleType` union (`src/types/config.ts`)
3. A config interface in `src/types/config.ts`
4. A default size in `src/lib/constants.ts`
5. Registration in `src/lib/module-registry.ts` (type, label, icon, category, defaults)
6. A dynamic import in `src/lib/module-components.ts`
7. An editor config section in `src/components/editor/PropertyPanel.tsx`
8. Optionally an API route in `src/app/api/` for external data
9. An E2E fixture row in `e2e/helpers/module-fixtures.ts` (the `meta` coverage ratchet fails otherwise). If the module fetches data, add a stub fixture too (see Testing below). The meta ratchets also police config depth: every config field needs a `CONFIG_VARIANTS` row (in `e2e/helpers/config-variants/`) or a reasoned `FIELD_DECISIONS` entry in `e2e/meta/coverage.spec.ts`; mode-like string unions may need `EXTRA_DISCRIMINATORS` member rows; a component using `ModuleEmptyState`/`LocationRequired` needs an `EMPTY_STATE_FIXTURES` row.

Every `ModuleInstance` supports three visibility gates, AND-combined at render time: `enabled?: boolean` (per-module disable toggle, mirrors `Screen.enabled`; disabled modules are excluded from prefetch and shared-data fetches but stay dimmed-visible in the editor), `schedule?: ModuleSchedule` (day/time window), and `visibility?: ModuleVisibility` (declarative conditions over the shared state bus).

### Shared State Bus & Conditional Visibility
`src/lib/shared-state-store.ts` is a per-tab key/value bus with a claim/release producer lifecycle and cached snapshots for `useSyncExternalStore`. Modules (host or plugin) publish string values; any module can condition its visibility on them via `ModuleVisibility` — a closed union of `state` / `numeric` / `and` / `or` / `not` conditions (Home Assistant-style semantics), with a `whenUnknown` fallback evaluated before the condition tree so the boolean algebra never sees a three-valued input. **Clears are tombstoned, not deleted**: `clearKey`/`clearKeysByPrefix` mark the entry `staleAt` and hold its last value for a 15s grace window (a fresh publish revives it), so routine producer restarts never blink conditioned modules; plugin reload is a swap — `loadAllPlugins` only purges key namespaces of plugins gone from the new set (a failed reload purges all preserved namespaces, since no producer remounts then). The Text module supports `{<state-key>}` tokens (`src/lib/shared-state-template.ts`; double-brace `{{time}}` template variables are unaffected, unknown keys render an en dash). Displays post a bus snapshot with their status heartbeat (tombstoned entries filtered; field omitted while empty after one clearing report); the fast throttled re-report on bus changes is armed only while an editor is watching — the shared-state GET marks per-display interest (15s TTL) and the commands drain returns it as `sharedStateWatched`, otherwise the snapshot rides the 30s heartbeat. The hub keeps the latest per display in memory and serves `GET /api/display/shared-state?display=<id>`, which the editor polls (`useDisplaySharedState`) to show live values and case-mismatch warnings next to condition inputs (all condition inputs, including numeric bounds, commit on blur, not per keystroke). The key input uses a custom suggestion dropdown (opens on focus; native datalist can't be opened programmatically), and new conditions start with an empty `sourceKey` — legal per the validator, evaluated as unknown so `whenUnknown` governs until a key is picked. A `backgroundProvider?: boolean` flag on `ModuleInstance` mounts the module once in a hidden `BackgroundProviderLayer` so its data loop (and published state) survives screen rotation — background-only, not "also render". The editor UI is `VisibilityConditionsSection.tsx`, with the condition picker sourced from provided state keys (`src/lib/provided-state-keys.ts`).

### Plugin System
Plugins extend the module system without modifying core code. A plugin is an IIFE bundle + manifest that loads at runtime. Plugins use `window.__HS_SDK__` for host utilities and `pluginFetch` for API proxy calls; `publishState`/`clearState` feed the shared state bus, with keys advertised via the manifest `providesState` field or a `deriveProvidedKeys` export. Plugin types are namespaced as `plugin:<moduleType>`. Plugin files live in `data/plugins/`. The plugin proxy at `/api/plugins/proxy/[pluginId]` has SSRF hardening and per-plugin rate limits (60 req/min; 240 for `localNetwork` plugins). A manifest `auth` field declares a server-side auth adapter — declarative OAuth2 (`authorization_code` with PKCE, `device_code`, `client_credentials`) or the named Garmin SSO adapter — run entirely by the host via `/api/plugins/auth/*` (start POST / poll PUT / status GET / disconnect DELETE per plugin, plus a shared HMAC-signed-state callback); tokens live out-of-tree in `data/plugin-tokens/` and the proxy injects and transparently refreshes them for the adapter's `tokenTargetDomains` (one 401 retry, then a structured `auth_expired` response). The SDK exposes read-only `getAuthStatus` (display + editor) and `startAuth` (editor-only, dispatches to the Connection panel).

### Multi-Display (Hub-and-Spoke)
Optional `displays?: DisplayNode[]` registry on `ScreenConfiguration`. **When unset, the system runs in legacy single-display mode** (config.screens is the source of truth) — this is still the default. When set, each `DisplayNode` owns its own `screens: Screen[]` plus `displayWidth` / `displayHeight` / `displayTransform`, and (optionally) its own `profiles: Profile[]` and `activeProfile`; the deprecated shared-pool fields `screenIds` and `profileIds` were removed in schema v4. The hub serves all displays, each Pi polls `/api/display/commands?display=<id>` and reports per-tab status (clientId, post-rotation viewport, source IP) back. Per-display command queues live in `display-commands.ts` keyed by displayId, with `__default__` for legacy callers and `all` as a broadcast keyword. Heartbeats live in an in-memory `statusMap` (not config.json) to avoid write contention with editor saves. The first `addDisplay` auto-seeds a sibling `main` display inheriting the global screens **only when the first added display is not itself `main`**; if the user adds `main` first, that display inherits the globals directly. Subsequent displays start empty. **`main` is a regular `DisplayNode` that owns its own dimensions** — `addDisplay` seeds `displays[main]` from the globals at migration time, so no "main is special" branch or read-time normalization shim is needed anywhere. Editor store routes every screen mutation through `getActiveScreens` / `withActiveScreens` so edits target the currently selected display. `validateDisplays` enforces URL-safe slugs (≤64 chars), unique IDs, ≤64 displays, ≤256 screens-per-display, dimension caps. Display-only Pis (`install.sh --display-only`) skip Node.js entirely and run a chromium+labwc kiosk against the hub. The settings page splits the sidebar into **Defaults** (every shared value) and **Per display** (one drill-down page per display) — every default has a real source-of-truth page, every per-display field uses an `OverrideRow` with explicit Override / Reset to default actions, and the Defaults pages render a backlink banner via `findDisplaysOverridingFields` listing which displays currently override their fields. The 2026-07 reorganization merged the Defaults sidebar to 12 pages under four group headers (Screen / Content / Automation / Maintenance): `screen` absorbed display+sleep+alerts (URL-driven tabs via `?panel=appearance|sleep|alerts`), `automation` absorbed profiles+rules+shared-state (tabs via `?panel=profiles|rules|live`), `integrations` ("API keys") sits under Content, config backups moved from System to `data` ("Backups & data"), and Docs became a sidebar-footer link. Per-display subtabs collapsed to `overview` (absorbing profile+identity) and `overrides` (absorbing display+sleep+alerts). Retired page/subtab ids and legacy `?tab=` values stay routable via `LEGACY_PAGE_REDIRECTS` / `LEGACY_SUBTAB_REDIRECTS` / `LEGACY_TAB_REDIRECTS` in `settings-route.ts`, which also canonicalizes the URL bar.

The `display-control` module is a touch widget that dispatches hub commands (wake/sleep/next/prev/brightness) back at configurable targets (`self`, `all`, or a specific display ID) via `src/lib/display-dispatch.ts`. `useDisplayId` resolves `self` at runtime from the kiosk's own ID. Per-Pi hardware reporting runs via `scripts/reporter.sh` posting to `/api/display/hw-stats`, which is gated by `requireAdoptedDisplay` (LAN + presence in `config.displays`) rather than a bearer token — the old reporter_token flow was removed.

### Data Flow
- Main config: `data/config.json` (read/written via `src/lib/config.ts`)
- Meal-planner state + shared settings: `data/meals.json` (atomic writes via `src/lib/meal-data.ts`; settings live here so /remote and all meal-planner module instances stay in sync)
- Interactive todo tap-state: `data/todo-state.json` (via `src/lib/todo-data.ts`, keyed by item UUID — kept out of config.json to avoid editor write-contention; displays poll `/api/todo/state` and flip via `/api/todo/toggle`)
- API keys: `data/secrets.json`
- iCloud account credentials: `data/icloud-accounts.json` (via `src/lib/icloud-accounts.ts` — CalDAV app-specific passwords, kept out of config.json; the API never returns passwords, picked calendars persist as `icloudSources` in config)
- Plugin bundles: `data/plugins/`
- Plugin auth tokens: `data/plugin-tokens/<pluginId>.json` (via `src/lib/plugin-auth.ts` — serialized writes, owner-only permissions, kept outside the plugin dir so upgrades can't wipe them)
- `/api/config` handles GET/PUT for the config file
- Editor loads config into a Zustand store (`src/stores/editor-store.ts`), edits in-memory, saves via PUT
- Display reads config server-side and renders modules

### API Pattern
All API routes are server-side proxies for external services (weather, calendar, stocks, etc.) to handle secrets and CORS. Routes live in `src/app/api/*/route.ts` (99 route files) covering config, weather, calendar, sports, plugins, system management, displays, network (WiFi/IP/hostname), i18n dictionaries, interactive todo state (`/api/todo/state` poll + `/api/todo/toggle` atomic flip), and more. `/api/displays` is a read-only registry+heartbeat endpoint with a 1.5s readConfig cache. `/api/display/[action]` handles per-display command enqueueing and status posts; `/api/display/hw-stats` accepts adopted-display-gated hardware telemetry. The upgrade pipeline (`/api/system/upgrade`, rollback, backups) is hardened against tamper.

### Key Files
- `src/types/config.ts` — all TypeScript types (ModuleType, ModuleInstance, ScreenConfiguration, GlobalSettings, DisplayNode)
- `src/types/plugins.ts` — plugin manifest and runtime types
- `src/lib/module-registry.ts` — module definitions (type, label, icon, category, defaults)
- `src/lib/module-components.ts` — dynamic imports mapping ModuleType → React component
- `src/lib/config.ts` — config file read/write (also exposes `updateConfigAtomic` for queued read-modify-write)
- `src/lib/weather/` — 9 weather providers (OpenWeatherMap, WeatherAPI, Pirate Weather, NOAA, Open-Meteo, Yr.no, SMHI, Met Office, Environment Canada) with shared types and factory
- `src/lib/google-calendar.ts` — Google Calendar integration (OAuth device flow)
- `src/lib/caldav-calendar.ts` + `src/lib/icloud-accounts.ts` — iCloud calendar sync (CalDAV via tsdav, per-calendar failure isolation, optional CardDAV contact-birthday source); accounts managed by `/api/icloud/accounts`, calendars listed by `/api/icloud/calendars`
- `src/lib/meal-data.ts` — shared meal-planner store (`data/meals.json`), atomic writes, settings + savedMeals + plan + groceryChecked
- `src/stores/editor-store.ts` — Zustand store for all editor state and actions; multi-display helpers (`selectedDisplayId`, `getActiveScreens`, `getActiveDimensions`, `withActiveScreens`, `addDisplay`, `orientDimensions`)
- `src/lib/plugin-loader.ts` — plugin loading, registration, and dev mode
- `src/lib/display-filter.ts` — `filterConfigForDisplay`, `validateDisplays`, `findScreenById`, `getDisplayScreens` (shared between server route and `useLiveConfig`)
- `src/lib/display-commands.ts` — per-display command queues, `statusMap`, `viewportReports`, `getUnadoptedDisplays` with stale eviction
- `src/lib/display-client-id.ts` — per-tab `clientId` from sessionStorage so the hub can distinguish multiple tabs reporting under the same display ID
- `src/lib/display-dispatch.ts`, `src/hooks/useDisplayId.ts`, `src/hooks/useHoldConfirm.ts` — shared helpers behind the `display-control` module (target resolution, command dispatch, hold-to-confirm buttons)
- `src/lib/resolve-screen-duration.ts` + `src/components/display/useScreenRotationTimer.ts` — per-screen `rotationDurationMs` override with global-default fallback, used by `ScreenRotator` and module prefetch timing
- `src/lib/shared-state-store.ts` + `src/lib/shared-state-types.ts` — per-tab shared state bus (claim/release producers, key/value caps, cached snapshots); consumed via `src/hooks/usePublishState.ts` / `src/hooks/useSharedStateKeys.ts`
- `src/components/display/BackgroundProviderLayer.tsx`, `src/components/editor/VisibilityConditionsSection.tsx` — hidden mount layer for `backgroundProvider` modules + the editor UI for visibility conditions
- `src/lib/todo-data.ts` — interactive todo tap-state store (`data/todo-state.json`), atomic flips keyed by item UUID
- `src/components/editor/DisplaySwitcher.tsx`, `src/components/editor/settings/DisplaysIndexPage.tsx` — multi-display UI (toolbar pill + Per display > All displays index)
- `src/components/editor/settings/SettingsSidebar.tsx`, `src/components/editor/settings/display/PerDisplayPage.tsx`, `src/lib/settings-route.ts` — Phase 4 settings split (Defaults / Per display) with URL-driven routing
- `src/components/editor/settings/OverrideRow.tsx`, `src/lib/display-defaults-backlinks.ts` — per-display field overrides + the "which displays override this field?" backlink banner on Defaults pages
- `src/i18n/` — i18n runtime (`provider.tsx`, `loader.ts`, `manifest.ts`, `formatters.ts`, `server-blob.ts`, `file-reader.ts`); `manifest.ts` is the source of truth for registered locales
- `src/translations/<locale>/{core,editor,modules,remote,weather}.json` — host dictionaries, one folder per locale; fallback chain walks language siblings then `FALLBACK_LOCALE` (`en-US`)
- `src/app/api/i18n/[locale]/route.ts` — serves `{ <namespace>: <dictionary>, ... }` for a `?ns=` list; unknown locales fall back silently; partial locales walk the per-namespace fallback chain

### I18n
The active locale lives in `GlobalSettings.locale` (BCP-47 tag, defaults to `en-US`); an optional `formattingLocale` overrides date/number formatting only. Seven locales ship out of the box: `en-US`, `de-DE`, `fr-FR`, `es-ES`, `nl-NL`, `pt-BR`, `da-DK`. Server-rendered pages get a pre-built locale blob via `buildLocaleBlob`; client pages hydrate the same dictionaries through `/api/i18n/[locale]` (per-namespace HTTP cache, full-URL keyed). Plugin manifests can declare `translations: { '<bcp47>': '<path>' }`; the loader registers them under namespace `plugin:<pluginId>` and exposes `__HS_SDK__.translate(...)` to plugin code.

### Website
The marketing site and documentation live in `website/` as a separate Next.js app:
- Static export deployed to Cloudflare Pages at homescreens.dev
- Marketing homepage at `/` with dark theme
- Documentation at `/docs/*` using Markdoc for content, with search (FlexSearch), light/dark theme, and sidebar navigation
- Docs components namespaced under `src/components/docs/` to avoid collisions with marketing components
- Build requires `--webpack` flag (Markdoc not Turbopack-compatible)
- `website/src/lib/docs-navigation.ts` defines the sidebar structure

### Testing
Tests use Vitest with `@` path aliases configured. Test files live in `__tests__/` directories alongside the code they test. Environment is `node`.

E2E tests live in `e2e/` (Playwright, Chromium only). Each worker boots its own production `next start` from a sandboxed cwd with a private `data/` (`e2e/helpers/sandbox.ts`, mirroring `vitest.setup.ts`), so E2E runs never touch the real `data/` directory. Specs reset state via `PUT /api/config` in `beforeEach`. Requires a production build: `npm run build && npm run test:e2e`. CI shards the suite (`--shard=i/n`) and merges blob reports into one HTML report.

**Module coverage is data-driven.** `e2e/helpers/module-fixtures.ts` holds one `ModuleFixture` row per built-in module type (config overrides + an assertion), and the render matrices (`e2e/display/modules-static.spec.ts`, `modules-data.spec.ts`, `module-views.spec.ts`) loop over it. Config-field depth lives in `e2e/helpers/config-variants/` (per-family row files concatenated by `index.ts`; each row flips one field and asserts the render changed — rows support `stubBody`, custom `seedData`, and `companions` for cross-module effects) and empty states in `e2e/helpers/empty-state-fixtures.ts` (looped by `module-empty-states.spec.ts`). The `meta` project's ratchets (`e2e/meta/coverage.spec.ts`) fail if any built-in type lacks a fixture, a config field lacks a variant row or a reasoned `FIELD_DECISIONS` entry, a discriminator-union member goes untested, an empty-state component lacks a registry row, an API route is neither E2E-exercised nor unit-tested nor a `ROUTE_DECISIONS` entry, or a manifest locale is missing from any surface i18n spec (editor, display, remote, chores). **To test a new module: add its fixture row; if it fetches data, add a JSON fixture under `e2e/fixtures/module-data/` and a `stubKey` so `stubModuleData` (`e2e/helpers/stubs.ts`) serves it.** Module data is fetched client-side, so `page.route` intercepts it at the browser boundary — the `stubModuleData` external-block catch-all is the no-beacon safeguard (asserted via `externalHits`), guaranteeing a spec makes zero real upstream calls. Local-data modules (chore-chart, meal-planner, todo) seed via their real APIs (`seedChores` / `seedMeals`) instead of stubbing. Plugin specs seed a fixture plugin into the sandbox with `seedFixturePlugin` (`e2e/helpers/fixture-plugin.ts`).

## Working Conventions

- Plans and specs live in `.claude/plans/` (finished ones move to `.claude/plans-finished/`); mockups live in `.claude/mockups/`. None of these are committed.
- UI features are mockup-first: real HTML mockup in `.claude/mockups/`, sign-off, implement, then audit the rendered implementation against the mockup before calling it done.
- Preflight gate before any commit: `npx tsc --noEmit`, `npm run lint`, `npm test` must all pass.
- Commit style: one summary line, blank line, bulleted body. No phase references, no review-finding references, no attribution, no em-dashes. Never commit until the user signs off; prefer one commit per unit of tested work.
- User-visible strings are kid-friendly plain language: no "admin", "permission", "enum", "backfill", or node/chromium jargon (the chore chart and /remote are used by children; issue reporters are not developers).
- Member-based UIs must work with 5+ members (aggregate indicators, not per-member visuals).
