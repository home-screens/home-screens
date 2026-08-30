import type { ConfigVariant } from './types';
import { lacks } from './shared';

/**
 * `showTitle: false` rows — one per module that paints its own built-in
 * header ("Traffic", "Collection Schedule", "On This Day", ...). Each row
 * asserts the module's content still renders while the header text is gone.
 * The default (`true` / omitted) is what the static matrix already renders.
 */
export const TITLE_VARIANTS: ConfigVariant[] = [
  {
    type: 'traffic', name: 'hide-title', kind: 'networked', stubKey: 'traffic',
    config: { routes: [{ label: 'Home to Work', origin: 'A', destination: 'B' }], showTitle: false },
    expect: lacks('Home to Work', 'Traffic'),
  },
  {
    type: 'garbage-day', name: 'hide-title', kind: 'network-free',
    config: { showTitle: false },
    expect: lacks('Trash', 'Collection Schedule'),
  },
  {
    type: 'history', name: 'hide-title', kind: 'networked', stubKey: 'history',
    config: { showTitle: false },
    expect: lacks('Apollo 11 lands on the Moon.', 'On This Day'),
  },
  {
    // A distinctive header: the default "News" would also match the "BBC News"
    // source tag that every story now carries.
    type: 'news', name: 'hide-title-headline', kind: 'networked', stubKey: 'news',
    config: { view: 'headline', title: 'E2E NEWS TITLE', showTitle: false },
    expect: lacks('Global markets rally on tech surge', 'E2E NEWS TITLE'),
  },
  {
    type: 'news', name: 'hide-title-list', kind: 'networked', stubKey: 'news',
    config: { view: 'list', title: 'E2E NEWS TITLE', showTitle: false },
    expect: lacks('Global markets rally on tech surge', 'E2E NEWS TITLE'),
  },
  {
    // The whole title row goes (title + done count), the items stay.
    type: 'todo', name: 'hide-title', kind: 'network-free',
    config: { title: 'E2E TODO', items: [{ id: 'a', text: 'ACTIVE ITEM', completed: false }], showTitle: false },
    expect: lacks('ACTIVE ITEM', 'E2E TODO'),
  },
  {
    type: 'todoist', name: 'hide-title', kind: 'networked', stubKey: 'todoist',
    config: { viewMode: 'list', title: 'E2E TODOIST TITLE', showTitle: false },
    expect: lacks('Buy oat milk', 'E2E TODOIST TITLE'),
  },
  {
    type: 'weather', name: 'hide-title', kind: 'networked', stubKey: 'weather',
    config: { view: 'hourly', showTitle: false },
    expect: lacks('72°', 'Hourly Forecast'),
  },
  {
    type: 'chore-chart', name: 'hide-title', kind: 'local-data', seed: 'chores',
    config: { view: 'board', showTitle: false },
    expect: lacks('Feed the dog', 'Family Chores'),
  },
  {
    type: 'meal-planner', name: 'hide-title', kind: 'local-data', seed: 'meals',
    config: { view: 'today', showTitle: false },
    expect: lacks('Spaghetti Night', "Today's Meals"),
  },
  {
    type: 'fullscreen-meal-planner', name: 'hide-title', kind: 'local-data', seed: 'meals',
    config: { view: 'week', showTitle: false },
    expect: lacks('Spaghetti Night', "This Week's Meals"),
  },
];

/** One row per remaining per-view guard, so a dropped guard in any view fails here. */
export const TITLE_VIEW_VARIANTS: ConfigVariant[] = [
  {
    type: 'weather', name: 'hide-title-daily', kind: 'networked', stubKey: 'weather',
    config: { view: 'daily', showTitle: false },
    expect: lacks('78', 'Forecast'),
  },
  {
    type: 'weather', name: 'hide-title-table', kind: 'networked', stubKey: 'weather',
    config: { view: 'table', showTitle: false },
    expect: lacks('78', 'Forecast'),
  },
  {
    type: 'chore-chart', name: 'hide-title-today', kind: 'local-data', seed: 'chores',
    config: { view: 'today', showTitle: false },
    expect: lacks('Feed the dog', 'Today'),
  },
  {
    type: 'chore-chart', name: 'hide-title-compact', kind: 'local-data', seed: 'chores',
    config: { view: 'compact', showTitle: false },
    expect: lacks('Feed the dog', 'Chores'),
  },
  {
    type: 'chore-chart', name: 'hide-title-progress', kind: 'local-data', seed: 'chores',
    config: { view: 'progress', showTitle: false },
    expect: lacks('Avery', 'Family Progress'),
  },
  {
    type: 'chore-chart', name: 'hide-title-star-chart', kind: 'local-data', seed: 'chores',
    config: { view: 'star-chart', showTitle: false },
    expect: lacks('Avery', 'Star Chart'),
  },
  {
    type: 'fullscreen-meal-planner', name: 'hide-title-today', kind: 'local-data', seed: 'meals',
    config: { view: 'today', showTitle: false },
    expect: lacks('Spaghetti Night', "Today's Meals"),
  },
  {
    type: 'fullscreen-meal-planner', name: 'hide-title-menu-board', kind: 'local-data', seed: 'meals',
    config: { view: 'menu-board', showTitle: false },
    expect: lacks('Spaghetti Night', "Today's Menu"),
  },
];
