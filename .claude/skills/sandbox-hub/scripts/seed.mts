/**
 * Writes a made-up household into a data directory: seven people in two
 * groups, chores, rewards, a week of meals, two lists and three screens.
 * Every module takes its settings from the real registry, so nothing shows a
 * "not set up yet" state the app would not really produce.
 *
 *   node_modules/.bin/tsx .claude/skills/sandbox-hub/scripts/seed.mts <data-dir>
 *
 * `hub.sh start <port> --household` runs this for you. The registry and the
 * schema version are read from HS_SEED_ROOT (default: the working directory),
 * so a sandbox of another tree is seeded with that tree's own defaults.
 *
 * Everything here is invented. The location is Boulder, Colorado.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const target = process.argv[2];
if (!target) throw new Error('usage: seed.mts <data-dir>');
mkdirSync(target, { recursive: true });

const root = process.env.HS_SEED_ROOT ?? process.cwd();
const load = (rel: string) => import(pathToFileURL(path.join(root, rel)).href);
const { getModuleDefinition } = await load('src/lib/module-registry.ts');
const { getLatestSchemaVersion } = await load('src/lib/migrations/index.ts');
const { DEFAULT_MODULE_STYLE } = await load('src/types/config.ts');

const now = new Date().toISOString();
const LAT = 40.015;
const LON = -105.2705;
const TODO_LIST_ID = 'list-weekend';
const SHOPPING_LIST_ID = 'list-shopping';

/** Local YYYY-MM-DD for a day offset from today, the way the stores key days. */
function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let seq = 0;
function mod(
  type: string,
  position: { x: number; y: number },
  config: Record<string, unknown> = {},
  size?: { w: number; h: number },
) {
  const def = getModuleDefinition(type);
  if (!def) throw new Error(`no registry entry for ${type}`);
  return {
    id: `${type}-${++seq}`,
    type,
    position,
    size: size ?? { ...def.defaultSize },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { ...(def.defaultConfig as Record<string, unknown>), ...config },
  };
}

const members = [
  { id: 'm-dana', name: 'Dana', color: '#60a5fa', emoji: '🧑' },
  { id: 'm-alex', name: 'Alex', color: '#f472b6', emoji: '👩' },
  { id: 'm-noah', name: 'Noah', color: '#4ade80', emoji: '⚽' },
  { id: 'm-mia', name: 'Mia', color: '#fbbf24', emoji: '🎨' },
  { id: 'm-liam', name: 'Liam', color: '#a78bfa', emoji: '🦖' },
  { id: 'm-ruby', name: 'Ruby', color: '#fb923c', emoji: '🐰' },
  { id: 'm-theo', name: 'Theo', color: '#22d3ee', emoji: '🚂' },
].map((m) => ({ ...m, createdAt: now, updatedAt: now }));
const kids = ['m-noah', 'm-mia', 'm-liam', 'm-ruby', 'm-theo'];

const family = {
  members,
  groups: [
    { id: 'g-kids', name: 'Kids', memberIds: kids, createdAt: now, updatedAt: now },
    { id: 'g-parents', name: 'Grown-ups', memberIds: ['m-dana', 'm-alex'], createdAt: now, updatedAt: now },
  ],
  migrated: true,
};

const everyDay = [0, 1, 2, 3, 4, 5, 6];
const chores = {
  chores: [
    { id: 'c-dishes', name: 'Load the dishwasher', emoji: '🍽️', points: 3, frequency: 'daily', daysOfWeek: everyDay, timeOfDay: 'evening', assigneeIds: [], assigneeGroupIds: ['g-kids'], rotation: 'daily' },
    { id: 'c-trash', name: 'Take out the trash', emoji: '🗑️', points: 5, frequency: 'weekly', daysOfWeek: [2], timeOfDay: 'evening', assigneeIds: ['m-noah'], rotation: 'fixed' },
    { id: 'c-beds', name: 'Make your bed', emoji: '🛏️', points: 1, frequency: 'daily', daysOfWeek: everyDay, timeOfDay: 'morning', assigneeIds: kids, rotation: 'fixed' },
    { id: 'c-dog', name: 'Feed the dog', emoji: '🐕', points: 2, frequency: 'daily', daysOfWeek: everyDay, timeOfDay: 'morning', assigneeIds: ['m-mia', 'm-liam'], rotation: 'weekly' },
    { id: 'c-laundry', name: 'Put laundry away', emoji: '🧺', points: 4, frequency: 'weekly', daysOfWeek: [6], timeOfDay: 'afternoon', assigneeIds: ['m-noah', 'm-mia', 'm-liam', 'm-ruby'], rotation: 'fixed' },
    { id: 'c-reading', name: 'Reading practice', emoji: '📚', points: 2, frequency: 'weekly', daysOfWeek: [1, 2, 3, 4], timeOfDay: 'afternoon', assigneeIds: ['m-liam', 'm-ruby', 'm-theo'], rotation: 'fixed' },
    { id: 'c-table', name: 'Set the table', emoji: '🍴', points: 2, frequency: 'daily', daysOfWeek: everyDay, timeOfDay: 'evening', assigneeIds: ['m-ruby', 'm-theo'], rotation: 'daily' },
    { id: 'c-recycling', name: 'Sort the recycling', emoji: '♻️', points: 3, frequency: 'weekly', daysOfWeek: [5], timeOfDay: 'anytime', assigneeIds: [], assigneeGroupIds: ['g-kids'], rotation: 'weekly' },
  ],
};

const rewards = {
  rewards: [
    { id: 'r-movie', name: 'Pick the movie', emoji: '🎬', cost: 10, description: '', memberIds: [], enabled: true },
    { id: 'r-icecream', name: 'Ice cream trip', emoji: '🍦', cost: 25, description: '', memberIds: [], enabled: true },
    { id: 'r-late', name: 'Stay up 30 minutes late', emoji: '🌙', cost: 15, description: '', memberIds: [], enabled: true },
    { id: 'r-bike', name: 'New bike helmet', emoji: '🚲', cost: 120, description: '', memberIds: [], enabled: true },
  ],
  balances: { 'm-noah': 34, 'm-mia': 12, 'm-liam': 7, 'm-ruby': 21, 'm-theo': 3 },
  redemptions: [],
};

const savedMeals = [
  { id: 'meal-spaghetti', name: 'Spaghetti and meatballs', emoji: '🍝', prepTime: 35 },
  { id: 'meal-tacos', name: 'Chicken tacos', emoji: '🌮', prepTime: 25 },
  { id: 'meal-soup', name: 'Tomato soup and grilled cheese', emoji: '🥪', prepTime: 20 },
  { id: 'meal-stirfry', name: 'Veggie stir fry', emoji: '🥦', prepTime: 30 },
  { id: 'meal-pizza', name: 'Homemade pizza', emoji: '🍕', prepTime: 45 },
  { id: 'meal-salmon', name: 'Baked salmon and rice', emoji: '🐟', prepTime: 30 },
  { id: 'meal-pancakes', name: 'Pancakes', emoji: '🥞', prepTime: 20 },
];
const meals = {
  savedMeals,
  // Dinner for a week either side of today, so the week and today views have
  // something whichever day the planning week starts on.
  plan: Array.from({ length: 14 }, (_, i) => ({
    slot: 'dinner',
    mealId: savedMeals[i % 6].id,
    date: isoDate(i - 7),
  })).concat([{ slot: 'breakfast', mealId: 'meal-pancakes', date: isoDate(0) }]),
};

function todoList(id: string, name: string, color: string, items: Array<[string, boolean, string[]?]>) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    color,
    items: items.map(([text, completed, assigneeIds], i) => ({
      id: `${id}-${i + 1}`,
      text,
      completed,
      completedAt: completed ? now : undefined,
      createdAt: now,
      assigneeIds,
    })),
    repeat: 'never',
    createdAt: now,
    updatedAt: now,
  };
}
const todos = {
  lists: [
    todoList(TODO_LIST_ID, 'Weekend jobs', '#3b82f6', [
      ['Rake the leaves', false, ['m-noah', 'm-dana']],
      ['Return library books', false, ['m-alex']],
      ['Fix the squeaky gate', false, ['m-dana']],
      ['Clean out the car', true, ['m-mia']],
    ]),
    todoList(SHOPPING_LIST_ID, 'Shopping', '#22c55e', [
      ['Milk', false],
      ['Bananas', false],
      ['Dog food', false],
      ['Birthday candles', true],
    ]),
  ],
  migratedFromConfig: true,
};

const config = {
  version: getLatestSchemaVersion(),
  settings: {
    rotationIntervalMs: 60_000,
    displayWidth: 1080,
    displayHeight: 1920,
    displayTransform: '90',
    latitude: LAT,
    longitude: LON,
    locale: 'en-US',
    timezone: 'America/Denver',
    telemetryEnabled: false,
    weather: { provider: 'weatherapi', latitude: LAT, longitude: LON, units: 'imperial' },
    // A source id so calendar modules show events (fed by a browser-side
    // stub) instead of "No calendars picked yet".
    calendar: { googleCalendarIds: ['primary'], icalSources: [], daysAhead: 7 },
  },
  screens: [
    {
      id: 'screen-home',
      name: 'Home',
      backgroundImage: '',
      modules: [
        mod('clock', { x: 60, y: 60 }, {}, { w: 560, h: 280 }),
        mod('date', { x: 640, y: 60 }, {}, { w: 380, h: 280 }),
        mod('weather', { x: 60, y: 360 }, { view: 'current' }, { w: 960, h: 360 }),
        mod('calendar', { x: 60, y: 760 }, {}, { w: 960, h: 520 }),
        mod('chore-chart', { x: 60, y: 1320 }, { view: 'today' }, { w: 960, h: 520 }),
      ],
    },
    {
      id: 'screen-family',
      name: 'Family',
      backgroundImage: '',
      modules: [
        mod('chore-chart', { x: 60, y: 60 }, { view: 'star-chart' }, { w: 960, h: 700 }),
        mod('meal-planner', { x: 60, y: 820 }, {}, { w: 960, h: 500 }),
        mod('todo', { x: 60, y: 1360 }, { listId: TODO_LIST_ID }, { w: 960, h: 480 }),
      ],
    },
    {
      id: 'screen-weather',
      name: 'Weather',
      backgroundImage: '',
      modules: [
        mod('weather', { x: 60, y: 120 }, { view: 'daily' }, { w: 960, h: 600 }),
        mod('sunrise-sunset', { x: 60, y: 780 }, {}, { w: 960, h: 300 }),
        mod('moon-phase', { x: 60, y: 1140 }, {}, { w: 460, h: 400 }),
        mod('air-quality', { x: 580, y: 1140 }, {}, { w: 440, h: 400 }),
      ],
    },
  ],
};

const files: Record<string, unknown> = {
  'config.json': config,
  'family.json': family,
  'chores.json': chores,
  'rewards.json': rewards,
  'meals.json': meals,
  'todos.json': todos,
};
for (const [name, value] of Object.entries(files)) {
  writeFileSync(path.join(target, name), JSON.stringify(value, null, 2));
}
console.log(`seeded ${target}: ${members.length} people, ${chores.chores.length} chores, ${savedMeals.length} meals, ${todos.lists.length} lists, ${config.screens.length} screens, schema v${config.version}`);
