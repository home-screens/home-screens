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
    expect: showsCopy('No countdowns set'),
  },
  {
    type: 'todo', name: 'no-items', kind: 'network-free',
    config: { title: 'E2E TODO', items: [] },
    expect: showsCopy('No tasks yet'),
  },
  {
    type: 'sticky-note', name: 'empty-content', kind: 'network-free',
    config: { content: '' },
    expect: showsCopy('No note content'),
  },
  {
    type: 'icon', name: 'no-icon', kind: 'network-free',
    config: { iconName: '' },
    expect: showsCopy('No icon selected'),
  },
  {
    // The config-level `routes: []` gate — distinct from the already-tested
    // empty-response path (the module never fetches when no routes exist).
    type: 'traffic', name: 'no-routes', kind: 'network-free',
    config: { routes: [] },
    expect: showsCopy('No routes configured'),
  },
  {
    // No file chosen (file source, empty path) — the module never fetches.
    type: 'video', name: 'not-configured', kind: 'network-free',
    config: { source: 'file', file: '' },
    expect: showsCopy('Choose a video to play'),
  },
  {
    type: 'moon-phase', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not configured'),
  },
  {
    type: 'sunrise-sunset', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not configured'),
  },
  {
    // Unseeded sandbox → no members → the "get started" empty state.
    type: 'chore-chart', name: 'no-members', kind: 'local-data',
    expect: showsCopy('Add family members to get started'),
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
    type: 'fullscreen-chore-chart', name: 'no-chores-today', kind: 'local-data',
    config: { view: 'chores' },
    expect: showsCopy('No chores today'),
  },
];
