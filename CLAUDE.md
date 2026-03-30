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
- `(display)` — fullscreen kiosk view at `/display`, no chrome
- `(editor)` — configuration editor at `/editor`, has toolbars/panels
- `(auth)` — authentication at `/login`
- `(remote)` — remote control + chores at `/remote`

### Module System
The codebase uses a **module registry pattern**. There are 36 built-in module types. Each requires:
1. A React component in `src/components/modules/`
2. A type in the `ModuleType` union (`src/types/config.ts`)
3. A config interface in `src/types/config.ts`
4. A default size in `src/lib/constants.ts`
5. Registration in `src/lib/module-registry.ts` (type, label, icon, category, defaults)
6. A dynamic import in `src/lib/module-components.ts`
7. An editor config section in `src/components/editor/PropertyPanel.tsx`
8. Optionally an API route in `src/app/api/` for external data

### Plugin System
Plugins extend the module system without modifying core code. A plugin is an IIFE bundle + manifest that loads at runtime. Plugins use `window.__HS_SDK__` for host utilities and `pluginFetch` for API proxy calls. Plugin types are namespaced as `plugin:<moduleType>`. Plugin files live in `data/plugins/`.

### Data Flow
- Config is stored as JSON on disk at `data/config.json` (no database)
- `/api/config` handles GET/PUT for the config file
- Editor loads config into a Zustand store (`src/stores/editor-store.ts`), edits in-memory, saves via PUT
- Display reads config server-side and renders modules
- API keys stored separately in `data/secrets.json`

### API Pattern
All API routes are server-side proxies for external services (weather, calendar, stocks, etc.) to handle secrets and CORS. Routes live in `src/app/api/*/route.ts`. There are 54 route files covering config, weather, calendar, sports, plugins, system management, and more.

### Key Files
- `src/types/config.ts` — all TypeScript types (ModuleType, ModuleInstance, ScreenConfiguration, GlobalSettings)
- `src/types/plugins.ts` — plugin manifest and runtime types
- `src/lib/module-registry.ts` — module definitions (type, label, icon, category, defaults)
- `src/lib/module-components.ts` — dynamic imports mapping ModuleType → React component
- `src/lib/config.ts` — config file read/write
- `src/lib/weather.ts` — 5 weather providers (OpenWeatherMap, WeatherAPI, Pirate Weather, NOAA, Open-Meteo) with abstract interface
- `src/lib/google-calendar.ts` — Google Calendar integration (OAuth device flow)
- `src/stores/editor-store.ts` — Zustand store for all editor state and actions
- `src/lib/plugin-loader.ts` — plugin loading, registration, and dev mode

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
