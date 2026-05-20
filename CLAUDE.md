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
```

## Tech Stack

- Next.js 16 + React 19 (App Router)
- Tailwind CSS v4
- @dnd-kit for drag-and-drop editor
- Zustand for editor state management
- Framer Motion for screen transitions
- Vitest for testing
- Path alias: `@/*` → `./src/*`

## Architecture

### Route Groups
- `(display)` — fullscreen kiosk view, no chrome. Legacy `/display` and per-display `/display/[displayId]`. When the displays registry is populated, legacy `/display` **renders the main display inline** (not a redirect) — Chromium `--app` mode duplicates its window when following a 307 RSC redirect, so the route resolves the target display server-side and renders `ScreenRotator` directly with the correct `displayId`.
- `(editor)` — configuration editor at `/editor`, has toolbars/panels
- `(auth)` — authentication at `/login`
- `(remote)` — remote control + chores at `/remote`

### Module System
The codebase uses a **module registry pattern**. There are 41 built-in module types. Each requires:
1. A React component in `src/components/modules/`
2. A type in the `ModuleType` union (`src/types/config.ts`)
3. A config interface in `src/types/config.ts`
4. A default size in `src/lib/constants.ts`
5. Registration in `src/lib/module-registry.ts` (type, label, icon, category, defaults)
6. A dynamic import in `src/lib/module-components.ts`
7. An editor config section in `src/components/editor/PropertyPanel.tsx`
8. Optionally an API route in `src/app/api/` for external data

### Plugin System
Plugins extend the module system without modifying core code. A plugin is an IIFE bundle + manifest that loads at runtime. Plugins use `window.__HS_SDK__` for host utilities and `pluginFetch` for API proxy calls. Plugin types are namespaced as `plugin:<moduleType>`. Plugin files live in `data/plugins/`. The plugin proxy at `/api/plugins/proxy/[pluginId]` has SSRF hardening.

### Multi-Display (Hub-and-Spoke)
Optional `displays?: DisplayNode[]` registry on `ScreenConfiguration`. **When unset, the system runs in legacy single-display mode** (config.screens is the source of truth) — this is still the default. When set, each `DisplayNode` owns its own `screens: Screen[]` plus `displayWidth` / `displayHeight` / `displayTransform`, and (optionally) its own `profiles: Profile[]` and `activeProfile`; the deprecated shared-pool fields `screenIds` and `profileIds` were removed in schema v4. The hub serves all displays, each Pi polls `/api/display/commands?display=<id>` and reports per-tab status (clientId, post-rotation viewport, source IP) back. Per-display command queues live in `display-commands.ts` keyed by displayId, with `__default__` for legacy callers and `all` as a broadcast keyword. Heartbeats live in an in-memory `statusMap` (not config.json) to avoid write contention with editor saves. The first `addDisplay` auto-seeds a sibling `main` display inheriting the global screens **only when the first added display is not itself `main`**; if the user adds `main` first, that display inherits the globals directly. Subsequent displays start empty. **`main` is a regular `DisplayNode` that owns its own dimensions** — `addDisplay` seeds `displays[main]` from the globals at migration time, so no "main is special" branch or read-time normalization shim is needed anywhere. Editor store routes every screen mutation through `getActiveScreens` / `withActiveScreens` so edits target the currently selected display. `validateDisplays` enforces URL-safe slugs (≤64 chars), unique IDs, ≤64 displays, ≤256 screens-per-display, dimension caps. Display-only Pis (`install.sh --display-only`) skip Node.js entirely and run a chromium+labwc kiosk against the hub. The settings page splits the sidebar into **Defaults** (every shared value) and **Per display** (one drill-down page per display) — every default has a real source-of-truth page, every per-display field uses an `OverrideRow` with explicit Override / Reset to default actions, and the Defaults pages render a backlink banner via `findDisplaysOverridingFields` listing which displays currently override their fields.

The `display-control` module is a touch widget that dispatches hub commands (wake/sleep/next/prev/brightness) back at configurable targets (`self`, `all`, or a specific display ID) via `src/lib/display-dispatch.ts`. `useDisplayId` resolves `self` at runtime from the kiosk's own ID. Per-Pi hardware reporting runs via `scripts/reporter.sh` posting to `/api/display/hw-stats`, which is gated by `requireAdoptedDisplay` (LAN + presence in `config.displays`) rather than a bearer token — the old reporter_token flow was removed.

### Data Flow
- Main config: `data/config.json` (read/written via `src/lib/config.ts`)
- Meal-planner state + shared settings: `data/meals.json` (atomic writes via `src/lib/meal-data.ts`; settings live here so /remote and all meal-planner module instances stay in sync)
- API keys: `data/secrets.json`
- Plugin bundles: `data/plugins/`
- `/api/config` handles GET/PUT for the config file
- Editor loads config into a Zustand store (`src/stores/editor-store.ts`), edits in-memory, saves via PUT
- Display reads config server-side and renders modules

### API Pattern
All API routes are server-side proxies for external services (weather, calendar, stocks, etc.) to handle secrets and CORS. Routes live in `src/app/api/*/route.ts` (~85 route files) covering config, weather, calendar, sports, plugins, system management, displays, network (WiFi/IP/hostname), i18n dictionaries, and more. `/api/displays` is a read-only registry+heartbeat endpoint with a 1.5s readConfig cache. `/api/display/[action]` handles per-display command enqueueing and status posts; `/api/display/hw-stats` accepts adopted-display-gated hardware telemetry. The upgrade pipeline (`/api/system/upgrade`, rollback, backups) is hardened against tamper.

### Key Files
- `src/types/config.ts` — all TypeScript types (ModuleType, ModuleInstance, ScreenConfiguration, GlobalSettings, DisplayNode)
- `src/types/plugins.ts` — plugin manifest and runtime types
- `src/lib/module-registry.ts` — module definitions (type, label, icon, category, defaults)
- `src/lib/module-components.ts` — dynamic imports mapping ModuleType → React component
- `src/lib/config.ts` — config file read/write (also exposes `updateConfigAtomic` for queued read-modify-write)
- `src/lib/weather/` — 9 weather providers (OpenWeatherMap, WeatherAPI, Pirate Weather, NOAA, Open-Meteo, Yr.no, SMHI, Met Office, Environment Canada) with shared types and factory
- `src/lib/google-calendar.ts` — Google Calendar integration (OAuth device flow)
- `src/lib/meal-data.ts` — shared meal-planner store (`data/meals.json`), atomic writes, settings + savedMeals + plan + groceryChecked
- `src/stores/editor-store.ts` — Zustand store for all editor state and actions; multi-display helpers (`selectedDisplayId`, `getActiveScreens`, `getActiveDimensions`, `withActiveScreens`, `addDisplay`, `orientDimensions`)
- `src/lib/plugin-loader.ts` — plugin loading, registration, and dev mode
- `src/lib/display-filter.ts` — `filterConfigForDisplay`, `validateDisplays`, `findScreenById`, `getDisplayScreens` (shared between server route and `useLiveConfig`)
- `src/lib/display-commands.ts` — per-display command queues, `statusMap`, `viewportReports`, `getUnadoptedDisplays` with stale eviction
- `src/lib/display-client-id.ts` — per-tab `clientId` from sessionStorage so the hub can distinguish multiple tabs reporting under the same display ID
- `src/lib/display-dispatch.ts`, `src/hooks/useDisplayId.ts`, `src/hooks/useHoldConfirm.ts` — shared helpers behind the `display-control` module (target resolution, command dispatch, hold-to-confirm buttons)
- `src/lib/resolve-screen-duration.ts` + `src/components/display/useScreenRotationTimer.ts` — per-screen `rotationDurationMs` override with global-default fallback, used by `ScreenRotator` and module prefetch timing
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
