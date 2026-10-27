import { expect, type Locator, type Page } from '@playwright/test';
import type { ModuleType } from '@/types/config';
import { isMaterialView } from '@/lib/notes-rules';
import { E2E_NOTE_MEMBERS, E2E_NOTE_TEXTS, E2E_TIMETABLE_SEED_MEMBER_IDS, E2E_TODO_LIST_ID } from './api';

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
  seed?: 'chores' | 'meals' | 'todos' | 'timetables' | 'notes';
  config?: Record<string, unknown>;
  /**
   * The box a view is drawn in, for a view designed for another box than the
   * registry's `defaultSize` (a one-line strip is not meant for a 440 x 520
   * card). Omitted views use the default.
   */
  sizes?: Partial<Record<string, { w: number; h: number }>>;
  /**
   * What each view has to draw from the row's seed, run once the module has
   * mounted. Optional: most rows hold the shallow bar described in
   * module-views.spec.ts (mounts, no uncaught error). A row whose views all
   * read one seeded store can say more, and then a view that mounts but
   * draws nothing fails here instead of passing.
   */
  expect?: (mod: Locator, view: string, page: Page) => Promise<void>;
}

/**
 * The box each notes view is designed for (plan 220 and the materials
 * mockup). Board, Bubbles, Timeline and By person are the registry's
 * 440 x 520 and are left out; the materials are named even where that is
 * their size, so the list reads as the mockup does. Shared with the notes
 * config-variant rows and the material style probes.
 */
export const NOTES_VIEW_SIZES: Partial<Record<string, { w: number; h: number }>> = {
  cards: { w: 640, h: 520 },
  sticky: { w: 640, h: 520 },
  spotlight: { w: 640, h: 320 },
  compact: { w: 440, h: 320 },
  count: { w: 300, h: 220 },
  strip: { w: 1000, h: 120 },
  ticker: { w: 1000, h: 120 },
  focus: { w: 440, h: 420 },
  'pinned-new': { w: 1000, h: 400 },
  latest: { w: 640, h: 320 },
  chalkboard: { w: 440, h: 520 },
  whiteboard: { w: 440, h: 520 },
  notebook: { w: 440, h: 520 },
  receipt: { w: 440, h: 520 },
  letterboard: { w: 440, h: 520 },
  neon: { w: 640, h: 420 },
  fridge: { w: 640, h: 520 },
  headline: { w: 640, h: 520 },
};

/**
 * The notes board's views against the default notes seed (`notesSeed()` in
 * ./api): a pinned note by Sam, an important one by Riley and a newer one by
 * nobody, three live notes in all.
 */
async function expectNotesView(mod: Locator, view: string): Promise<void> {
  const notes = mod.getByTestId('notes-note');
  const all = Object.values(E2E_NOTE_TEXTS);
  // The view asked for is the one drawn: an unknown view falls back to Board.
  await expect(mod.getByTestId('notes-module')).toHaveAttribute('data-view', view);
  // Every material draws who wrote a note in its own way (a chalk initial, a
  // magnet, a receipt column, a neon sign), and the material hide-author
  // variant rows prove each one goes. Headline credits its writers in the
  // byline's words ("By Sam") and carries no author test id, so it is read
  // by its text.
  if (view === 'headline') await expect(mod).toContainText(`By ${E2E_NOTE_MEMBERS.sam.name}`);
  else if (isMaterialView(view)) await expect(mod.getByTestId('notes-author').first()).toBeAttached();
  switch (view) {
    case 'count':
      // A tile with the number and nothing else to read.
      await expect(mod.getByTestId('notes-count')).toHaveText('3');
      return;
    case 'spotlight':
    case 'strip':
    case 'letterboard':
    case 'neon':
      // One note at a time with its place in the walk; which one depends on
      // how long the step has run, so any of the three will do. Letterboard
      // and Neon are materials that step like Spotlight.
      await expect(mod.getByTestId('notes-step')).toContainText(/\b[1-3] of 3\b/);
      await expect(notes).toHaveCount(1);
      await expect(notes).toContainText(new RegExp(all.join('|')));
      return;
    case 'latest':
      // The newest note alone: the one by nobody, posted an hour ago.
      await expect(notes).toHaveCount(1);
      await expect(notes).toContainText(E2E_NOTE_TEXTS.plain);
      return;
    case 'headline':
      // The family newspaper: the default masthead over every note.
      await expect(mod).toContainText('The Family Times');
      await expect(notes).toHaveCount(3);
      for (const text of all) await expect(mod).toContainText(text);
      await expect(mod.getByTestId('notes-more')).toHaveCount(0);
      return;
    case 'receipt':
      // Printed in capitals by CSS, so the check reads the rendered text: the
      // roll opens with the heading ("Notes") as NOTES and ends in a total.
      await expect(notes).toHaveCount(3);
      for (const text of all) await expect(mod).toContainText(text);
      await expect(mod).toHaveText(/^\s*NOTES\s/, { useInnerText: true });
      await expect(mod).toContainText('TOTAL', { useInnerText: true });
      await expect(mod.getByTestId('notes-more')).toHaveCount(0);
      return;
    case 'by-person':
      // One row per roster member in roster order, then "Someone" for the
      // note nobody signed.
      await expect(mod.getByTestId('notes-person')).toHaveCount(3);
      await expect(mod.getByTestId('notes-person').nth(0)).toContainText(E2E_NOTE_MEMBERS.sam.name);
      await expect(mod.getByTestId('notes-person').nth(0)).toContainText(E2E_NOTE_TEXTS.pinned);
      await expect(mod.getByTestId('notes-person').nth(1)).toContainText(E2E_NOTE_MEMBERS.riley.name);
      await expect(mod.getByTestId('notes-person').nth(2)).toContainText('Someone');
      return;
    case 'ticker':
      // Every live note in one crawl, drawn twice for the seamless loop.
      await expect(notes).toHaveCount(6);
      for (const text of all) await expect(mod).toContainText(text);
      return;
    case 'timeline':
      // Strictly by time under day headings: the pinned note does not jump
      // the queue, so the newest (nobody's) comes first.
      await expect(mod.getByTestId('notes-day').first()).toBeVisible();
      await expect(notes).toHaveCount(3);
      await expect(notes.first()).toContainText(E2E_NOTE_TEXTS.plain);
      return;
    default:
      // board, cards, sticky, bubbles, compact, focus, pinned-new and the
      // chalkboard, whiteboard, fridge and notebook materials: three short
      // notes are under the default cap of five and fit every one of these
      // boxes, so all three are drawn and nothing is folded away.
      await expect(notes).toHaveCount(3);
      for (const text of all) await expect(mod).toContainText(text);
      await expect(mod.getByTestId('notes-more')).toHaveCount(0);
  }
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
  { type: 'todo', key: 'view', kind: 'local-data', seed: 'todos', config: { listId: E2E_TODO_LIST_ID },
    views: ['list', 'focus', 'progress', 'board', 'compact'] },
  { type: 'sunrise-sunset', key: 'view', kind: 'network-free', views: ['default', 'arc', 'circle'] },
  { type: 'shape', key: 'view', kind: 'network-free', views: [
    'divider', 'double-line', 'wave', 'zigzag', 'dotted-row', 'rectangle', 'circle', 'triangle',
    'polygon', 'star', 'arrow', 'glow', 'gradient', 'grid', 'frame'] },
  { type: 'weather', key: 'view', kind: 'networked', stubKey: 'weather', views: [
    'current', 'hourly', 'daily', 'combined', 'compact', 'table', 'precipitation', 'alerts',
    'ribbon', 'week', 'timeline', 'stats', 'sun', 'narrative'] },
  // The team view reads the sports-team stub (registered for every row); the
  // favorite makes the other four views draw their marker too.
  { type: 'sports', key: 'view', kind: 'networked', stubKey: 'sports', views: ['scoreboard', 'cards', 'list', 'ticker', 'team'],
    config: { favoriteTeams: ['nfl:MIN'] } },
  { type: 'standings', key: 'view', kind: 'networked', stubKey: 'standings', views: ['table', 'compact', 'conference'] },
  { type: 'news', key: 'view', kind: 'networked', stubKey: 'news', views: ['headline', 'list', 'ticker', 'compact', 'cards'] },
  { type: 'fullscreen-news', key: 'view', kind: 'networked', stubKey: 'news', views: ['story', 'front-page'] },
  { type: 'stock-ticker', key: 'view', kind: 'networked', stubKey: 'stocks', views: ['cards', 'ticker', 'table', 'compact', 'single'] },
  { type: 'crypto', key: 'view', kind: 'networked', stubKey: 'crypto', views: ['cards', 'ticker', 'table', 'compact'] },
  { type: 'todoist', key: 'viewMode', kind: 'networked', stubKey: 'todoist', views: ['list', 'board', 'focus'] },
  { type: 'calendar', key: 'viewMode', kind: 'networked', stubKey: 'calendar', views: ['daily', 'agenda', 'week', 'multi-week', 'month', 'rolling'] },
  { type: 'fullscreen-calendar', key: 'view', kind: 'networked', stubKey: 'calendar', views: [
    'schedule', 'week-list', 'month-grid', 'day-timeline', 'agenda', 'family-grid', 'up-next', 'free-time', 'rolling'] },
  { type: 'chore-chart', key: 'view', kind: 'local-data', seed: 'chores', views: [
    'board', 'star-chart', 'today', 'progress', 'compact', 'reward-history', 'rewards-store'] },
  { type: 'fullscreen-chore-chart', key: 'view', kind: 'local-data', seed: 'chores', views: [
    'chores', 'rewards-store', 'reward-history', 'reward-totals', 'reward-spotlight'] },
  { type: 'meal-planner', key: 'view', kind: 'local-data', seed: 'meals', views: ['week', 'today', 'next-meal', 'compact', 'list'] },
  { type: 'fullscreen-meal-planner', key: 'view', kind: 'local-data', seed: 'meals', views: ['week', 'today', 'menu-board', 'next-meal'] },
  { type: 'fullscreen-weather', key: 'view', kind: 'networked', stubKey: 'weather', views: ['panorama', 'strip', 'almanac', 'ambient', 'week', 'hourly', 'forecast', 'conditions'] },
  { type: 'timetable', key: 'view', kind: 'local-data', seed: 'timetables', config: { memberIds: E2E_TIMETABLE_SEED_MEMBER_IDS },
    views: ['week', 'day'] },
  // Each view at the size it was designed for (NOTES_VIEW_SIZES).
  { type: 'notes', key: 'view', kind: 'local-data', seed: 'notes', views: [
    'board', 'cards', 'sticky', 'bubbles', 'spotlight', 'compact', 'count', 'strip', 'ticker',
    'timeline', 'focus', 'by-person', 'pinned-new', 'latest',
    'chalkboard', 'letterboard', 'whiteboard', 'fridge', 'notebook', 'receipt', 'neon', 'headline'],
    sizes: NOTES_VIEW_SIZES,
    expect: expectNotesView },
];
