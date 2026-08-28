import { expect, type Locator, type Page } from '@playwright/test';
import { getModuleDefinition, getAllModuleDefinitions } from '@/lib/module-registry';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, ModuleType } from '@/types/config';

/**
 * A per-module E2E fixture. Mirrors the app's own module-registry pattern: one
 * row per module type, seeded from the registry's `defaultConfig` so defaults
 * never drift, overriding only the fields needed to produce a deterministic,
 * assertable render.
 *
 * `kind` decides how a spec supplies data:
 *   - network-free : renders from config / clock / local calc, no fetch.
 *   - networked    : needs `stubModuleData` with `stubKey`'s fixture.
 *   - local-data   : seed the sandbox via a real API (`seed`) before rendering.
 */
export type ModuleKind = 'network-free' | 'networked' | 'local-data';

export interface ModuleFixture {
  type: ModuleType;
  kind: ModuleKind;
  /** Stub key (see e2e/helpers/stubs.ts STUBS) — networked modules only. */
  stubKey?: string;
  /** Which local API to seed before rendering — local-data modules only. */
  seed?: 'chores' | 'meals';
  /** Config overrides merged over the registry defaultConfig. */
  config?: Record<string, unknown>;
  /** Assertion proving the module rendered its expected content. */
  expect: (mod: Locator, page: Page) => Promise<void>;
}

/** Prior Lake, MN — a real location so weather / moon / sunrise / rain-map resolve. */
export const MATRIX_LOCATION = { latitude: 44.7133, longitude: -93.4227 };

/**
 * Global settings every matrix render uses: a real location (weather, moon,
 * sunrise, rain-map, affirmations) and a calendar id (so buildCalendarUrl
 * produces a URL the stub can intercept). Rotation is frozen by baseConfig.
 */
export function matrixSettings(): Record<string, unknown> {
  return {
    ...MATRIX_LOCATION,
    weather: { provider: 'weatherapi', latitude: MATRIX_LOCATION.latitude, longitude: MATRIX_LOCATION.longitude, units: 'imperial' },
    calendar: { googleCalendarId: 'primary', googleCalendarIds: ['primary'], icalSources: [], maxEvents: 50, daysAhead: 7 },
  };
}

/** Build a placeable ModuleInstance from the registry defaults + fixture overrides. */
export function buildModuleInstance(type: ModuleType, config: Record<string, unknown> = {}): ModuleInstance {
  const def = getModuleDefinition(type);
  if (!def) throw new Error(`No registry definition for module type "${type}"`);
  return {
    id: `${type}-1`,
    type,
    position: { x: 0, y: 0 },
    size: def.defaultSize,
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE, ...(def.defaultStyle ?? {}) },
    config: { ...def.defaultConfig, ...config },
  } as ModuleInstance;
}

// --- Assertion helpers -----------------------------------------------------

/** The module wrapper is visible and renders some non-whitespace text. */
const rendersText = async (mod: Locator): Promise<void> => {
  await expect(mod).toBeVisible();
  await expect.poll(async () => (await mod.innerText()).trim().length).toBeGreaterThan(0);
};

/** The module contains the given substring. */
const containsText = (needle: string) => async (mod: Locator): Promise<void> => {
  await expect(mod).toContainText(needle);
};

/**
 * Module textContent matches the regex (polls so async content can settle).
 * textContent, not innerText, so CSS text-transform can't defeat the match.
 */
const matchesText = (re: RegExp) => async (mod: Locator): Promise<void> => {
  await expect(mod).toBeVisible();
  await expect.poll(async () => re.test((await mod.evaluate((el) => el.textContent)) || '')).toBe(true);
};

/** The module renders a matching descendant element (for text-less modules). */
const hasChild = (selector: string) => async (mod: Locator): Promise<void> => {
  await expect(mod.locator(selector).first()).toBeVisible();
};

/** The module wrapper occupies non-zero space (text-less shapes/dividers). */
const hasSize = async (mod: Locator): Promise<void> => {
  await expect(mod).toBeVisible();
  const box = await mod.boundingBox();
  expect(box && box.width > 0 && box.height > 0).toBeTruthy();
};

/**
 * The module rendered a descendant `<img>` whose src matches `pattern`. Used
 * for image modules where the meaningful proof is that the src resolved to the
 * stubbed source (not merely that some `<img>` exists). `toBeAttached` rather
 * than `toBeVisible` because the stub aborts the external/remote load, so the
 * element carries the correct src attribute but never paints a bitmap.
 */
const hasImgSrc = (pattern: RegExp) => async (mod: Locator): Promise<void> => {
  await expect(mod).toBeVisible();
  await expect(mod.locator('img').first()).toHaveAttribute('src', pattern);
};

/** The stubbed backgrounds.json entry — a 1x1 transparent GIF as a data: URL. */
const STUB_BACKGROUND_SRC = /^data:image\/gif;base64,R0lGOD/;

// --- The registry ----------------------------------------------------------

export const MODULE_FIXTURES: Record<ModuleType, ModuleFixture> = {
  // ---- Network-free ----
  text: { type: 'text', kind: 'network-free', config: { content: 'E2E TEXT MODULE' }, expect: containsText('E2E TEXT MODULE') },
  clock: { type: 'clock', kind: 'network-free', expect: matchesText(/\d{1,2}:\d{2}/) },
  // defaultConfig: view 'full', dateFormat 'MMMM d', showDayName true — assert
  // today's actual day name and month (content-shaped, not just "some text").
  date: {
    type: 'date', kind: 'network-free',
    expect: async (mod) => {
      const now = new Date();
      await containsText(now.toLocaleString('en-US', { weekday: 'long' }))(mod);
      await containsText(now.toLocaleString('en-US', { month: 'long' }))(mod);
    },
  },
  countdown: {
    type: 'countdown', kind: 'network-free',
    config: { events: [{ id: 'e1', name: 'E2E LAUNCH', date: '2099-12-31' }], view: 'all' },
    expect: containsText('E2E LAUNCH'),
  },
  // showYear + showPercentage default on — assert the live year and a percent.
  'year-progress': {
    type: 'year-progress', kind: 'network-free',
    expect: async (mod) => {
      await containsText(String(new Date().getFullYear()))(mod);
      await matchesText(/%/)(mod);
    },
  },
  'multi-month': {
    type: 'multi-month', kind: 'network-free',
    expect: async (mod) => { await containsText(new Date().toLocaleString('en-US', { month: 'long' }))(mod); },
  },
  shape: { type: 'shape', kind: 'network-free', expect: hasSize },
  // defaultConfig is iconName 'star' + style 'solid' — assert the exact FA
  // classes so a wrong icon can't pass as "some <i> rendered".
  icon: { type: 'icon', kind: 'network-free', expect: hasChild('i.fa-solid.fa-star') },
  'qr-code': {
    type: 'qr-code', kind: 'network-free',
    config: { mode: 'custom', data: 'https://example.com/e2e', label: 'E2E QR' },
    expect: async (mod) => { await hasChild('svg')(mod); await containsText('E2E QR')(mod); },
  },
  iframe: {
    type: 'iframe', kind: 'network-free',
    // Same-origin path: renders an <iframe> without loading any external host.
    config: { url: '/login', title: 'E2E EMBED' },
    expect: async (mod) => { await expect(mod.locator('iframe')).toHaveAttribute('src', /\/login/); },
  },
  image: {
    type: 'image', kind: 'network-free',
    // data: URL bypasses useAuthImage's /api fetch and renders verbatim.
    config: { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', alt: 'e2e' },
    // Assert the src actually resolved to the configured source (matching
    // photo-slideshow's rigor), not merely that some <img> exists.
    expect: hasImgSrc(/^data:image\/gif;base64,R0lGOD/),
  },
  'sticky-note': { type: 'sticky-note', kind: 'network-free', config: { content: 'E2E STICKY' }, expect: containsText('E2E STICKY') },
  greeting: { type: 'greeting', kind: 'network-free', config: { name: 'E2E PERSON' }, expect: containsText('E2E PERSON') },
  'moon-phase': {
    type: 'moon-phase', kind: 'network-free',
    expect: matchesText(/New Moon|Waxing|Waning|Full Moon|First Quarter|Last Quarter/),
  },
  'sunrise-sunset': {
    type: 'sunrise-sunset', kind: 'network-free',
    expect: async (mod) => { await containsText('Sunrise')(mod); await matchesText(/\d{1,2}:\d{2}/)(mod); },
  },
  // defaultConfig has trashDay: 1 (weekly) — the Trash stream label renders.
  'garbage-day': { type: 'garbage-day', kind: 'network-free', expect: containsText('Trash') },
  // Default panel layout — assert the actual command buttons, not "a button".
  'display-control': {
    type: 'display-control', kind: 'network-free',
    expect: async (mod) => {
      await expect(mod.locator('button[aria-label="Previous screen"]')).toBeVisible();
      await expect(mod.locator('button[aria-label="Next screen"]')).toBeVisible();
    },
  },
  // Word + italic part-of-speech line (the module's two-part layout).
  'word-of-day': { type: 'word-of-day', kind: 'network-free', expect: matchesText(/noun|verb|adjective|adverb/) },
  affirmations: { type: 'affirmations', kind: 'network-free', expect: rendersText },
  // Non-interactive todo carries its items inline in config — no fetch.
  todo: {
    type: 'todo', kind: 'network-free',
    config: { title: 'E2E TODO', items: [{ id: 't1', text: 'E2E TASK', completed: false }] },
    expect: containsText('E2E TASK'),
  },

  // ---- Networked ----
  weather: { type: 'weather', kind: 'networked', stubKey: 'weather', expect: containsText('72°') },
  // aqi 2 in air-quality.json maps to the 'fair' label ("Fair"), so assert the
  // derived category rather than the bare index digit.
  'air-quality': { type: 'air-quality', kind: 'networked', stubKey: 'air-quality', expect: containsText('Fair') },
  // Radar tiles go through the module's rate-bounded tile store: URLs from
  // the fetched RainViewer host (rain-map.json) are fetched to blobs, so a
  // blob-src radar tile proves the full payload → fetch → render round trip —
  // not merely that the wrapper has size.
  'rain-map': {
    type: 'rain-map', kind: 'networked', stubKey: 'rain-map',
    expect: async (mod) => {
      await expect(mod).toBeVisible();
      await expect(mod.locator('img[src^="blob:"]').first()).toBeAttached();
    },
  },
  news: { type: 'news', kind: 'networked', stubKey: 'news', expect: containsText('Global markets rally on tech surge') },
  'stock-ticker': {
    type: 'stock-ticker', kind: 'networked', stubKey: 'stocks',
    // Default cards view renders one sparkline per stock (showSparkline defaults on).
    expect: async (mod) => {
      await containsText('AAPL')(mod);
      await expect(mod.locator('.financial-sparkline')).toHaveCount(2);
    },
  },
  crypto: {
    type: 'crypto', kind: 'networked', stubKey: 'crypto',
    // Default cards view renders one sparkline per coin (showSparkline defaults on).
    expect: async (mod) => {
      await containsText('Bitcoin')(mod);
      await expect(mod.locator('.financial-sparkline')).toHaveCount(2);
    },
  },
  sports: { type: 'sports', kind: 'networked', stubKey: 'sports', expect: containsText('BUF') },
  standings: { type: 'standings', kind: 'networked', stubKey: 'standings', expect: containsText('Bills') },
  traffic: {
    type: 'traffic', kind: 'networked', stubKey: 'traffic',
    // Module gates on config.routes.length; trafficUrl builds from these too.
    config: { routes: [{ label: 'Home to Work', origin: 'A', destination: 'B' }] },
    expect: containsText('Home to Work'),
  },
  todoist: { type: 'todoist', kind: 'networked', stubKey: 'todoist', expect: containsText('Buy oat milk') },
  history: { type: 'history', kind: 'networked', stubKey: 'history', expect: containsText('Apollo 11 lands on the Moon.') },
  quote: { type: 'quote', kind: 'networked', stubKey: 'quote', expect: containsText('The only way to do great work') },
  'dad-joke': { type: 'dad-joke', kind: 'networked', stubKey: 'dad-joke', expect: containsText('skeletons') },
  calendar: { type: 'calendar', kind: 'networked', stubKey: 'calendar', expect: containsText('Dentist Appointment') },
  'fullscreen-calendar': {
    type: 'fullscreen-calendar', kind: 'networked', stubKey: 'calendar',
    // agenda view keeps the far-future event via the upcoming filter (range
    // views would need an event near "today").
    config: { view: 'agenda' },
    expect: containsText('Dentist Appointment'),
  },
  // Reuses the shared `weather` stub, so the 72° in weather.json is the hero
  // temperature here too. Panorama is the default view and exercises the most
  // surface (hero, ribbon, range bars, stat rail) in one render.
  'fullscreen-weather': {
    type: 'fullscreen-weather', kind: 'networked', stubKey: 'weather',
    expect: containsText('72°'),
  },
  'photo-slideshow': { type: 'photo-slideshow', kind: 'networked', stubKey: 'backgrounds', expect: hasImgSrc(STUB_BACKGROUND_SRC) },
  'fullscreen-photo': { type: 'fullscreen-photo', kind: 'networked', stubKey: 'backgrounds', expect: hasImgSrc(STUB_BACKGROUND_SRC) },
  // The stub aborts the media load itself, so assert the <video> resolved its
  // src from the typed list (mirroring hasImgSrc's toBeAttached rationale).
  video: {
    type: 'video', kind: 'networked', stubKey: 'backgrounds-videos',
    config: { source: 'file', file: 'e2e-clip.mp4' },
    expect: async (mod) => {
      await expect(mod).toBeVisible();
      await expect(mod.locator('video').first()).toHaveAttribute('src', /e2e-clip\.mp4/);
    },
  },

  // ---- Local-data ----
  'chore-chart': { type: 'chore-chart', kind: 'local-data', seed: 'chores', config: { view: 'today' }, expect: containsText('Feed the dog') },
  'fullscreen-chore-chart': { type: 'fullscreen-chore-chart', kind: 'local-data', seed: 'chores', expect: containsText('Feed the dog') },
  'meal-planner': { type: 'meal-planner', kind: 'local-data', seed: 'meals', expect: containsText('Spaghetti Night') },
  'fullscreen-meal-planner': { type: 'fullscreen-meal-planner', kind: 'local-data', seed: 'meals', expect: containsText('Spaghetti Night') },
};

/** Every built-in module type, for the coverage ratchet + matrix loops. */
export function allBuiltinTypes(): ModuleType[] {
  return getAllModuleDefinitions()
    .map((d) => d.type)
    .filter((t) => !t.startsWith('plugin:'));
}

export function fixturesByKind(kind: ModuleKind): ModuleFixture[] {
  return Object.values(MODULE_FIXTURES).filter((f) => f.kind === kind);
}
