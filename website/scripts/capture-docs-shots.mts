/**
 * Render the documentation screenshots from a sandboxed production build.
 *
 *   npm run build              (root repo, once)
 *   npm run docs:shots         (root repo)
 *   npm run docs:shots -- --only editor-areas,remote-chores
 *
 * Boots the same private-data `next start` the E2E suite uses
 * (e2e/helpers/server.ts), seeds a stand-in household, drives Chromium
 * through each shot, and writes website/public/images/docs/<name>.webp
 * (+ .jpg fallback) plus manifest.json with the rendered sizes and alt text.
 * Nothing here touches the real data/ or public/ directories, and no request
 * leaves the machine: weather, calendar, the plugin registry and the version
 * check are answered from stubs at the browser boundary.
 *
 * Re-run after any label or layout change; a screenshot is a build artifact,
 * not a thing to retouch by hand.
 */
import { chromium, type Browser, type Page, type APIRequestContext, request as playwrightRequest } from 'playwright';
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchServer, type HsServer } from '../../e2e/helpers/server';
import { baseConfig, choreChartModule, makeScreen } from '../../e2e/helpers/config-fixtures';
import { buildModuleInstance } from '../../e2e/helpers/module-fixtures';
import { putConfig } from '../../e2e/helpers/api';
import { richWeather } from '../../e2e/helpers/weather-payload';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.resolve(HERE, '..', 'public', 'images', 'docs');
const APP_VERSION: string = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------------------
// Stand-in household. Never real people, never a real address.
// ---------------------------------------------------------------------------

const LOCATION = {
  latitude: 40.015,
  longitude: -105.2705,
  locationName: 'Boulder, CO',
  timezone: 'America/Denver',
};

const MEMBERS = [
  { id: 'm-avery', name: 'Avery', emoji: '🦊', color: '#f59e0b' },
  { id: 'm-riley', name: 'Riley', emoji: '🐸', color: '#10b981' },
  { id: 'm-jordan', name: 'Jordan', emoji: '🐼', color: '#3b82f6' },
  { id: 'm-casey', name: 'Casey', emoji: '🦋', color: '#a855f7' },
  { id: 'm-quinn', name: 'Quinn', emoji: '🐙', color: '#ec4899' },
];

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const SCHOOL_DAYS = [1, 2, 3, 4, 5];

const CHORES = [
  { id: 'c-bed', name: 'Make your bed', emoji: '🛏️', points: 1, frequency: 'daily', daysOfWeek: EVERY_DAY, timeOfDay: 'morning', assigneeIds: MEMBERS.map((m) => m.id), rotation: 'fixed' },
  { id: 'c-dog', name: 'Feed the dog', emoji: '🐶', points: 1, frequency: 'daily', daysOfWeek: EVERY_DAY, timeOfDay: 'morning', assigneeIds: ['m-avery', 'm-riley'], rotation: 'fixed' },
  { id: 'c-dishes', name: 'Empty the dishwasher', emoji: '🍽️', points: 2, frequency: 'daily', daysOfWeek: EVERY_DAY, timeOfDay: 'afternoon', assigneeIds: ['m-jordan', 'm-casey'], rotation: 'fixed' },
  { id: 'c-homework', name: 'Homework', emoji: '📚', points: 2, frequency: 'daily', daysOfWeek: SCHOOL_DAYS, timeOfDay: 'afternoon', assigneeIds: ['m-avery', 'm-riley', 'm-jordan'], rotation: 'fixed' },
  { id: 'c-trash', name: 'Take out the trash', emoji: '🗑️', points: 2, frequency: 'daily', daysOfWeek: EVERY_DAY, timeOfDay: 'evening', assigneeIds: ['m-quinn'], rotation: 'fixed' },
  { id: 'c-piano', name: 'Practice piano', emoji: '🎹', points: 1, frequency: 'daily', daysOfWeek: SCHOOL_DAYS, timeOfDay: 'evening', assigneeIds: ['m-casey'], rotation: 'fixed' },
];

const MEALS = [
  { id: 'meal-tacos', name: 'Taco night', emoji: '🌮', prepTime: 20, category: 'main', difficulty: 'easy', servings: 6 },
  { id: 'meal-spaghetti', name: 'Spaghetti and meatballs', emoji: '🍝', prepTime: 30, category: 'main', difficulty: 'easy', servings: 6 },
  { id: 'meal-stirfry', name: 'Chicken stir-fry', emoji: '🥦', prepTime: 25, category: 'main', difficulty: 'medium', servings: 6 },
  { id: 'meal-pizza', name: 'Homemade pizza', emoji: '🍕', prepTime: 45, category: 'main', difficulty: 'medium', servings: 6 },
  { id: 'meal-soup', name: 'Tomato soup and grilled cheese', emoji: '🍲', prepTime: 20, category: 'main', difficulty: 'easy', servings: 6 },
  { id: 'meal-salmon', name: 'Sheet-pan salmon', emoji: '🐟', prepTime: 30, category: 'main', difficulty: 'easy', servings: 6 },
  { id: 'meal-burgers', name: 'Burgers on the grill', emoji: '🍔', prepTime: 25, category: 'main', difficulty: 'easy', servings: 6 },
];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of the current week (the meal planner's default week start). */
function weekStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function mealPlan() {
  const start = weekStart();
  return MEALS.map((meal, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: isoDate(d), slot: 'dinner', mealId: meal.id };
  });
}

/** A week of family events around today, for stubbing /api/calendar. */
function familyEvents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return `${isoDate(d)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  };
  const evt = (id: string, title: string, day: number, h: number, dur: number, color: string, source: string, extra: Record<string, unknown> = {}) => ({
    id, title, start: at(day, h), end: at(day, h + dur), allDay: false, location: '',
    calendarColor: color, sourceId: `ical-${source.toLowerCase()}`, sourceName: source, kind: 'event', ...extra,
  });
  return [
    evt('e1', 'Soccer practice', 0, 16, 1, '#10b981', 'Kids'),
    evt('e2', 'Piano lesson', 0, 17, 1, '#a855f7', 'Kids'),
    evt('e3', 'Dentist for Riley', 1, 9, 1, '#3b82f6', 'Family'),
    evt('e4', 'Book club', 1, 19, 2, '#3b82f6', 'Family'),
    evt('e5', 'Early dismissal', 2, 13, 1, '#10b981', 'School'),
    evt('e6', 'Grandma visits', 3, 12, 6, '#ec4899', 'Family'),
    evt('e7', 'Pizza and movie night', 4, 18, 3, '#3b82f6', 'Family'),
    evt('e8', 'Farmers market', 5, 9, 2, '#3b82f6', 'Family'),
    evt('e9', 'Birthday party at the park', 6, 14, 3, '#10b981', 'Kids'),
  ];
}

/** Feeds the family scenario lists in Settings > Calendar. Their events come from the stub below, never the network. */
const ICAL_SOURCES = [
  { id: 'ical-family', type: 'ical', name: 'Family', url: 'https://calendar.google.com/calendar/ical/family%40example.com/private-0000/basic.ics', color: '#3b82f6', enabled: true },
  { id: 'ical-kids', type: 'ical', name: 'Kids', url: 'https://calendar.google.com/calendar/ical/kids%40example.com/private-0000/basic.ics', color: '#10b981', enabled: true },
  { id: 'ical-school', type: 'ical', name: 'School', url: 'https://www.example.org/calendar/school.ics', color: '#f59e0b', enabled: true },
];

function sourceStatus() {
  return ICAL_SOURCES.map((src) => ({ id: src.id, name: src.name, ok: true, fetchedAt: Date.now() - 90_000 }));
}

const REGISTRY = {
  schemaVersion: 1,
  lastUpdated: '2026-08-01T00:00:00Z',
  plugins: [
    {
      id: 'home-assistant', name: 'Home Assistant', author: 'Home Screens', license: 'MIT', verified: true,
      description: 'Lights, thermostats, sensors and media players from your Home Assistant, as cards on the wall.',
      repo: 'https://github.com/home-screens/home-screens-plugin-home-assistant', category: 'Smart Home', tags: ['home-assistant'], icon: 'Home',
      permissions: ['network', 'secrets', 'localNetwork'],
      versions: [{ version: '1.4.0', minAppVersion: '1.10.0', releaseDate: '2026-08-01', downloadUrl: 'https://example.invalid/ha.tar.gz', sha256: '0'.repeat(64), changelog: 'Alert tiles and look rules.' }],
    },
    {
      id: 'garmin', name: 'Garmin', author: 'Home Screens', license: 'MIT', verified: true,
      description: 'Steps, sleep, body battery and your latest activity from Garmin Connect.',
      repo: 'https://github.com/home-screens/home-screens-plugin-garmin', category: 'Health & Fitness', tags: ['fitness'], icon: 'Watch',
      permissions: ['network', 'secrets'],
      versions: [{ version: '1.1.0', minAppVersion: '1.10.0', releaseDate: '2026-07-20', downloadUrl: 'https://example.invalid/garmin.tar.gz', sha256: '0'.repeat(64), changelog: 'Six views and size tiers.' }],
    },
    {
      id: 'strava', name: 'Strava', author: 'Home Screens', license: 'MIT', verified: true,
      description: 'Recent activities, goal progress, route maps and a year poster from Strava.',
      repo: 'https://github.com/home-screens/home-screens-plugin-strava', category: 'Health & Fitness', tags: ['fitness'], icon: 'Activity',
      permissions: ['network', 'secrets'],
      versions: [{ version: '1.0.0', minAppVersion: '1.10.0', releaseDate: '2026-07-11', downloadUrl: 'https://example.invalid/strava.tar.gz', sha256: '0'.repeat(64), changelog: 'First release.' }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Configs (one per scenario)
// ---------------------------------------------------------------------------

function familyTemplateScreen(): Screen {
  const tpl = JSON.parse(readFileSync(path.join(ROOT, 'public', 'templates', 'family-dashboard.json'), 'utf8'));
  const screen: Screen = tpl.screens[0];
  screen.id = 'screen-family';
  screen.name = 'Family';
  screen.backgroundImage = '/backgrounds/themes/dusk.svg';
  for (const mod of screen.modules as ModuleInstance[]) {
    if (mod.type === 'countdown') {
      mod.config = { ...mod.config, events: [{ id: 'cd-1', name: 'Grandma visits', date: isoDate(new Date(Date.now() + 3 * 86400_000)) }] };
    }
    if (mod.type === 'greeting') {
      mod.config = { ...mod.config, name: 'Taylor' };
    }
  }
  return screen;
}

function choresScreen(): Screen {
  const chores = choreChartModule();
  chores.position = { x: 20, y: 20 };
  chores.size = { w: 1040, h: 760 };
  const meals = buildModuleInstance('meal-planner', { view: 'week' });
  meals.position = { x: 20, y: 820 };
  meals.size = { w: 1040, h: 1080 };
  return makeScreen('screen-chores', 'Chores and meals', [chores, meals], { backgroundImage: '/backgrounds/themes/forest.svg' });
}

function familySettings(): Record<string, unknown> {
  return {
    ...LOCATION,
    rotationIntervalMs: 30_000,
    weather: { provider: 'open-meteo', latitude: LOCATION.latitude, longitude: LOCATION.longitude, units: 'imperial' },
    calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: ICAL_SOURCES, daysAhead: 7 },
  };
}

function familyConfig(): ScreenConfiguration {
  return baseConfig({ screens: [familyTemplateScreen(), choresScreen()], settings: familySettings() });
}

/** What a freshly flashed Pi has: one empty screen and no location. */
function freshConfig(): ScreenConfiguration {
  return baseConfig({
    screens: [makeScreen('default', 'Screen 1', [])],
    settings: { rotationIntervalMs: 30_000, weather: { provider: 'open-meteo', latitude: 0, longitude: 0, units: 'imperial' } },
  });
}

function multiDisplayConfig(): ScreenConfiguration {
  const config = familyConfig();
  const hallway = makeScreen('screen-hallway', 'Hallway', [
    Object.assign(buildModuleInstance('clock', { view: 'digital' }), { position: { x: 40, y: 40 }, size: { w: 900, h: 300 } }),
    Object.assign(buildModuleInstance('weather', { view: 'daily' }), { position: { x: 40, y: 380 }, size: { w: 1840, h: 640 } }),
  ], { backgroundImage: '/backgrounds/themes/midnight.svg' });
  (config as unknown as Record<string, unknown>).displays = [
    { id: 'main', name: 'Kitchen wall', screens: config.screens, displayWidth: 1080, displayHeight: 1920, displayTransform: '90' },
    { id: 'hallway', name: 'Hallway', screens: [hallway], displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal' },
  ];
  return config;
}

type Scenario = 'family' | 'fresh' | 'multi';
const CONFIGS: Record<Scenario, () => ScreenConfiguration> = {
  family: familyConfig,
  fresh: freshConfig,
  multi: multiDisplayConfig,
};

// ---------------------------------------------------------------------------
// Browser-side stubs
// ---------------------------------------------------------------------------

function isAppHost(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url);
}

async function installStubs(page: Page): Promise<void> {
  // Registered first so the specific stubs below take precedence.
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (isAppHost(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.fallback();
    return route.abort();
  });
  const weather = richWeather();
  weather.alerts = [];
  await page.route('**/api/weather*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weather) }));
  await page.route('**/api/calendar*', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/calendar') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: familyEvents(), sourceStatus: sourceStatus() }) });
    }
    if (pathname === '/api/calendar/status') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceStatus: sourceStatus() }) });
    }
    return route.fallback();
  });
  await page.route('**/api/plugins/registry*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REGISTRY) }));
  await page.route('**/api/system/version*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      current: APP_VERSION, currentCommit: '', latest: APP_VERSION, latestCommit: '', updateAvailable: false,
      installedVia: 'tarball', channel: 'release', upgradeRunning: false,
      tags: [{ tag: `v${APP_VERSION}`, version: APP_VERSION, commit: '', hasTarball: true }],
    }),
  }));
}

// ---------------------------------------------------------------------------
// Annotations: numbered callouts drawn into the page before the capture
// ---------------------------------------------------------------------------

interface Box { x: number; y: number; w: number; h: number }
interface Callout {
  n: number;
  label: string;
  box: Box;
  /** Put the badge and label under the box instead of inside its top-left corner. */
  below?: boolean;
  /** Hang the label off the box's right edge (for boxes at the right of the viewport). */
  right?: boolean;
  /** Extra vertical offset for the badge, to clear something drawn in the corner. */
  dy?: number;
}

async function annotate(page: Page, callouts: Callout[]): Promise<void> {
  // Page-side code is passed as a string: tsx compiles this file with
  // esbuild's keepNames, which wraps every function in a `__name` helper that
  // does not exist inside the page.
  await page.evaluate(`(function (items) {
    var root = document.createElement('div');
    root.id = '__docshot-annotations';
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });
    var font = 'ui-sans-serif, system-ui, sans-serif';
    items.forEach(function (item) {
      var box = item.box;
      var outline = document.createElement('div');
      Object.assign(outline.style, {
        position: 'absolute', left: (box.x - 3) + 'px', top: (box.y - 3) + 'px', width: (box.w + 6) + 'px', height: (box.h + 6) + 'px',
        border: '3px solid #22d3ee', borderRadius: '8px', boxSizing: 'border-box',
      });
      root.appendChild(outline);
      var badgeTop = (item.below ? box.y + box.h + 10 : box.y + 6) + (item.dy || 0);
      var badge = document.createElement('div');
      badge.textContent = String(item.n);
      Object.assign(badge.style, {
        position: 'absolute', top: badgeTop + 'px', width: '30px', height: '30px', borderRadius: '15px',
        background: '#22d3ee', color: '#0a0a0a', font: '700 16px/30px ' + font, textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,.45)',
      });
      root.appendChild(badge);
      var pill = document.createElement('div');
      pill.textContent = item.label;
      Object.assign(pill.style, {
        position: 'absolute', top: (badgeTop + 2) + 'px', padding: '0 10px', height: '26px', borderRadius: '13px',
        background: 'rgba(10,10,10,.92)', color: '#e5f9fd', font: '600 13px/26px ' + font, whiteSpace: 'nowrap',
        border: '1px solid rgba(34,211,238,.6)',
      });
      root.appendChild(pill);
      if (item.right) {
        var fromRight = window.innerWidth - (box.x + box.w) + 6;
        pill.style.right = fromRight + 'px';
        badge.style.right = (fromRight + pill.getBoundingClientRect().width + 6) + 'px';
      } else {
        badge.style.left = (box.x + 6) + 'px';
        pill.style.left = (box.x + 42) + 'px';
      }
    });
    document.body.appendChild(root);
  })(${JSON.stringify(callouts)})`);
}

/** Five areas of the editor, located by test ids, the panel columns and the screen names. */
async function editorAreas(page: Page, screenNames: string[]): Promise<Callout[]> {
  return page.evaluate(`(function (screenNames) {
    function rect(el) {
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    function union(els) {
      if (els.length === 0) return null;
      var rs = els.map(function (e) { return e.getBoundingClientRect(); });
      var x = Math.min.apply(null, rs.map(function (r) { return r.x; }));
      var y = Math.min.apply(null, rs.map(function (r) { return r.y; }));
      var x2 = Math.max.apply(null, rs.map(function (r) { return r.right; }));
      var y2 = Math.max.apply(null, rs.map(function (r) { return r.bottom; }));
      return { x: x, y: y, w: x2 - x, h: y2 - y };
    }
    // A screen tab is the pill around the element whose text is exactly the screen name.
    var tabs = [];
    screenNames.forEach(function (name) {
      var el = Array.prototype.find.call(document.querySelectorAll('span, div, button'), function (e) {
        return e.childElementCount === 0 && e.textContent.trim() === name;
      });
      if (el) tabs.push(el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement : el);
    });
    var save = document.querySelector('[data-testid="save-status"]');
    var out = [];
    function push(n, label, box, extra) { if (box) out.push(Object.assign({ n: n, label: label, box: box }, extra || {})); }
    push(1, 'Screens', union(tabs), { below: true });
    push(2, 'Modules', rect(document.querySelector('.w-56.flex-shrink-0.bg-hs-panel')));
    push(3, 'Your screen', rect(document.querySelector('[data-testid="editor-canvas"]')));
    push(4, 'Settings for what you picked', rect(document.querySelector('.w-72.flex-shrink-0.bg-hs-panel')), { dy: 44 });
    push(5, 'Plugins, Settings, Preview', rect(save ? save.parentElement : null), { below: true, right: true });
    return out;
  })(${JSON.stringify(screenNames)})`) as Promise<Callout[]>;
}

// ---------------------------------------------------------------------------
// Shot list
// ---------------------------------------------------------------------------

interface Ctx {
  server: HsServer;
  request: APIRequestContext;
}

interface Shot {
  name: string;
  alt: string;
  scenario: Scenario;
  viewport: { width: number; height: number };
  /** Device scale factor. 2 for UI, 1 for the wall. */
  dpr?: number;
  /** Longest side of the written image, in pixels. */
  maxWidth: number;
  /** Drive the page to the state to capture. */
  run: (page: Page, ctx: Ctx) => Promise<void>;
  /** Optional element to clip to instead of the viewport. */
  clip?: string;
  /** A one-off config for this shot; the scenario config is restored afterwards. */
  config?: () => ScreenConfiguration;
}

/** A display heartbeat the way a Pi posts one, naming the screen it is showing. */
async function heartbeat(request: APIRequestContext, opts: { display?: string; screen?: { index: number; id: string; name: string }; screenCount?: number; brightness?: number } = {}): Promise<void> {
  const { display, screen = { index: 0, id: 'screen-family', name: 'Family' }, screenCount = 2, brightness = 100 } = opts;
  const url = display ? `/api/display/status?display=${encodeURIComponent(display)}` : '/api/display/status';
  const res = await request.post(url, {
    data: {
      ...(display ? { displayId: display } : {}),
      currentScreen: screen, screenCount, activeProfile: null, displayState: 'active', timestamp: Date.now(), brightness,
    },
  });
  if (!res.ok()) throw new Error(`heartbeat: ${res.status()} ${await res.text()}`);
}

/**
 * The sandbox answers on 127.0.0.1:<random port>; a real Pi prints
 * home-screens.local:3000. Swap the text (QR codes still encode the sandbox
 * address, which no reader can tell apart).
 */
async function prettifyOrigin(page: Page, origin: string): Promise<void> {
  await page.evaluate(`(function (from, to) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (node.nodeValue && node.nodeValue.indexOf(from) >= 0) node.nodeValue = node.nodeValue.split(from).join(to);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input'), function (input) {
      if (input.value && input.value.indexOf(from) >= 0) input.value = input.value.split(from).join(to);
    });
  })(${JSON.stringify(origin.replace(/^https?:\/\//, ''))}, 'home-screens.local:3000')`);
}

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const WALL = { width: 1080, height: 1920 };

const settle = (page: Page, ms = 1200) => page.waitForTimeout(ms);

async function openEditor(page: Page, query = ''): Promise<void> {
  await page.goto(`/editor${query}`);
  await page.getByTestId('editor-canvas').waitFor();
  await settle(page, 1800);
}

async function openSettings(page: Page, pageId: string, extra = ''): Promise<void> {
  await page.goto(`/editor/settings?section=defaults&page=${pageId}${extra}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await settle(page);
}

async function openRemote(page: Page, ctx: Ctx, tab?: string): Promise<void> {
  await heartbeat(ctx.request);
  await page.goto('/remote');
  await page.waitForLoadState('networkidle').catch(() => {});
  if (tab) {
    await page.getByRole('button', { name: tab, exact: true }).or(page.getByRole('link', { name: tab, exact: true })).or(page.getByRole('tab', { name: tab })).first().click();
  }
  await settle(page, 1500);
}

const SHOTS: Shot[] = [
  // --- Editor -------------------------------------------------------------
  {
    name: 'editor-areas', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The editor with its five areas numbered: screens, modules, your screen, the settings panel, and the toolbar buttons.',
    run: async (page) => {
      await openEditor(page);
      await annotate(page, await editorAreas(page, ['Family', 'Chores and meals']));
    },
  },
  {
    name: 'editor-family-template', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The editor showing the Family Dashboard template: clock, greeting, weather, calendar and countdown.',
    run: async (page) => { await openEditor(page); },
  },
  {
    name: 'editor-module-selected', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'A weather module selected on the canvas, with its settings open in the panel on the right.',
    run: async (page) => {
      await openEditor(page);
      await page.locator('[data-module-type="weather"]').first().click();
      await settle(page);
    },
  },
  {
    name: 'editor-screen-tab-menu', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The menu that opens when you right-click a screen tab.',
    run: async (page) => {
      await openEditor(page);
      await page.getByText('Family', { exact: true }).first().click({ button: 'right' });
      await settle(page, 600);
    },
  },
  {
    name: 'editor-empty-screen', scenario: 'fresh', viewport: DESKTOP, maxWidth: 1600,
    alt: 'A brand-new editor: the empty screen offers "Choose a template" and the panel on the right shows the first-run checklist.',
    run: async (page) => {
      await openEditor(page);
      await page.getByTestId('empty-screen-placeholder').waitFor();
    },
  },
  {
    name: 'editor-template-picker', scenario: 'fresh', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The template picker, opened from the empty screen.',
    run: async (page) => {
      await openEditor(page);
      await page.getByTestId('empty-screen-placeholder').getByRole('button', { name: /template/i }).click();
      await settle(page);
    },
  },
  {
    name: 'editor-plugins', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Plugins browser with Home Assistant, Garmin and Strava available to install.',
    run: async (page) => {
      await openEditor(page);
      await page.getByRole('button', { name: 'Plugins', exact: true }).click();
      await settle(page, 1500);
    },
  },
  // --- Settings -----------------------------------------------------------
  {
    name: 'settings-screen', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'Settings, opened on the Screen page. The sidebar groups pages under Screen, Content, Automation and Maintenance.',
    run: async (page) => { await openSettings(page, 'screen'); },
  },
  {
    name: 'settings-sleep', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Sleep & dimming tab of the Screen page, with the bright, dimmed and off timeline.',
    run: async (page) => { await openSettings(page, 'screen', '&panel=sleep'); },
  },
  {
    name: 'settings-location', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Location & language page, where you type your town or zip code.',
    run: async (page) => { await openSettings(page, 'location'); },
  },
  {
    name: 'settings-weather', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Weather page with one card per provider. Open-Meteo is ready without a key.',
    run: async (page) => { await openSettings(page, 'weather'); },
  },
  {
    name: 'settings-calendar', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Calendar page: iCal feeds, Google sign-in and iCloud accounts.',
    run: async (page) => { await openSettings(page, 'calendar'); },
  },
  {
    name: 'settings-meals', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Meals page with the shared meal-planner settings.',
    run: async (page) => { await openSettings(page, 'meals'); },
  },
  {
    name: 'settings-phone', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The On your phone page: the kids\' chores link, the family remote link, and the password switch.',
    run: async (page) => { await openSettings(page, 'phone'); },
  },
  {
    name: 'settings-api-keys', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The API keys page, one card per service.',
    run: async (page) => { await openSettings(page, 'integrations'); },
  },
  {
    name: 'settings-automation', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Automation page with its Profiles, Rules and Shared state tabs.',
    run: async (page) => { await openSettings(page, 'automation'); },
  },
  {
    name: 'settings-security', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Security page, where you set a password.',
    run: async (page) => { await openSettings(page, 'security'); },
  },
  {
    name: 'settings-network', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Network page: WiFi, IP address and hostname.',
    run: async (page) => { await openSettings(page, 'network'); },
  },
  {
    name: 'settings-system', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The System & updates page, with the installed version and the update and roll back controls.',
    run: async (page) => { await openSettings(page, 'system'); },
  },
  {
    name: 'settings-backups', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Backups & data page.',
    run: async (page) => { await openSettings(page, 'data'); },
  },
  {
    name: 'settings-status', scenario: 'family', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The Status page, with the Diagnostics bundle button.',
    run: async (page) => { await openSettings(page, 'stats'); },
  },
  // --- The wall -------------------------------------------------------------
  {
    name: 'display-fresh', scenario: 'fresh', viewport: WALL, dpr: 1, maxWidth: 720,
    alt: 'A brand-new display: a dark screen with the address to open in a browser and a QR code.',
    run: async (page) => {
      await page.goto('/display');
      await page.getByTestId('empty-display-hint').waitFor();
      await settle(page, 1500);
    },
  },
  {
    name: 'display-family', scenario: 'family', viewport: WALL, dpr: 1, maxWidth: 720,
    alt: 'The Family Dashboard template on the wall.',
    run: async (page) => {
      await page.goto('/display');
      await page.locator('[data-module-type="weather"]').waitFor();
      await settle(page, 2500);
    },
  },
  {
    name: 'display-chores', scenario: 'family', viewport: WALL, dpr: 1, maxWidth: 720,
    alt: 'A chore chart and the week\'s meals on the wall.',
    // The wall always starts on the first screen, so this shot swaps the order.
    config: () => baseConfig({ screens: [choresScreen(), familyTemplateScreen()], settings: familySettings() }),
    run: async (page) => {
      await page.goto('/display');
      await page.locator('[data-module-type="chore-chart"]').waitFor();
      await settle(page, 2500);
    },
  },
  // --- Phone --------------------------------------------------------------
  {
    name: 'phone-launcher', scenario: 'family', viewport: PHONE, maxWidth: 780,
    alt: 'Opening the Home Screens address on a phone: buttons for the family remote, the kids\' chores and the display.',
    run: async (page) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle').catch(() => {});
      await settle(page);
    },
  },
  {
    name: 'remote-control', scenario: 'family', viewport: PHONE, maxWidth: 780,
    alt: 'The family remote\'s Control tab: which screen is showing, brightness, wake and sleep.',
    run: async (page, ctx) => { await openRemote(page, ctx); },
  },
  {
    name: 'remote-chores', scenario: 'family', viewport: PHONE, maxWidth: 780,
    alt: 'The family remote\'s Chores tab.',
    run: async (page, ctx) => { await openRemote(page, ctx, 'Chores'); },
  },
  {
    name: 'remote-meals', scenario: 'family', viewport: PHONE, maxWidth: 780,
    alt: 'The family remote\'s Meals tab with this week\'s dinners.',
    run: async (page, ctx) => { await openRemote(page, ctx, 'Meals'); },
  },
  {
    name: 'remote-timers', scenario: 'family', viewport: PHONE, maxWidth: 780,
    alt: 'The family remote\'s Timers tab.',
    run: async (page, ctx) => { await openRemote(page, ctx, 'Timers'); },
  },
  {
    name: 'kid-view', scenario: 'family', viewport: PHONE, maxWidth: 780,
    alt: 'The kids\' chores page on a phone: pick your name and check off today\'s chores.',
    run: async (page) => {
      await page.goto('/chores');
      await page.waitForLoadState('networkidle').catch(() => {});
      await settle(page, 1500);
    },
  },
  // --- More than one display ---------------------------------------------------
  {
    name: 'editor-display-switcher', scenario: 'multi', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The display switcher in the editor toolbar, open, listing Kitchen wall and Hallway.',
    run: async (page, ctx) => {
      await heartbeat(ctx.request, { display: 'main' });
      await heartbeat(ctx.request, { display: 'hallway', screen: { index: 0, id: 'screen-hallway', name: 'Hallway' }, screenCount: 1 });
      await openEditor(page);
      await page.getByTestId('display-switcher').click();
      await page.getByTestId('display-switcher-menu').waitFor();
      await settle(page, 500);
    },
  },
  {
    name: 'settings-all-displays', scenario: 'multi', viewport: DESKTOP, maxWidth: 1600,
    alt: 'The All displays page: one card per display, and a new display waiting to be added.',
    run: async (page, ctx) => {
      await heartbeat(ctx.request, { display: 'bedroom', screen: { index: 0, id: '', name: '' }, screenCount: 0 });
      await heartbeat(ctx.request, { display: 'main' });
      await heartbeat(ctx.request, { display: 'hallway', screen: { index: 0, id: 'screen-hallway', name: 'Hallway' }, screenCount: 1 });
      await page.goto('/editor/settings?section=displays');
      await page.waitForLoadState('networkidle').catch(() => {});
      await settle(page, 1500);
    },
  },
  {
    name: 'settings-per-display', scenario: 'multi', viewport: DESKTOP, maxWidth: 1600,
    alt: 'One display\'s own settings page, with Override and Reset to default on each row.',
    run: async (page) => {
      await page.goto('/editor/settings?section=display&id=hallway&subtab=overrides');
      await page.waitForLoadState('networkidle').catch(() => {});
      await settle(page, 1500);
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface ManifestEntry { width: number; height: number; alt: string; viewport: string }

async function seedFamilyData(request: APIRequestContext): Promise<void> {
  let res = await request.put('/api/chores/data', { data: { members: MEMBERS, chores: CHORES } });
  if (!res.ok()) throw new Error(`seed chores: ${res.status()} ${await res.text()}`);
  const today = isoDate(new Date());
  for (const [choreId, memberId] of [['c-bed', 'm-avery'], ['c-bed', 'm-jordan'], ['c-bed', 'm-quinn'], ['c-dog', 'm-avery'], ['c-dishes', 'm-casey']]) {
    res = await request.post('/api/chores', { data: { choreId, memberId, date: today } });
    if (!res.ok()) throw new Error(`toggle chore: ${res.status()} ${await res.text()}`);
  }
  res = await request.put('/api/meals/data', { data: { savedMeals: MEALS, plan: mealPlan(), settings: { enabledSlots: ['dinner'], weekStartDay: 'monday' } } });
  if (!res.ok()) throw new Error(`seed meals: ${res.status()} ${await res.text()}`);
}

async function writeImage(name: string, png: Buffer, maxWidth: number): Promise<{ width: number; height: number }> {
  const base = sharp(png).resize({ width: maxWidth, withoutEnlargement: true });
  const webp = await base.clone().webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  const jpg = await base.clone().jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  writeFileSync(path.join(OUT_DIR, `${name}.webp`), webp.data);
  writeFileSync(path.join(OUT_DIR, `${name}.jpg`), jpg);
  return { width: webp.info.width, height: webp.info.height };
}

async function main(): Promise<void> {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)
    ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined);
  const only = onlyArg ? new Set(onlyArg.split(',')) : null;
  const shots = SHOTS.filter((s) => !only || only.has(s.name));
  if (shots.length === 0) throw new Error(`No shots match --only=${onlyArg}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  let manifest: Record<string, ManifestEntry> = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { /* first run */ }

  const server = await launchServer({ 'config.json': CONFIGS.family() });
  const request = await playwrightRequest.newContext({ baseURL: server.baseURL });
  const ctx: Ctx = { server, request };
  let browser: Browser | null = null;
  let currentScenario: Scenario | null = null;
  const failures: string[] = [];

  try {
    await seedFamilyData(request);
    browser = await chromium.launch();

    for (const shot of shots) {
      if (shot.config) {
        await putConfig(request, shot.config());
        currentScenario = null;
      } else if (shot.scenario !== currentScenario) {
        await putConfig(request, CONFIGS[shot.scenario]());
        currentScenario = shot.scenario;
      }
      const context = await browser.newContext({
        baseURL: server.baseURL,
        viewport: shot.viewport,
        deviceScaleFactor: shot.dpr ?? 2,
        reducedMotion: 'reduce',
        colorScheme: 'dark',
        locale: 'en-US',
        timezoneId: LOCATION.timezone,
      });
      const page = await context.newPage();
      try {
        await installStubs(page);
        await shot.run(page, ctx);
        await prettifyOrigin(page, server.baseURL);
        const target = shot.clip ? page.locator(shot.clip).first() : page;
        const png = await target.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
        const size = await writeImage(shot.name, png, shot.maxWidth);
        manifest[shot.name] = { ...size, alt: shot.alt, viewport: `${shot.viewport.width}x${shot.viewport.height}` };
        console.log(`  ok  ${shot.name.padEnd(28)} ${size.width}x${size.height}`);
      } catch (err) {
        failures.push(shot.name);
        console.error(`  FAIL ${shot.name}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
        try {
          const png = await page.screenshot({ type: 'png' });
          writeFileSync(path.join(OUT_DIR, `${shot.name}.FAILED.png`), png);
        } catch { /* page gone */ }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await request.dispose();
    await server.stop();
  }

  const ordered: Record<string, ManifestEntry> = {};
  for (const shot of SHOTS) if (manifest[shot.name]) ordered[shot.name] = manifest[shot.name];
  writeFileSync(manifestPath, JSON.stringify(ordered, null, 2) + '\n');
  console.log(`\n${shots.length - failures.length}/${shots.length} shots written to ${path.relative(ROOT, OUT_DIR)}`);
  if (failures.length) {
    console.error(`Failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
