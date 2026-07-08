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

// --- The registry ----------------------------------------------------------

export const MODULE_FIXTURES: Record<ModuleType, ModuleFixture> = {
  // ---- Network-free ----
  text: { type: 'text', kind: 'network-free', config: { content: 'E2E TEXT MODULE' }, expect: containsText('E2E TEXT MODULE') },
  clock: { type: 'clock', kind: 'network-free', expect: rendersText },
  date: { type: 'date', kind: 'network-free', expect: rendersText },
  countdown: {
    type: 'countdown', kind: 'network-free',
    config: { events: [{ id: 'e1', name: 'E2E LAUNCH', date: '2099-12-31' }], view: 'all' },
    expect: containsText('E2E LAUNCH'),
  },
  'year-progress': { type: 'year-progress', kind: 'network-free', expect: rendersText },
  'multi-month': { type: 'multi-month', kind: 'network-free', expect: rendersText },
  shape: { type: 'shape', kind: 'network-free', expect: hasSize },
  icon: { type: 'icon', kind: 'network-free', expect: hasChild('i') },
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
    expect: hasChild('img'),
  },
  'sticky-note': { type: 'sticky-note', kind: 'network-free', config: { content: 'E2E STICKY' }, expect: containsText('E2E STICKY') },
  greeting: { type: 'greeting', kind: 'network-free', config: { name: 'E2E PERSON' }, expect: containsText('E2E PERSON') },
  'moon-phase': { type: 'moon-phase', kind: 'network-free', expect: rendersText },
  'sunrise-sunset': { type: 'sunrise-sunset', kind: 'network-free', expect: rendersText },
  'garbage-day': { type: 'garbage-day', kind: 'network-free', expect: rendersText },
  'display-control': { type: 'display-control', kind: 'network-free', expect: hasChild('button') },
  'word-of-day': { type: 'word-of-day', kind: 'network-free', expect: rendersText },
  affirmations: { type: 'affirmations', kind: 'network-free', expect: rendersText },
  // Non-interactive todo carries its items inline in config — no fetch.
  todo: {
    type: 'todo', kind: 'network-free',
    config: { title: 'E2E TODO', items: [{ id: 't1', text: 'E2E TASK', completed: false }] },
    expect: containsText('E2E TASK'),
  },

  // ---- Networked ----
  weather: { type: 'weather', kind: 'networked', stubKey: 'weather', expect: containsText('72°') },
  'air-quality': { type: 'air-quality', kind: 'networked', stubKey: 'air-quality', expect: async (mod) => { await expect(mod).toBeVisible(); await expect(mod).toContainText('2'); } },
  'rain-map': { type: 'rain-map', kind: 'networked', stubKey: 'rain-map', expect: hasSize },
  news: { type: 'news', kind: 'networked', stubKey: 'news', expect: containsText('Global markets rally on tech surge') },
  'stock-ticker': { type: 'stock-ticker', kind: 'networked', stubKey: 'stocks', expect: containsText('AAPL') },
  crypto: { type: 'crypto', kind: 'networked', stubKey: 'crypto', expect: containsText('Bitcoin') },
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
  'photo-slideshow': { type: 'photo-slideshow', kind: 'networked', stubKey: 'backgrounds', expect: hasChild('img') },
  'fullscreen-photo': { type: 'fullscreen-photo', kind: 'networked', stubKey: 'backgrounds', expect: hasChild('img') },

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
