import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, lacks, child, redStyle } from './shared';

/** Phase-1 batch rows — see .claude/plans/2026-07-09-e2e-100-percent-coverage.md. */

// --- Todoist stub bodies ---------------------------------------------------
// A rich task set (two root tasks in different projects/labels + one subtask)
// so filter/sort/visibility fields provably remove or reorder items. Tasks are
// deliberately given a default `order` (Bravo before Alpha) that alphabetical
// sort must overturn, and distinct projectName/labels the filters key on.
const TODOIST_RICH = {
  tasks: [
    {
      id: 'a', content: 'Alpha Task', description: 'Alpha details here', priority: 1,
      due: { date: '2099-03-05', datetime: null, isRecurring: false },
      labels: ['home'], labelColors: { home: '#22c55e' },
      projectId: 'pw', projectName: 'Workshop', projectColor: '#3b82f6',
      sectionId: '', sectionName: '', parentId: null, order: 3, commentCount: 0,
    },
    {
      id: 'b', content: 'Bravo Task', description: '', priority: 4,
      due: { date: '2099-03-06', datetime: null, isRecurring: false },
      labels: ['urgent'], labelColors: { urgent: '#ef4444' },
      projectId: 'pp', projectName: 'Personal', projectColor: '#a855f7',
      sectionId: '', sectionName: '', parentId: null, order: 1, commentCount: 0,
    },
    {
      id: 'c', content: 'Charlie Sub', description: '', priority: 1,
      due: { date: '2099-03-07', datetime: null, isRecurring: false },
      labels: [], labelColors: {},
      projectId: 'pw', projectName: 'Workshop', projectColor: '#3b82f6',
      sectionId: '', sectionName: '', parentId: 'a', order: 2, commentCount: 0,
    },
  ],
  projects: [
    { id: 'pw', name: 'Workshop', color: '#3b82f6', order: 1 },
    { id: 'pp', name: 'Personal', color: '#a855f7', order: 2 },
  ],
};

// One due-dated task + one with no due date, so showNoDueDate can drop the latter.
const TODOIST_NODUE = {
  tasks: [
    {
      id: 'd1', content: 'Dated Task', description: '', priority: 1,
      due: { date: '2099-03-05', datetime: null, isRecurring: false },
      labels: [], labelColors: {}, projectId: 'pw', projectName: 'Workshop', projectColor: '#3b82f6',
      sectionId: '', sectionName: '', parentId: null, order: 1, commentCount: 0,
    },
    {
      id: 'd2', content: 'Undated Task', description: '', priority: 1,
      due: null, labels: [], labelColors: {}, projectId: 'pw', projectName: 'Workshop', projectColor: '#3b82f6',
      sectionId: '', sectionName: '', parentId: null, order: 2, commentCount: 0,
    },
  ],
  projects: [{ id: 'pw', name: 'Workshop', color: '#3b82f6', order: 1 }],
};

// --- Garbage-day date anchors ----------------------------------------------
// Highlight and biweekly-parity assertions depend on the wall clock. The row
// build (Node) and the render (browser) share the machine's clock and timezone,
// so a schedule day computed here matches what the component sees. ISO strings
// are built from LOCAL date parts (not toISOString/UTC) because the component
// parses `startDate + 'T00:00:00'` in local time.
const GD_NOW = new Date();
const GD_TODAY_DOW = GD_NOW.getDay();
const GD_TOMORROW_DOW = (GD_TODAY_DOW + 1) % 7;
const gdLocalISO = (offsetDays: number): string => {
  const d = new Date(GD_NOW);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Same week as today → even week offset → collection week (biweekly "on" week).
const GD_ANCHOR_ON = gdLocalISO(0);
// One week before today → odd week offset → NOT a collection week (biweekly "off" week).
const GD_ANCHOR_OFF = gdLocalISO(-7);

// --- Greeting weather companion body -----------------------------------------
// A rainy description so derive.ts maps the published condition to 'rain'.
const GREETING_RAIN = {
  hourly: [{ time: '2099-07-07T12:00:00Z', temp: 60, feelsLike: 58, humidity: 90, icon: 'cloud-rain', description: 'Rain showers', windSpeed: 10, precipProbability: 90 }],
  forecast: [{ date: '2099-07-07', high: 64, low: 52, icon: 'cloud-rain', description: 'Rain' }],
};

// --- Chore ordering seed ------------------------------------------------------
// Two chores seeded EVENING-first so time-of-day sorting and seed order differ:
// showTimeOfDay:true reorders the morning chore first; :false preserves seed
// order (sortChores is a stable sort returning 0 without the time comparison).
const CHORES_TWO_TIMES = {
  members: [{ id: 'm1', name: 'Avery', emoji: '🦊', color: '#f59e0b' }],
  chores: [
    { id: 'c-eve', name: 'Alpha Evening Chore', emoji: '🌙', points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'evening', assigneeIds: ['m1'], rotation: 'fixed' },
    { id: 'c-morn', name: 'Zulu Morning Chore', emoji: '🌅', points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'morning', assigneeIds: ['m1'], rotation: 'fixed' },
  ],
};

export const PERSONAL_VARIANTS: ConfigVariant[] = [
  // ========================= TODOIST (networked) =========================
  {
    // sortBy reorders within a group: default order puts Bravo (order 1) first;
    // alphabetical must surface Alpha before Bravo.
    type: 'todoist', name: 'sort-alphabetical', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_RICH,
    config: { viewMode: 'list', groupBy: 'none', sortBy: 'alphabetical', showSubtasks: false },
    expect: async (mod) => {
      const text = (await mod.evaluate((el) => el.textContent)) || '';
      expect(text.indexOf('Alpha Task')).toBeGreaterThanOrEqual(0);
      expect(text.indexOf('Alpha Task')).toBeLessThan(text.indexOf('Bravo Task'));
    },
  },
  {
    // projectFilter keeps only tasks whose projectName matches (case-insensitive).
    type: 'todoist', name: 'project-filter', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_RICH,
    config: { viewMode: 'list', groupBy: 'none', projectFilter: 'Personal', showSubtasks: false },
    expect: lacks('Bravo Task', 'Alpha Task'),
  },
  {
    // labelFilter keeps only tasks carrying a matching label ('urgent' → Bravo).
    type: 'todoist', name: 'label-filter', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_RICH,
    config: { viewMode: 'list', groupBy: 'none', labelFilter: 'urgent', showSubtasks: false },
    expect: lacks('Bravo Task', 'Alpha Task'),
  },
  {
    // showNoDueDate:false drops the task that has no due date.
    type: 'todoist', name: 'hide-no-due-date', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_NODUE,
    config: { viewMode: 'list', groupBy: 'none', showNoDueDate: false, showSubtasks: false },
    expect: lacks('Dated Task', 'Undated Task'),
  },
  {
    // showSubtasks:false filters out tasks with a parentId (the subtask).
    type: 'todoist', name: 'hide-subtasks', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_RICH,
    config: { viewMode: 'list', groupBy: 'none', showSubtasks: false },
    expect: lacks('Alpha Task', 'Charlie Sub'),
  },
  {
    // showDescription (default false) surfaces the task's description line.
    type: 'todoist', name: 'show-description', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_RICH,
    config: { viewMode: 'list', groupBy: 'none', showDescription: true, showSubtasks: false },
    expect: has('Alpha details here'),
  },
  {
    // showProject:false (with labels off) removes the project name from the meta row.
    type: 'todoist', name: 'hide-project', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_RICH,
    config: { viewMode: 'list', groupBy: 'none', showProject: false, showLabels: false, showSubtasks: false },
    expect: async (mod) => {
      await has('Alpha Task')(mod);
      await expect(mod).not.toContainText('Workshop');
    },
  },
  {
    // title overrides the header text.
    type: 'todoist', name: 'custom-title', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_RICH,
    config: { viewMode: 'list', groupBy: 'none', title: 'E2E TODOIST TITLE' },
    expect: has('E2E TODOIST TITLE'),
  },
  {
    // allowComplete swaps the priority bar for a tap-to-complete <button aria-label>.
    // Static marker only (the tap behavior itself is exercised in interactive.spec.ts).
    type: 'todoist', name: 'allow-complete', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_RICH,
    config: { viewMode: 'list', groupBy: 'none', allowComplete: true, showSubtasks: false },
    expect: child('button[aria-label]'),
  },

  // ======================= GARBAGE-DAY (network-free) =======================
  {
    // trashColor tints the first (trash) icon's SVG stroke.
    type: 'garbage-day', name: 'trash-color', kind: 'network-free',
    config: { trashColor: '#ff0000' },
    expect: redStyle('svg', 'stroke'),
  },
  {
    // recyclingColor tints the recycling icon (the stroke-width="2" SVG).
    type: 'garbage-day', name: 'recycling-color', kind: 'network-free',
    config: { recyclingColor: '#ff0000' },
    expect: redStyle('svg[stroke-width="2"]', 'stroke'),
  },
  {
    // customColor tints the custom-stream icon; disable the others so it is the only SVG.
    type: 'garbage-day', name: 'custom-color', kind: 'network-free',
    config: { customDay: 4, customColor: '#ff0000', trashDay: -1, recyclingDay: -1 },
    expect: redStyle('svg', 'stroke'),
  },
  {
    // highlightMode 'day-of' highlights the row whose day IS today → "Today" badge.
    type: 'garbage-day', name: 'highlight-day-of', kind: 'network-free',
    config: { trashDay: GD_TODAY_DOW, highlightMode: 'day-of', recyclingDay: -1, customDay: -1 },
    expect: has('Today'),
  },
  {
    // highlightMode 'day-before' highlights the row whose day is TOMORROW → "Tomorrow" badge.
    type: 'garbage-day', name: 'highlight-day-before', kind: 'network-free',
    config: { trashDay: GD_TOMORROW_DOW, highlightMode: 'day-before', recyclingDay: -1, customDay: -1 },
    expect: has('Tomorrow'),
  },
  {
    // Biweekly + start date anchored to THIS week → collection week → highlighted today.
    type: 'garbage-day', name: 'recycling-biweekly-on-week', kind: 'network-free',
    config: {
      recyclingDay: GD_TODAY_DOW, recyclingFrequency: 'biweekly', recyclingStartDate: GD_ANCHOR_ON,
      highlightMode: 'day-of', trashDay: -1, customDay: -1,
    },
    expect: has('Today'),
  },
  {
    // Same day, but the anchor is one week off → OFF week → no highlight (no "Today").
    type: 'garbage-day', name: 'recycling-biweekly-off-week', kind: 'network-free',
    config: {
      recyclingDay: GD_TODAY_DOW, recyclingFrequency: 'biweekly', recyclingStartDate: GD_ANCHOR_OFF,
      highlightMode: 'day-of', trashDay: -1, customDay: -1,
    },
    expect: async (mod) => {
      await has('Recycling')(mod);
      await expect(mod).not.toContainText('Today');
    },
  },
  {
    // Custom stream, biweekly on-week anchor → highlighted today under a custom label.
    type: 'garbage-day', name: 'custom-biweekly-on-week', kind: 'network-free',
    config: {
      customDay: GD_TODAY_DOW, customFrequency: 'biweekly', customStartDate: GD_ANCHOR_ON, customLabel: 'E2E COMPOST',
      highlightMode: 'day-of', trashDay: -1, recyclingDay: -1,
    },
    expect: async (mod) => {
      await has('E2E COMPOST')(mod);
      await has('Today')(mod);
    },
  },
  {
    // Trash biweekly off-week anchor → not a collection week → no "Today".
    type: 'garbage-day', name: 'trash-biweekly-off-week', kind: 'network-free',
    config: {
      trashDay: GD_TODAY_DOW, trashFrequency: 'biweekly', trashStartDate: GD_ANCHOR_OFF,
      highlightMode: 'day-of', recyclingDay: -1, customDay: -1,
    },
    expect: async (mod) => {
      await has('Trash')(mod);
      await expect(mod).not.toContainText('Today');
    },
  },

  // ======================= AFFIRMATIONS (network-free) =======================
  {
    // accentColor paints the elegant view's divider bars. A single custom entry
    // with categories:[] keeps the rendered pool deterministic.
    type: 'affirmations', name: 'accent-color', kind: 'network-free',
    config: { view: 'elegant', categories: [], customEntries: [{ id: 'c1', text: 'E2E ACCENT AFFIRMATION' }], accentColor: '#ff0000' },
    expect: async (mod) => {
      const bg = await mod.locator('.w-12.rounded-full').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg.replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/);
    },
  },

  // ========================= GREETING (network-free) =========================
  {
    // accentColor overrides the time-of-day greeting color (non-black passes hasAccentColor).
    type: 'greeting', name: 'accent-color', kind: 'network-free',
    config: { name: 'E2E GREET', accentColor: '#ff0000' },
    expect: async (mod) => {
      await has('E2E GREET')(mod);
      const color = await mod.locator('p').first().evaluate((el) => getComputedStyle(el).color);
      expect(color.replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/);
    },
  },
  {
    // weatherAware consumes the weather module's 'weather.conditions' event-bus
    // publish (derive.ts maps a rainy description → 'rain' → the greeting
    // suffix). A companion weather module on the same screen, fed a rainy stub,
    // is the real production mechanism end-to-end.
    type: 'greeting', name: 'weather-aware-suffix', kind: 'networked', stubKey: 'weather', stubBody: GREETING_RAIN,
    companions: [{ type: 'weather', config: { view: 'current' } }],
    config: { name: 'E2E GREET', weatherAware: true },
    expect: has('Rainy day ahead'),
  },
  {
    // Same rainy publish, weatherAware off → no suffix.
    type: 'greeting', name: 'weather-aware-off', kind: 'networked', stubKey: 'weather', stubBody: GREETING_RAIN,
    companions: [{ type: 'weather', config: { view: 'current' } }],
    config: { name: 'E2E GREET', weatherAware: false },
    expect: async (mod) => {
      await has('E2E GREET')(mod);
      await expect(mod).not.toContainText('Rainy day ahead');
    },
  },

  // =========================== TODO (network-free) ===========================
  {
    // accentColor fills the completed item's check box.
    type: 'todo', name: 'accent-color', kind: 'network-free',
    config: { title: 'E2E TODO', items: [{ id: 'x', text: 'DONE ITEM', completed: true }], accentColor: '#ff0000' },
    expect: child('rect[fill="#ff0000"]'),
  },

  // ========================= CHORE-CHART (local-data) =========================
  {
    // accentColor colors the star-chart's "today" column header.
    type: 'chore-chart', name: 'accent-color', kind: 'local-data', seed: 'chores',
    config: { view: 'star-chart', accentColor: '#ff0000' },
    expect: async (mod) => {
      await has('Star Chart')(mod); // auto-wait for the async chore data to render the grid
      await expect
        .poll(async () => {
          const colors = await mod.locator('thead th').evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
          return colors.some((c) => /^rgba?\(255,0,0/.test(c.replace(/\s/g, '')));
        })
        .toBe(true);
    },
  },
  {
    // showPoints:false hides the star-chart's weekly "tickets" totals row.
    type: 'chore-chart', name: 'hide-points', kind: 'local-data', seed: 'chores',
    config: { view: 'star-chart', showPoints: false },
    expect: async (mod) => {
      await has('Star Chart')(mod);
      await expect(mod).not.toContainText('tickets');
    },
  },
  {
    // showTimeOfDay:true sorts the morning chore ahead of the evening one,
    // overturning the evening-first seed order.
    type: 'chore-chart', name: 'time-of-day-order', kind: 'local-data', seed: 'chores', seedData: CHORES_TWO_TIMES,
    config: { view: 'board', showTimeOfDay: true },
    expect: async (mod) => {
      await has('Zulu Morning Chore')(mod);
      const text = (await mod.evaluate((el) => el.textContent)) || '';
      expect(text.indexOf('Zulu Morning Chore')).toBeLessThan(text.indexOf('Alpha Evening Chore'));
    },
  },
  {
    // showTimeOfDay:false skips the time comparison, so the stable sort keeps
    // the evening-first seed order.
    type: 'chore-chart', name: 'time-of-day-off', kind: 'local-data', seed: 'chores', seedData: CHORES_TWO_TIMES,
    config: { view: 'board', showTimeOfDay: false },
    expect: async (mod) => {
      await has('Alpha Evening Chore')(mod);
      const text = (await mod.evaluate((el) => el.textContent)) || '';
      expect(text.indexOf('Alpha Evening Chore')).toBeLessThan(text.indexOf('Zulu Morning Chore'));
    },
  },
];
