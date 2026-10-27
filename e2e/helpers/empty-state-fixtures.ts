import { E2E_TIMETABLE_MEMBER_IDS, E2E_TODO_LIST_ID } from './api';
import { expect, type Locator, type Page } from '@playwright/test';
import type { ModuleType } from '@/types/config';
import { NOTES_MATERIAL_VIEWS } from '@/lib/notes-rules';

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
  /** Seed the shared to-do store with these lists (todos rows only). */
  todoSeed?: import('./api').TodoSeed;
  /** Seed the timetable store and the roster it names (timetable rows only). */
  timetableSeed?: import('./api').TimetableSeed;
  /** Seed the notes board with these notes (notes rows only). Omitted = an empty board. */
  notesSeed?: import('./api').NotesSeed;
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
    // The team view with nobody picked yet points at the settings.
    type: 'sports', name: 'team-no-pick', kind: 'networked', stubKey: 'sports',
    config: { view: 'team', favoriteTeams: [] },
    expect: showsCopy('Pick your team in the module settings'),
  },
  {
    // Every picked team plays in a league that is switched off, so none is
    // fetched and the card says what to turn on instead of loading forever.
    type: 'sports', name: 'team-league-off', kind: 'networked', stubKey: 'sports',
    config: { view: 'team', leagues: ['nba'], favoriteTeams: ['nfl:MIN'] },
    expect: showsCopy("Turn on your team's league in the module settings"),
  },
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
    // Same config-level gate as the news tile: on the wall it has to be the
    // full placeholder, not a bare muted line.
    type: 'fullscreen-news', name: 'no-feeds', kind: 'network-free',
    config: { feeds: [] },
    expect: showsCopy('Add a news feed in the editor and headlines show here'),
  },
  {
    // No list picked (the registry default): the module says where to pick one.
    type: 'todo', name: 'no-list', kind: 'local-data',
    config: {},
    expect: showsCopy('Pick a list in the editor'),
  },
  {
    type: 'todo', name: 'no-items', kind: 'local-data',
    todoSeed: { lists: [{ id: E2E_TODO_LIST_ID, name: 'E2E TODO', items: [] }] },
    config: { listId: E2E_TODO_LIST_ID },
    expect: showsCopy('Add things on your phone and they show up here'),
  },
  {
    type: 'todo', name: 'board-no-lists', kind: 'local-data',
    config: { view: 'board' },
    expect: showsCopy('No lists yet'),
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
    expect: showsCopy('Location not set'),
  },
  {
    // The route needs the household location; without one the module says so
    // instead of surfacing the route's error string.
    type: 'air-quality', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not set'),
  },
  {
    // No module coordinates and no household location: nothing to centre on.
    type: 'rain-map', name: 'missing-location', kind: 'network-free', noLocation: true,
    config: { latitude: 0, longitude: 0 },
    expect: showsCopy('Location not set'),
  },
  {
    type: 'sunrise-sunset', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not set'),
  },
  {
    // Without coordinates the shared weather fetch never runs, so the module
    // has to say so itself rather than sit on its loading copy.
    type: 'fullscreen-weather', name: 'missing-location', kind: 'network-free', noLocation: true,
    expect: showsCopy('Location not set'),
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
  {
    // Nobody picked yet (the registry default): the card says where to pick.
    type: 'timetable', name: 'nobody-picked', kind: 'local-data',
    config: {},
    expect: showsCopy("Pick whose week to show in this module's settings."),
  },
  {
    // Leon is on the roster and picked, but his week has not been entered, so
    // the card says the week is missing rather than that nobody is chosen.
    type: 'timetable', name: 'no-week-yet', kind: 'local-data',
    timetableSeed: { members: [{ id: E2E_TIMETABLE_MEMBER_IDS.leon, name: 'Leon' }] },
    config: { memberIds: [E2E_TIMETABLE_MEMBER_IDS.leon] },
    expect: showsCopy('No timetable yet. A grown-up can add one in the editor.'),
  },
  {
    // Nothing posted: the board says where notes come from.
    type: 'notes', name: 'no-notes', kind: 'local-data',
    config: {},
    expect: showsCopy('Nothing on the board. Write a note on your phone and it shows up here.'),
  },
  {
    // Only a note that has come down: the phone still lists it under Gone,
    // the wall never draws it, so the board reads as empty.
    type: 'notes', name: 'only-gone', kind: 'local-data',
    notesSeed: { notes: [{ text: 'Gone note', ageMinutes: 120, expiresInMinutes: -5 }] },
    config: {},
    expect: async (mod) => {
      await showsCopy('Nothing on the board. Write a note on your phone and it shows up here.')(mod);
      await expect(mod).not.toContainText('Gone note');
    },
  },
  {
    // Count keeps its tile on an empty board: 0 is still information, with
    // the empty line beneath it instead of the empty-state card.
    type: 'notes', name: 'count-zero', kind: 'local-data',
    config: { view: 'count' },
    expect: async (mod) => {
      await expect(mod.getByTestId('notes-count')).toHaveText('0');
      await showsCopy('notes on the board')(mod);
      await showsCopy('Nothing on the board. Write a note on your phone and it shows up here.')(mod);
    },
  },
  // A material has nothing to paint on an empty board, and its ink on a bare
  // surface would vanish on a dark wall, so every material falls back to the
  // ordinary empty card with the standard words.
  ...[...NOTES_MATERIAL_VIEWS].map((view): EmptyStateFixture => ({
    type: 'notes', name: `material-empty-${view}`, kind: 'local-data',
    config: { view },
    expect: async (mod) => {
      await showsCopy('Nothing on the board. Write a note on your phone and it shows up here.')(mod);
      await expect(mod.getByTestId('notes-module')).toHaveCount(0);
    },
  })),
  {
    // A note is up but none is pinned, so the pinned-only board says so
    // rather than looking empty.
    type: 'notes', name: 'none-pinned', kind: 'local-data',
    notesSeed: { notes: [{ text: 'Unpinned note', important: true }] },
    config: { filter: 'pinned' },
    expect: async (mod) => {
      await showsCopy('No pinned notes right now.')(mod);
      await expect(mod).not.toContainText('Unpinned note');
    },
  },
  {
    type: 'notes', name: 'none-important', kind: 'local-data',
    notesSeed: { notes: [{ text: 'Ordinary note', pinned: true }] },
    config: { filter: 'important' },
    expect: async (mod) => {
      await showsCopy('No important notes right now.')(mod);
      await expect(mod).not.toContainText('Ordinary note');
    },
  },
];
