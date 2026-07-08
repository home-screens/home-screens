import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedChores, seedMeals, todayCalendarEvents } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import type { ModuleType } from '@/types/config';

/**
 * Multi-view coverage. Each high-view module renders in every one of its views
 * without throwing. View lists mirror the `*View` type unions in
 * src/types/config.ts — keep them in lockstep (the coverage ratchet doesn't
 * police views, so a new view added there should gain a row here).
 *
 * The assertion is deliberately shallow: the module wrapper mounts and no
 * uncaught exception fires (a `pageerror` is how a React render crash surfaces).
 * Pinning per-view markers across ~95 view combos would be brittle; the render
 * matrix already pins happy-path content for the default view of each module.
 */
interface ViewSpec {
  type: ModuleType;
  /** Config field carrying the view (calendar uses `viewMode`; everyone else `view`). */
  key: string;
  views: string[];
  kind: 'network-free' | 'networked' | 'local-data';
  stubKey?: string;
  seed?: 'chores' | 'meals';
  config?: Record<string, unknown>;
}

const VIEW_MATRIX: ViewSpec[] = [
  { type: 'clock', key: 'view', kind: 'network-free', views: [
    'classic', 'digital', 'analog', 'minimal', 'flip', 'word', 'binary', 'vertical', 'split',
    'progress', 'fuzzy', 'world', 'dot-matrix', 'radial', 'arc', 'neon', 'bar', 'elapsed'] },
  { type: 'date', key: 'view', kind: 'network-free', views: ['full', 'minimal', 'stacked', 'editorial', 'banner'] },
  { type: 'countdown', key: 'view', kind: 'network-free',
    config: { events: [{ id: 'e1', name: 'E2E LAUNCH', date: '2099-12-31' }] },
    views: ['all', 'next'] },
  { type: 'multi-month', key: 'view', kind: 'network-free', views: ['vertical', 'horizontal'] },
  { type: 'affirmations', key: 'view', kind: 'network-free', views: ['elegant', 'card', 'minimal', 'typewriter'] },
  { type: 'sunrise-sunset', key: 'view', kind: 'network-free', views: ['default', 'arc'] },
  { type: 'shape', key: 'view', kind: 'network-free', views: [
    'divider', 'double-line', 'wave', 'zigzag', 'dotted-row', 'rectangle', 'circle', 'triangle',
    'polygon', 'star', 'arrow', 'glow', 'gradient', 'grid', 'frame'] },
  { type: 'weather', key: 'view', kind: 'networked', stubKey: 'weather', views: [
    'current', 'hourly', 'daily', 'combined', 'compact', 'table', 'precipitation', 'alerts'] },
  { type: 'sports', key: 'view', kind: 'networked', stubKey: 'sports', views: ['scoreboard', 'cards', 'list', 'ticker'] },
  { type: 'standings', key: 'view', kind: 'networked', stubKey: 'standings', views: ['table', 'compact', 'conference'] },
  { type: 'calendar', key: 'viewMode', kind: 'networked', stubKey: 'calendar', views: ['daily', 'agenda', 'week', 'month'] },
  { type: 'fullscreen-calendar', key: 'view', kind: 'networked', stubKey: 'calendar', views: [
    'schedule', 'week-list', 'month-grid', 'day-timeline', 'agenda'] },
  { type: 'chore-chart', key: 'view', kind: 'local-data', seed: 'chores', views: [
    'board', 'star-chart', 'today', 'progress', 'compact'] },
  { type: 'fullscreen-chore-chart', key: 'view', kind: 'local-data', seed: 'chores', views: ['chores', 'rewards-store'] },
  { type: 'meal-planner', key: 'view', kind: 'local-data', seed: 'meals', views: ['week', 'today', 'next-meal', 'compact', 'list'] },
  { type: 'fullscreen-meal-planner', key: 'view', kind: 'local-data', seed: 'meals', views: ['week', 'today', 'menu-board', 'next-meal'] },
];

async function renderView(page: Page, request: APIRequestContext, spec: ViewSpec, view: string): Promise<void> {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const overrides = spec.stubKey === 'calendar' ? { calendar: todayCalendarEvents() } : undefined;
  await stubModuleData(page, { overrides }); // also blocks external hosts

  if (spec.seed === 'chores') await seedChores(request);
  if (spec.seed === 'meals') await seedMeals(request);

  const instance = buildModuleInstance(spec.type, { ...(spec.config ?? {}), [spec.key]: view });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [instance])],
    settings: matrixSettings(),
  }));
  await page.goto('/display');

  await expect(page.locator(`[data-module-type="${spec.type}"]`).first()).toBeVisible();
  expect(pageErrors, `${spec.type}/${view} threw an uncaught error`).toEqual([]);
}

for (const spec of VIEW_MATRIX) {
  test.describe(`${spec.type} views`, () => {
    for (const view of spec.views) {
      test(`${spec.type} · ${view}`, async ({ page, request }) => {
        await renderView(page, request, spec, view);
      });
    }
  });
}
