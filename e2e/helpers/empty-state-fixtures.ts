import { expect, type Locator, type Page } from '@playwright/test';
import type { ModuleType } from '@/types/config';

/**
 * Empty/error-state coverage data. Each row drives one module into its empty
 * state (no data, no config, missing location) and asserts the expected copy
 * renders. `module-empty-states.spec.ts` loops over this; the meta ratchet
 * (`e2e/meta/coverage.spec.ts`) requires every module whose component uses
 * ModuleEmptyState / LocationRequired / WeatherEmptyState to have a row here
 * or an explicit allowlist entry — so a module can't gain an empty state that
 * nobody tests.
 */
export interface EmptyStateFixture {
  type: ModuleType;
  /** Short slug for the test title, e.g. 'no-events', 'missing-location'. */
  name: string;
  kind: 'network-free' | 'networked' | 'local-data';
  /** Stub key (see helpers/stubs.ts STUBS) — networked rows only. */
  stubKey?: string;
  /** Replace the stubKey's response body for this variant. */
  stubBody?: unknown;
  /** Render WITHOUT matrixSettings() location (drives LocationRequired). */
  noLocation?: boolean;
  /** Config overrides merged over the registry defaultConfig. */
  config?: Record<string, unknown>;
  /** Assertion proving the empty state (and its kid-friendly copy) rendered. */
  expect: (mod: Locator, page: Page) => Promise<void>;
}

/** The module shows the given empty-state copy (verified against en-US/modules.json). */
const showsCopy = (copy: string) => async (mod: Locator): Promise<void> => {
  await expect(mod).toContainText(copy);
};

export const EMPTY_STATE_FIXTURES: EmptyStateFixture[] = [
  {
    type: 'countdown', name: 'no-events', kind: 'network-free',
    config: { events: [], view: 'all' },
    expect: showsCopy('Add a date in the editor and the countdown starts here'),
  },
  {
    // The elapsed view with no start time set; the other clock views always
    // have something to draw.
    type: 'clock', name: 'no-start-time', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '' },
    expect: showsCopy('Pick a start time in the editor and the counter starts here'),
  },
  {
    type: 'qr-code', name: 'no-data', kind: 'network-free',
    config: { mode: 'custom', data: '' },
    expect: showsCopy('Add a link or your Wi-Fi in the editor and it shows here'),
  },
  {
    type: 'iframe', name: 'no-url', kind: 'network-free',
    config: { url: '' },
    expect: showsCopy('Add a web address in the editor and the page shows here'),
  },
  {
    type: 'image', name: 'no-source', kind: 'network-free',
    config: { src: '' },
    expect: showsCopy('Pick a picture in the editor and it shows here'),
  },
  {
    // Every category off and no custom entries: nothing to rotate.
    type: 'affirmations', name: 'no-entries', kind: 'network-free',
    config: { categories: [], customEntries: [] },
    expect: showsCopy('Pick a category in the editor and affirmations show here'),
  },
  {
    // The config-level gate: with no feed there is nothing to fetch.
    type: 'news', name: 'no-feeds', kind: 'network-free',
    config: { feeds: [] },
    expect: showsCopy('Add a news feed in the editor and headlines show here'),
  },
  {
    type: 'todo', name: 'no-items', kind: 'network-free',
    config: { title: 'E2E TODO', items: [] },
    expect: showsCopy('Add tasks in the editor and they show up here'),
  },
  {
    type: 'sticky-note', name: 'empty-content', kind: 'network-free',
    config: { content: '' },
    expect: showsCopy('Write a note in the editor and it shows here'),
  },
  {
    type: 'icon', name: 'no-icon', kind: 'network-free',
    config: { iconName: '' },
    expect: showsCopy('Pick an icon in the editor and it shows here'),
  },
  {
    // The config-level `routes: []` gate — distinct from the already-tested
    // empty-response path (the module never fetches when no routes exist).
    type: 'traffic', name: 'no-routes', kind: 'network-free',
    config: { routes: [] },
    expect: showsCopy('Add a route in the editor and drive times show here'),
  },
  {
    // No file chosen (file source, empty path) — the module never fetches.
    type: 'video', name: 'not-configured', kind: 'network-free',
    config: { source: 'file', file: '' },
    expect: showsCopy('Pick a video in the editor and it plays here'),
  },
  {
    type: 'moon-phase', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not configured'),
  },
  {
    // The route needs the household location; without one the module says so
    // instead of surfacing the route's error string.
    type: 'air-quality', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not configured'),
  },
  {
    // No module coordinates and no household location: nothing to centre on.
    type: 'rain-map', name: 'missing-location', kind: 'network-free', noLocation: true,
    config: { latitude: 0, longitude: 0 },
    expect: showsCopy('Location not configured'),
  },
  {
    type: 'sunrise-sunset', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not configured'),
  },
  {
    // Without coordinates the shared weather fetch never runs, so the module
    // has to say so itself rather than sit on its loading copy.
    type: 'fullscreen-weather', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not configured'),
  },
  {
    // Unseeded sandbox → no members → the setup empty state, which points at
    // the phone (/remote), where family data is entered.
    type: 'chore-chart', name: 'no-members', kind: 'local-data',
    expect: async (mod) => {
      await expect(mod).toContainText('No family members yet');
      await expect(mod).toContainText('/remote and tap Chores');
    },
  },
  {
    // Unseeded sandbox; the week view renders an empty grid, so the today view
    // is the deterministic empty-state surface.
    type: 'meal-planner', name: 'no-meals', kind: 'local-data',
    config: { view: 'today' },
    expect: showsCopy('No meals planned yet'),
  },
  {
    // menu-board shows the aggregate empty copy; the today view renders
    // per-slot "Not planned" placeholders instead.
    type: 'fullscreen-meal-planner', name: 'no-meals-today', kind: 'local-data',
    config: { view: 'menu-board' },
    expect: showsCopy('No meals planned for today'),
  },
  {
    // Unseeded sandbox → no members → the setup state, not "No chores today"
    // (which on a fresh install would read as a day off).
    type: 'fullscreen-chore-chart', name: 'no-members', kind: 'local-data',
    config: { view: 'chores' },
    expect: async (mod) => {
      await expect(mod).toContainText('No family members yet');
      await expect(mod).toContainText('/remote and tap Chores');
    },
  },
];
