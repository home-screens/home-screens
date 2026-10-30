# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

Custom smart display system (a Dakboard / MagicMirror replacement). Web-based, runs on a Raspberry Pi in Chromium kiosk mode, portrait 1080x1920 by default. All data is local JSON under `data/`. No database, no cloud. Solo pre-release project: no backwards-compatibility shims or migration paths unless asked.

## Commands

```bash
npm run dev          # Dev server (Next.js)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Unit tests (vitest)
npx vitest run src/lib/__tests__/config.test.ts   # One test file
npm run test:e2e     # Playwright E2E (needs `npm run build` first)
npx playwright test --project=meta     # Coverage ratchets; run first when adding a module
npx playwright test --project=editor   # One surface's E2E specs
npm run test:shell   # Bash tests for scripts/*.sh (run after editing any shell script)
npm run docs:schema  # Regenerate website/content/generated/schema.json after editing config types, the module registry or an API route
```

Preflight gate before any commit: `npx tsc --noEmit`, `npm run lint`, `npm test` all pass.

## Tech Stack

Next.js 16 + React 19 (App Router), Tailwind v4, Zustand (editor state), @dnd-kit (editor drag-and-drop), Framer Motion (editor panels, plus the full-screen calendar's view switch and the meal planner's Today view; screen transitions use the View Transitions API in `ScreenRotator`), Vitest, Playwright. Path alias `@/*` maps to `./src/*`.

## Architecture

### Route groups (`src/app/`)
| Group | Path | Purpose |
|---|---|---|
| `(display)` | `/display`, `/display/[displayId]` | Fullscreen kiosk view. When the displays registry exists, `/display` renders the main display inline rather than redirecting (Chromium `--app` mode duplicates its window on a 307). |
| `(editor)` | `/editor` | Layout editor plus Settings. |
| `(remote)` | `/remote`, `/chores` | Phone remote and family surfaces (chores, meals, timers, lists, notes, photos). Manages data; the editor styles the display. `/chores` is the kid chore page, open on the LAN with no sign-in; its writes are `KID_VIEW_POST_ROUTES` in `src/proxy.ts`. |
| `(auth)` | `/login` | Authentication. |
| `(connect)` | `/editor/connect/google` | Where a Google Photos sign-in comes back to the hub. Home Screens' own Google apps are on by default (`src/lib/google-hosted.ts`); `HS_GOOGLE_HOSTED=0` turns them off and the page then 404s. Under `/editor` for the login gate, outside the editor layout. |
| `api/` | `/api/*` | One `route.ts` per endpoint. All external services (weather, calendar, stocks...) are proxied server-side to hold secrets and avoid CORS. |

### Code shared between surfaces
The same domain is often edited from two or three places: the editor, `/remote`, and sometimes the wall. What they share and what they must not is settled:

- **Rules go in `src/lib/<domain>-*.ts`** as pure functions: what a valid edit is, what an action does to the data, what an absent value means. `meal-settings.ts` and `meal-plan-actions.ts` are the worked examples, and `chore-form-presentation.ts` (still in `src/components/modules/chore-chart/`) is the older one. A rule written twice is the shape that lets a fix land on one surface and not the other.
- **Components both surfaces render go in `src/components/<domain>/`** (`family/`, `meals/`, `timetable/`), not inside `src/app/(remote)/remote/components/` where the editor cannot reach them.
- **Markup usually should not be shared.** The phone is touch-sized and inline-styled against the `remote` dictionary; the editor is not a touch surface, uses Tailwind, reads the `editor` dictionary, and its fields carry `data-field-id` for the settings search. One component serving both takes the styling system, density, dictionary and save model as parameters, which costs more than it saves. Share the rules underneath instead.

### API auth tiers
Every route under `src/app/api/` opens with one guard, usually through the `withAuth` / `withDisplayAuth` / `withMediaTokenAuth` wrappers in `src/lib/api-utils.ts` or a factory in `src/lib/route-factories.ts`, and picking the wrong one is the easiest security mistake to make:
- `requireSession` (`src/lib/auth.ts`, wrapped by `withAuth`): a logged-in editor or phone user. Rejects display bearer tokens. Use for anything that writes config or family data.
- `requireDisplayAuth` (`src/lib/auth.ts`, wrapped by `withDisplayAuth`; `withMediaTokenAuth` also accepts a signed `mt` token for bare `<video src>` URLs): a session cookie or the kiosk's display bearer token, with an optional trusted-IP bypass. Use for reads a wall display needs and the few writes it may make (tick a to-do, post status).
- `requireAdoptedDisplay` (`src/lib/adopted-display-gate.ts`): LAN plus presence in `config.displays` (or the id `main` before any displays exist). Used by the endpoints a Pi's shell scripts call without a display token: hardware stats and the kiosk bundle and bootstrap (display-only Pis), and power state (every kiosk Pi, the hub included, through `scripts/kiosk-power-agent.sh`).
- `requireSudo` (`src/lib/sudo-grant.ts`): for system actions (restart and reboot, WiFi, hostname, time zone). Answers 409 when the service account has no passwordless sudo, which the editor turns into a password prompt that repairs the grant. The upgrade pipeline makes the same check in its preflight and reports `needsSudoPassword`.
Proxy routes built with `cachedProxyRoute` are the exception to "opens with a guard": they declare `auth: 'display' | 'session'` on the factory config instead, so grepping for a guard clause will not find them.
`src/proxy.ts` sits in front of all of it: auth on/off, the IP allowlist, and rejection of cross-origin writes. Writes are default-deny there, but GET protection is a hand-maintained allowlist (`PROTECTED_GET_ROUTES`), so a meta ratchet requires every route to declare a posture one of those ways or name itself in `PUBLIC_ROUTES` with a reason. The IP allowlist exempts only `/login`, `/api/auth/status` and `/api/health`. The upgrade pipeline probes `/api/health` from the Pi itself to tell whether a release booted, and the display-only launcher probes it to learn whether the hub is up, so it stays public and allowlist-free and answers only version, build, schema and uptime, nothing about the household.

### Config schema migrations
`config.json` carries a schema version. `src/lib/migrations/` holds one `vN-to-vN+1.ts` per step from v5 on (v1 to v4 are inline in `index.ts`; `module-walk.ts` has the module walker), each imported and appended to the `migrations` list in `index.ts`. `migrateUp` runs on every read and the latest version is derived from that list, so the file plus its list entry is the whole bump, apart from rerunning `npm run docs:schema`, the `"version"` in the website `configuration.md` example and the `"schema"` in the `/api/health` example in `api.md`, all of which `docs-schema.test.ts` checks. Any change to the shape of `ScreenConfiguration`, `Screen`, `ModuleInstance` or a module config needs a migration, not a read-time shim. Plugin config shapes migrate through `src/lib/plugin-config-migration.ts`.

Releases carry two HTML-comment markers in their GitHub body, stamped by `scripts/release.sh` from code: `home-screens-schema` (the newest schema this release reads, from `getLatestSchemaVersion()`) and `home-screens-requires` (`REQUIRED_FLOORS` in the migrations module, empty until a release drops old migrations). `src/lib/update-policy.ts` turns them into what the update check offers and what `runUpgrade` refuses: a device below a floor is sent to the floor first, and a step back to a release whose schema is below the saved config's is withheld. The pipeline's migrate step in `src/lib/upgrade.ts` is the last place this release's migrations run before the new tree takes over, so any new lazy host migration must be settled there too.

### Module system
Built-in module types plus runtime plugins, found through a registry. Adding a built-in module touches these places, and the `meta` E2E project names exactly which ones are still missing:

1. Component in `src/components/modules/`
2. Type added to the `BuiltinModuleType` union and a config interface in `src/types/config.ts`, with a JSDoc comment on every field (the first paragraph is shown on the website, so keep it plain; developer notes go after a blank line), then `npm run docs:schema`
3. Registry entry in `src/lib/module-registry.ts` (type, label, icon, category, `defaultConfig`, `defaultSize`; set `autoSizesText` if the component uses `useScaledFontSize` / `useFitFontSize`)
4. Dynamic import in `src/lib/module-components.ts`
5. Config section in `src/components/editor/config-sections/` (one file per module, exported from the barrel, dispatched in `PropertyPanel.tsx`)
6. Optional API route under `src/app/api/`
7. Fixture row in `e2e/helpers/module-fixtures.ts`; a JSON stub under `e2e/fixtures/module-data/` plus a `stubKey` if it fetches data; a `CONFIG_VARIANTS` row per config field (or a reasoned `FIELD_DECISIONS` entry in `e2e/meta/coverage.spec.ts`); an `EXTRA_DISCRIMINATORS` row or a `DISCRIMINATOR_UNION_DECISIONS` entry for any other string union its config uses; an `EMPTY_STATE_FIXTURES` row if it uses `ModuleEmptyState` / `LocationRequired` / `WeatherEmptyState`
8. A `buildModuleInstance('<type>')` field-edit case in `e2e/editor/config-editing.spec.ts`
9. If it declares a `*View` union: a `VIEW_MATRIX` row in `e2e/helpers/view-matrix.ts` (rendered by `e2e/display/module-views.spec.ts`) or a `SINGLE_VIEW_TESTED_MODULES` entry in `e2e/meta/coverage.spec.ts`

Every `ModuleInstance` has three AND-combined visibility gates: `enabled` (toggle), `schedule` (day/time window) and `visibility` (conditions over the shared state bus). A `backgroundProvider` flag mounts a module hidden in `BackgroundProviderLayer` so its data loop survives screen rotation.

### Shared state bus
`src/lib/shared-state-store.ts` is a per-tab key/value bus. Producers are plugins (`publishState` / `clearState` via the SDK) and the host's own facts, published from `useSharedDisplayData` (`src/components/display/useSharedDisplayData.ts`): calendar (`src/lib/calendar-state.ts`), weather including warnings (`src/lib/weather-state.ts`) and the notes board's counts (`src/lib/notes-state.ts`). `src/lib/provided-state-keys.ts` decides which host keys the editor offers (calendar keys need a calendar source, weather keys a location, warning keys a provider that sends warnings; notes keys are always offered). Any module can condition its visibility on keys through `ModuleVisibility`, a closed union of `state` / `numeric` / `time` / `and` / `or` / `not` with a `whenUnknown` fallback evaluated before the tree. Clears are tombstoned for a 15s grace window so producer restarts never blink modules. Displays post a bus snapshot with their heartbeat; the editor polls `/api/display/shared-state?display=<id>` to show live values next to condition inputs (`VisibilityConditionsSection.tsx`). The Text module renders `{<state-key>}` tokens (`src/lib/shared-state-template.ts`).

### Plugin system
A plugin is an IIFE bundle plus manifest loaded at runtime from `data/plugins/`, typed as `plugin:<moduleType>`. Plugins use `window.__HS_SDK__` and `pluginFetch`, which goes through `/api/plugins/proxy/[pluginId]` (SSRF hardening, 60 req/min, 240 for `localNetwork` plugins). A manifest `auth` field declares a host-run OAuth2 or Garmin SSO adapter (`/api/plugins/auth/*`); tokens live in `data/plugin-tokens/` and the proxy injects and refreshes them. The real SDK contract is the host's `PluginGlobals.tsx`, not the template typings. Plugin manifests may ship `translations` that register under namespace `plugin:<pluginId>`.

### Multi-display (hub and spoke)
`ScreenConfiguration.displays?: DisplayNode[]` is optional. Unset means legacy single-display mode with `config.screens` as the source of truth, which is still the default. When set, each `DisplayNode` (including `main`, which is a regular node seeded from the globals at migration time) owns its own `screens`, dimensions, transform and optional profiles. Each Pi polls `/api/display/commands?display=<id>` every 3 s and posts status; that drain is the wall's heartbeat, and its `revisions` (build, plugin list, config ETag, timer session, chores, rewards and notes ETags, media library, calendar sources, from `src/lib/display-revisions.ts`) tell `useLiveConfig`, `TimerOverlay` and `useFetchData` (for the reads `display-heartbeat.ts` lists) when to fetch (`src/lib/display-heartbeat.ts`), and `library` and `calendar` drive early re-reads through `src/hooks/useRevisionRefresh.ts`; per-display command queues, the in-memory heartbeat `statusMap` and viewport reports live in `src/lib/display-commands.ts` (`__default__` for legacy callers, `all` broadcasts). Wall-side requests go through `displayFetch` (`src/lib/display-fetch.ts`), which adds the display token and aborts after `DISPLAY_FETCH_TIMEOUT_MS` (15 s) so a network blip cannot fill Chromium's connections. Pictures, plugin bundles and plugin proxy calls pass `timeoutMs: DISPLAY_FETCH_LONG_TIMEOUT_MS` (60 s) themselves, and any new slow request must do the same; `timeoutMs: null` is only for a request that must stay open. Editor screen mutations go through `getActiveScreens` / `withActiveScreens` so edits target the selected display. `validateDisplays` enforces slug, uniqueness and size caps. Display-only Pis (`scripts/install.sh --display-only`) run a Chromium kiosk against the hub with no Node.

Settings is split into **Defaults** (shared values, pages listed in `DEFAULT_PAGE_IDS`) and **Per display** (one page per display, every field an `OverrideRow` with explicit Override / Reset). `src/lib/settings-route.ts` parses and canonicalizes the settings URL and maps retired ids. `src/lib/display-defaults-backlinks.ts` tells a Defaults page which displays override its fields.

### Data files (`data/`)
| File | Module | Notes |
|---|---|---|
| `config.json` | `src/lib/config.ts` | Layout, displays, settings. `GET/PUT /api/config`; `updateConfigAtomic` for queued read-modify-write. Editor loads it into `src/stores/editor-store.ts`, edits in memory, saves via PUT. |
| `secrets.json` | `src/lib/secrets.ts` | API keys. |
| `family.json` | `src/lib/family-data.ts` | Shared roster for chores, calendars, rewards, timetables. |
| `chores.json`, `chore-completions.json`, `rewards.json` | `src/lib/chore-data.ts`, `src/lib/chore-completion-data.ts`, `src/lib/reward-data.ts` | Chore definitions; completions, bonus-chore grabs and put-backs; rewards, balances and redemptions. |
| `meals.json` | `src/lib/meal-data.ts` | Meal planner state and settings, shared by `/remote` and every module instance. |
| `todos.json` | `src/lib/todo-data.ts` | Shared to-do lists; a `todo` module points at a `listId` and never carries items. Only door is `/api/todo/lists*`. |
| `day-notes.json` | `src/lib/day-notes-data.ts` | Calendar day notes, a list of `{ id, date, text }` (up to three per day), written from `/remote` Notes > Calendar and drawn by every calendar with `showDayNotes` on. Rules in `src/lib/day-notes.ts`; swept six weeks after the day on the next write. |
| `notes.json` | `src/lib/notes-data.ts` | Family notes board; the wall reads `/api/notes?live=1`, the phone and the editor's Manage notes window (`NotesBoardModal`) read everything. Expired notes are kept a week for the phone's Gone group, then swept on the next write. |
| `routines.json`, `timer-session.json` | `src/lib/timer-data.ts` | Authored routines vs hot running session; displays derive countdowns from timestamps. |
| `timetables.json` | `src/lib/timetable-data.ts` | School bell times and one week per family member, revision-checked (409 on stale save). |
| `school-holidays.json` | `src/lib/school-holidays.ts` | Last-good OpenHolidays cache; only DE, FR, NL have data. |
| `icloud-accounts.json` | `src/lib/icloud-accounts.ts` | CalDAV app passwords, never returned by the API. |
| `google-tokens.json`, `google-picker-tokens.json` | `src/lib/google-token-stores.ts` | Google Calendar and Google Photos grants. A grant from Home Screens' own app carries `client_mode: 'hosted'`; `settings.googleApp` and `src/lib/google-app-choice.ts` decide which app signs in. |
| `custom-icons/` | `src/lib/custom-icon-data.ts` | The family's own icons. `index.json` goes through the data transaction; the pictures are `<hash>.webp` beside it, written before the index names them and kept out of the journal. |
| `plugins/`, `plugin-tokens/` | `src/lib/plugin-loader.ts`, `src/lib/plugin-auth.ts` | Bundles and OAuth tokens, kept apart so upgrades cannot wipe tokens. |
| `system-packages.json` | `scripts/upgrade.sh`, `scripts/kiosk-update-privileged.sh` | Installed versions of the kiosk programs and when they were last checked (`checkedAt`, read by `src/lib/hardware-stats-server.ts` and the Pi reporter). Written by shell, never by the app. |

Stores that take part in family changes or backup restore go through `src/lib/data-transaction.ts`, a reentrant per-root coordinator with a durable journal. Keep reference checks and their writes inside it, and make any new multi-file write path participate. The app is one process that serializes its own writes; there is no cross-process lock.

Every file that names a family member by id registers a `MemberReferenceDomain` in `src/lib/member-references/`: pure rules for what removing a person and restoring a backup mean for that file. Family deletion and restore walk that registry and nothing else, and `registry.test.ts` refuses a domain without a row exercising its policies. A new member-based store is added there before it ships.

### I18n
Locale lives in `GlobalSettings.locale` (BCP-47, default `en-US`), with optional `formattingLocale` for dates and numbers. Shipped locales: en-US, de-DE, fr-FR, es-ES, nl-NL, pt-BR, da-DK. Dictionaries are `src/translations/<locale>/{core,editor,modules,remote,weather}.json`; `src/i18n/manifest.ts` is the source of truth for registered locales. Server pages get a blob from `buildLocaleBlob`; client pages hydrate through `/api/i18n/[locale]`. A layout that passes `namespaces` without `blob` renders raw keys until the fetch lands.

### Other key files
- `src/types/config.ts`: every config type (ModuleType, ModuleInstance, ScreenConfiguration, GlobalSettings, DisplayNode); `src/types/plugins.ts` for plugin manifests
- `src/stores/editor-slices/`: editor actions by area (config, selection, modules, screens, settings, profiles, rules, displays, layout); history bookkeeping in `src/stores/editor-save.ts`
- `src/lib/weather/`: one file per provider behind a shared interface and factory
- `src/lib/google-calendar.ts`, `src/lib/caldav-calendar.ts`: calendar integrations
- `src/lib/google-hosted.ts` (Home Screens' own Google apps, on unless `HS_GOOGLE_HOSTED=0`), `src/lib/google-app-choice.ts` (which app each integration signs in with, from the one `settings.googleApp` switch), `src/lib/google-token-store.ts` / `google-token-stores.ts` (the grant store and its two instances)
- `src/lib/display-filter.ts`: `filterConfigForDisplay`, `validateDisplays`, `getDisplayScreens`
- `src/lib/display-dispatch.ts`, `src/hooks/useDisplayId.ts`: the `display-control` module's hub commands (`self`, `all`, or a display id)
- `src/lib/resolve-screen-duration.ts`: per-screen rotation duration with global fallback
- `scripts/reporter.sh` posts Pi hardware stats to `/api/display/hw-stats`, gated by `requireAdoptedDisplay` (LAN plus presence in `config.displays`)
- `website/`: separate Next.js app for homescreens.dev (marketing plus Markdoc docs, static export to Cloudflare Pages, build with `--webpack`); sidebar in `website/src/lib/docs-navigation.ts`
- `infrastructure/`: Cloudflare workers deployed with wrangler: `google-oauth-worker` (auth.homescreens.dev, holds the hosted Google client secrets and adds them to hub token requests), `telemetry-worker` (the anonymous beacon), `version-worker` (cached latest-release lookup)

## Testing

Unit tests are Vitest in `__tests__/` directories next to the code, `node` environment, with `data/` and `public/` sandboxed by `vitest.setup.ts`.

E2E is Playwright, Chromium only, in `e2e/`. Each worker boots its own production `next start` from a sandboxed cwd with a private `data/` (`e2e/helpers/sandbox.ts`), so runs never touch the real data. Specs reset state with `PUT /api/config` in `beforeEach`.

Module coverage is data-driven. `e2e/helpers/module-fixtures.ts` has one row per built-in type and the render matrices loop over it; config-field depth lives in `e2e/helpers/config-variants/`, empty states in `e2e/helpers/empty-state-fixtures.ts`, the style matrix in `e2e/display/module-style.spec.ts` (exemptions in `e2e/helpers/style-matrix.ts` carry a reason). Module data is fetched client-side and stubbed at the browser boundary by `stubModuleData` (`e2e/helpers/stubs.ts`), whose external-block catch-all guarantees zero real upstream calls. Local-data modules seed instead: `seedChores`, `seedMeals`, `seedTodos(sandboxDir)`; plugin specs use `seedFixturePlugin`. The ratchets in `e2e/meta/coverage.spec.ts` also police settings pages, API routes (`ROUTE_DECISIONS`), locales per surface, `autoSizesText` flags, style exemptions, every route's auth posture (`PUBLIC_ROUTES`), and agreement between a registry `defaultConfig` and the fallback the code renders or fetches with (`DEFAULT_FALLBACK_EXEMPTIONS`).

## Working Conventions

- Plans and specs live in `.claude/plans/` (finished ones in `.claude/plans-finished/`), mockups in `.claude/mockups/`. None are committed.
- UI features are mockup-first: real HTML mockup, sign-off, implement, then audit the rendered result against the mockup.
- Never claim a fix without observing the fixed behavior in the running app or a re-run check.
- Never commit until the user signs off. One summary line, blank line, bulleted body. No phase or review references, no attribution, no em-dashes.
- User-visible strings are kid-friendly plain language: no "admin", "permission", "enum", "backfill", or node/chromium jargon. Children use the chore chart and `/remote`; issue reporters are not developers.
- Member-based UIs must work with 5+ members: aggregate indicators, not per-member visuals.
- Placeholder content in unconfigured modules is intentional; never blank it.
