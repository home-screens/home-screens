import type { ModuleType } from '@/types/config';

/**
 * Multi-view coverage data. Each high-view module lists every view it should
 * render. `module-views.spec.ts` loops over this to render each view without
 * throwing; `e2e/meta/coverage.spec.ts` imports the same array to ratchet it
 * against the `*View` unions in src/types/config.ts, so a view added to a
 * covered module's union without a row here turns the ratchet red.
 *
 * This lives in a plain module (not the spec) so the ratchet can import the exact
 * array instead of scraping it out of spec-file text, and so importing it does not
 * register the display render tests as a side effect.
 */
export interface ViewSpec {
  type: ModuleType;
  /** Config field carrying the view (calendar uses `viewMode`; everyone else `view`). */
  key: string;
  views: string[];
  kind: 'network-free' | 'networked' | 'local-data';
  stubKey?: string;
  seed?: 'chores' | 'meals';
  config?: Record<string, unknown>;
}

export const VIEW_MATRIX: ViewSpec[] = [
  { type: 'clock', key: 'view', kind: 'network-free', views: [
    'classic', 'digital', 'analog', 'minimal', 'flip', 'word', 'binary', 'vertical', 'split',
    'progress', 'fuzzy', 'world', 'dot-matrix', 'radial', 'arc', 'neon', 'bar', 'elapsed'] },
  { type: 'date', key: 'view', kind: 'network-free', views: ['full', 'minimal', 'stacked', 'editorial', 'banner'] },
  { type: 'countdown', key: 'view', kind: 'network-free',
    config: { events: [{ id: 'e1', name: 'E2E LAUNCH', date: '2099-12-31' }] },
    views: ['all', 'next'] },
  { type: 'multi-month', key: 'view', kind: 'network-free', views: ['vertical', 'horizontal'] },
  { type: 'affirmations', key: 'view', kind: 'network-free', views: ['elegant', 'card', 'minimal', 'typewriter'] },
  { type: 'sunrise-sunset', key: 'view', kind: 'network-free', views: ['default', 'arc', 'circle'] },
  { type: 'shape', key: 'view', kind: 'network-free', views: [
    'divider', 'double-line', 'wave', 'zigzag', 'dotted-row', 'rectangle', 'circle', 'triangle',
    'polygon', 'star', 'arrow', 'glow', 'gradient', 'grid', 'frame'] },
  { type: 'weather', key: 'view', kind: 'networked', stubKey: 'weather', views: [
    'current', 'hourly', 'daily', 'combined', 'compact', 'table', 'precipitation', 'alerts'] },
  { type: 'sports', key: 'view', kind: 'networked', stubKey: 'sports', views: ['scoreboard', 'cards', 'list', 'ticker'] },
  { type: 'standings', key: 'view', kind: 'networked', stubKey: 'standings', views: ['table', 'compact', 'conference'] },
  { type: 'news', key: 'view', kind: 'networked', stubKey: 'news', views: ['headline', 'list', 'ticker', 'compact'] },
  { type: 'stock-ticker', key: 'view', kind: 'networked', stubKey: 'stocks', views: ['cards', 'ticker', 'table', 'compact'] },
  { type: 'crypto', key: 'view', kind: 'networked', stubKey: 'crypto', views: ['cards', 'ticker', 'table', 'compact'] },
  { type: 'todoist', key: 'viewMode', kind: 'networked', stubKey: 'todoist', views: ['list', 'board', 'focus'] },
  { type: 'calendar', key: 'viewMode', kind: 'networked', stubKey: 'calendar', views: ['daily', 'agenda', 'week', 'multi-week', 'month'] },
  { type: 'fullscreen-calendar', key: 'view', kind: 'networked', stubKey: 'calendar', views: [
    'schedule', 'week-list', 'month-grid', 'day-timeline', 'agenda', 'family-grid', 'up-next', 'free-time'] },
  { type: 'chore-chart', key: 'view', kind: 'local-data', seed: 'chores', views: [
    'board', 'star-chart', 'today', 'progress', 'compact'] },
  { type: 'fullscreen-chore-chart', key: 'view', kind: 'local-data', seed: 'chores', views: ['chores', 'rewards-store'] },
  { type: 'meal-planner', key: 'view', kind: 'local-data', seed: 'meals', views: ['week', 'today', 'next-meal', 'compact', 'list'] },
  { type: 'fullscreen-meal-planner', key: 'view', kind: 'local-data', seed: 'meals', views: ['week', 'today', 'menu-board', 'next-meal'] },
  { type: 'fullscreen-weather', key: 'view', kind: 'networked', stubKey: 'weather', views: ['panorama', 'almanac', 'ambient', 'week', 'hourly'] },
];
