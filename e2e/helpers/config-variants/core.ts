import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import {
  has, lacks, matches, notMatches, child, count, redBackground,
  TINY_GIF, WEATHER_WIND, WEATHER_NO_ALERTS, STANDINGS_8, TODOIST_2,
} from './shared';

/**
 * The original config-variant rows (pre Phase-1 split). New rows land in the
 * per-batch files alongside this one; index.ts concatenates them all.
 */

// --- The matrix ------------------------------------------------------------

export const CORE_VARIANTS: ConfigVariant[] = [
  // ================= NETWORK-FREE =================

  // -- qr-code --
  {
    type: 'qr-code', name: 'wifi-wpa', kind: 'network-free',
    config: { mode: 'wifi', ssid: 'MyNetwork', password: 'pw', authType: 'WPA', showNetworkName: true },
    expect: async (mod) => { await child('svg')(mod); await has('MyNetwork')(mod); },
  },
  {
    type: 'qr-code', name: 'wifi-nopass', kind: 'network-free',
    config: { mode: 'wifi', ssid: 'OpenNet', authType: 'nopass' },
    expect: async (mod) => { await child('svg')(mod); await has('OpenNet')(mod); },
  },
  {
    type: 'qr-code', name: 'custom-colors', kind: 'network-free',
    config: { mode: 'custom', data: 'https://example.com/e2e', fgColor: '#ff0000', bgColor: '#00ff00' },
    expect: async (mod) => { await child('svg path[fill="#ff0000"]')(mod); await child('svg path[fill="#00ff00"]')(mod); },
  },

  // -- clock --
  {
    type: 'clock', name: 'format-24h', kind: 'network-free',
    config: { view: 'classic', format24h: true, showSeconds: false },
    expect: async (mod) => { await matches(/\d{1,2}:\d{2}/)(mod); await notMatches(/\b(AM|PM)\b/)(mod); },
  },
  {
    type: 'clock', name: 'show-seconds', kind: 'network-free',
    config: { view: 'classic', showSeconds: true },
    expect: matches(/\d{1,2}:\d{2}:\d{2}/),
  },
  {
    type: 'clock', name: 'world-zone', kind: 'network-free',
    config: { view: 'world', worldZones: [{ label: 'Tokyo', timezone: 'Asia/Tokyo' }] },
    expect: has('Tokyo'),
  },
  {
    type: 'clock', name: 'elapsed', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00:00', referenceLabel: 'Since Launch', countUp: true },
    expect: async (mod) => { await has('Since Launch')(mod); await matches(/\d+d/)(mod); },
  },
  {
    type: 'clock', name: 'week-and-day-of-year', kind: 'network-free',
    config: { view: 'classic', showWeekNumber: true, showDayOfYear: true },
    expect: async (mod) => { await matches(/Week \d+/)(mod); await matches(/Day \d+/)(mod); },
  },

  // -- text --
  {
    type: 'text', name: 'markdown-bold', kind: 'network-free',
    config: { content: '**bold words**', markdown: true },
    expect: async (mod) => { await expect(mod.locator('strong')).toContainText('bold words'); },
  },
  {
    type: 'text', name: 'marquee', kind: 'network-free',
    config: { content: 'E2E MARQUEE', marquee: true },
    expect: child('[style*="_marquee"]'),
  },
  {
    type: 'text', name: 'gradient', kind: 'network-free',
    config: { content: 'E2E GRADIENT', gradientEnabled: true, gradientFrom: '#a78bfa', gradientTo: '#22d3ee' },
    expect: child('[data-text-gradient]'),
  },
  {
    type: 'text', name: 'vertical-orientation', kind: 'network-free',
    config: { content: 'E2E VERTICAL', orientation: 'vertical' },
    expect: child('span[style*="vertical-rl"]'),
  },
  {
    type: 'text', name: 'drop-cap', kind: 'network-free',
    config: { content: 'Elegant drop cap paragraph text.', dropCap: true },
    expect: child('div[class^="_dc_"]'),
  },
  {
    type: 'text', name: 'uppercase-transform', kind: 'network-free',
    config: { content: 'lowercase text', textTransform: 'uppercase' },
    expect: async (mod) => { await expect(mod.locator('span', { hasText: 'lowercase text' }).first()).toHaveCSS('text-transform', 'uppercase'); },
  },
  {
    // Representative pure-CSS effect: inline text-shadow + injected keyframe.
    type: 'text', name: 'effect-glow', kind: 'network-free',
    config: { content: 'E2E GLOW', effect: 'glow' },
    expect: child('span[style*="text-shadow"]'),
  },
  {
    // Structural effect: each character becomes its own animated <span>.
    type: 'text', name: 'effect-wave', kind: 'network-free',
    config: { content: 'E2E WAVE', effect: 'wave' },
    expect: child('span[style*="_textWave"]'),
  },
  {
    // Typewriter reveals progressively; assert the content lands (path runs, no crash).
    type: 'text', name: 'effect-typewriter', kind: 'network-free',
    config: { content: 'E2E TYPEWRITER', effect: 'typewriter' },
    expect: has('E2E TYPEWRITER'),
  },

  // -- icon --
  {
    type: 'icon', name: 'style-regular', kind: 'network-free',
    config: { iconName: 'star', style: 'regular' },
    expect: child('i.fa-regular.fa-star'),
  },
  {
    type: 'icon', name: 'style-brands', kind: 'network-free',
    config: { iconName: 'github', style: 'brands' },
    expect: child('i.fa-brands.fa-github'),
  },
  {
    type: 'icon', name: 'animation-spin', kind: 'network-free',
    config: { iconName: 'star', style: 'solid', animation: 'spin' },
    expect: child('i.fa-spin.fa-star'),
  },
  {
    type: 'icon', name: 'icon-background', kind: 'network-free',
    config: { iconName: 'star', style: 'solid', iconBackground: '#ff0000' },
    expect: async (mod) => {
      const bg = await mod.locator('div:has(> i)').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg.replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/);
    },
  },

  // -- shape --
  {
    type: 'shape', name: 'fill-gradient', kind: 'network-free',
    config: { view: 'rectangle', fillMode: 'gradient' },
    expect: child('svg linearGradient'),
  },
  {
    type: 'shape', name: 'vertical-divider', kind: 'network-free',
    config: { view: 'divider', orientation: 'vertical' },
    expect: child('svg line[x1="50%"][y1="0%"][x2="50%"][y2="100%"]'),
  },
  {
    type: 'shape', name: 'line-dashed', kind: 'network-free',
    config: { view: 'divider', lineStyle: 'dashed', thickness: 2 },
    expect: child('svg line[stroke-dasharray]'),
  },
  {
    type: 'shape', name: 'outline-rectangle', kind: 'network-free',
    config: { view: 'rectangle', outline: true },
    expect: child('svg rect[fill="none"]'),
  },
  {
    type: 'shape', name: 'polygon-6', kind: 'network-free',
    config: { view: 'polygon', sides: 6 },
    expect: async (mod) => {
      await child('svg polygon')(mod);
      const points = await mod.locator('svg polygon').first().getAttribute('points');
      expect((points || '').trim().split(/\s+/)).toHaveLength(6);
    },
  },
  {
    type: 'shape', name: 'star-5', kind: 'network-free',
    config: { view: 'star', starPoints: 5, starInnerRatio: 0.4 },
    expect: async (mod) => {
      await child('svg polygon')(mod);
      const points = await mod.locator('svg polygon').first().getAttribute('points');
      expect((points || '').trim().split(/\s+/)).toHaveLength(10);
    },
  },
  {
    type: 'shape', name: 'arrow-up', kind: 'network-free',
    config: { view: 'arrow', arrowDirection: 'up' },
    expect: child('svg g[transform="rotate(270 50 50)"]'),
  },
  {
    type: 'shape', name: 'frame-brackets', kind: 'network-free',
    config: { view: 'frame', frameStyle: 'brackets' },
    expect: async (mod) => { await count('svg line', 8)(mod); await count('svg rect', 0)(mod); },
  },
  {
    type: 'shape', name: 'frame-rectangle', kind: 'network-free',
    config: { view: 'frame', frameStyle: 'rectangle' },
    expect: async (mod) => { await child('svg rect[fill="none"]')(mod); await count('svg line', 0)(mod); },
  },

  // -- countdown --
  {
    type: 'countdown', name: 'show-past-events', kind: 'network-free',
    config: { view: 'all', showPastEvents: true, events: [{ id: 'e1', name: 'PAST EVENT', date: '2020-01-01' }] },
    expect: has('PAST EVENT'),
  },
  {
    type: 'countdown', name: 'recurring-yearly', kind: 'network-free',
    config: { view: 'all', events: [{ id: 'e2', name: 'BIRTHDAY EVENT', date: '2020-03-15', recurring: 'yearly' }] },
    expect: async (mod) => { await has('BIRTHDAY EVENT')(mod); await expect(mod).not.toContainText('(ago)'); },
  },

  // -- date --
  {
    type: 'date', name: 'show-year', kind: 'network-free',
    config: { view: 'full', showYear: true },
    // Compare against the runtime year so this stays correct past 2026.
    expect: async (mod) => { await has(String(new Date().getFullYear()))(mod); },
  },
  {
    type: 'date', name: 'week-number', kind: 'network-free',
    config: { view: 'full', showWeekNumber: true },
    expect: matches(/Week \d+/),
  },
  {
    type: 'date', name: 'iso-format', kind: 'network-free',
    config: { view: 'minimal', dateFormat: 'yyyy-MM-dd' },
    expect: matches(/\d{4}-\d{2}-\d{2}/),
  },

  // -- year-progress --
  {
    type: 'year-progress', name: 'hide-percentage', kind: 'network-free',
    config: { showPercentage: false },
    expect: async (mod) => {
      await has('Week')(mod); // the week row still renders (proves the module mounted)
      await notMatches(/\d+\.\d%/)(mod);
    },
  },
  {
    type: 'year-progress', name: 'hide-week', kind: 'network-free',
    config: { showWeek: false },
    expect: async (mod) => {
      await expect(mod).not.toContainText('Week');
      await expect.poll(async () => ((await mod.innerText()) || '').trim().length).toBeGreaterThan(0);
    },
  },

  // -- multi-month --
  {
    type: 'multi-month', name: 'single-month', kind: 'network-free',
    config: { view: 'vertical', monthCount: 1 },
    expect: async (mod) => {
      const now = new Date();
      const thisMonth = now.toLocaleString('en-US', { month: 'long' });
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString('en-US', { month: 'long' });
      await expect(mod).toContainText(thisMonth);
      await expect(mod).not.toContainText(nextMonth);
    },
  },

  // -- moon-phase --
  {
    type: 'moon-phase', name: 'show-illumination', kind: 'network-free',
    config: { showIllumination: true, showMoonTimes: false },
    expect: has('illuminated'),
  },
  {
    type: 'moon-phase', name: 'show-moon-times', kind: 'network-free',
    config: { showIllumination: false, showMoonTimes: true },
    expect: matches(/Rise|Set/),
  },

  // -- sunrise-sunset --
  {
    type: 'sunrise-sunset', name: 'hide-day-length', kind: 'network-free',
    config: { view: 'default', showDayLength: false, showGoldenHour: false },
    expect: async (mod) => { await has('Sunrise')(mod); await expect(mod).not.toContainText('Day length'); },
  },
  {
    type: 'sunrise-sunset', name: 'golden-hour', kind: 'network-free',
    config: { view: 'default', showGoldenHour: true },
    expect: has('Golden hour'),
  },

  // -- garbage-day --
  {
    type: 'garbage-day', name: 'recycling-off', kind: 'network-free',
    config: { recyclingDay: -1 },
    expect: async (mod) => { await has('Trash')(mod); await expect(mod).not.toContainText('Recycling'); },
  },
  {
    type: 'garbage-day', name: 'custom-stream', kind: 'network-free',
    config: { customDay: 4, customLabel: 'E2E YARD' },
    expect: has('E2E YARD'),
  },
  {
    type: 'garbage-day', name: 'biweekly', kind: 'network-free',
    config: { trashDay: 1, trashFrequency: 'biweekly' },
    expect: has('Every other'),
  },

  // -- affirmations --
  {
    // categories:[] + a single custom entry makes the rendered text deterministic.
    type: 'affirmations', name: 'custom-entry', kind: 'network-free',
    config: { view: 'elegant', categories: [], customEntries: [{ id: 'c1', text: 'E2E CUSTOM AFFIRMATION' }] },
    expect: has('E2E CUSTOM AFFIRMATION'),
  },
  {
    type: 'affirmations', name: 'category-label', kind: 'network-free',
    config: { view: 'elegant', categories: [], showCategoryLabel: true, customEntries: [{ id: 'c1', text: 'E2E AFF TEXT' }] },
    expect: async (mod) => { await has('E2E AFF TEXT')(mod); await has('Affirmation')(mod); },
  },

  // -- sticky-note --
  {
    type: 'sticky-note', name: 'note-color', kind: 'network-free',
    config: { content: 'E2E STICKY', noteColor: '#ff0000' },
    expect: async (mod) => {
      const bg = await mod.locator('div').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg.replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/);
    },
  },

  // -- image --
  {
    type: 'image', name: 'object-fit-contain', kind: 'network-free',
    config: { src: TINY_GIF, objectFit: 'contain', alt: 'e2e' },
    expect: async (mod) => { await expect(mod.locator('img')).toHaveCSS('object-fit', 'contain'); },
  },

  // -- iframe --
  {
    type: 'iframe', name: 'sandbox-enabled', kind: 'network-free',
    config: { url: '/login', sandboxEnabled: true, sandbox: 'allow-scripts', title: 'E2E EMBED' },
    expect: child('iframe[sandbox="allow-scripts"]'),
  },
  {
    type: 'iframe', name: 'scrollable', kind: 'network-free',
    config: { url: '/login', scrollable: true, title: 'E2E EMBED' },
    expect: child('iframe[scrolling="yes"]'),
  },

  // -- todo --
  {
    type: 'todo', name: 'completed-item', kind: 'network-free',
    config: { title: 'E2E TODO', items: [{ id: 'a', text: 'ACTIVE ITEM', completed: false }, { id: 'b', text: 'DONE ITEM', completed: true }] },
    expect: async (mod) => {
      await expect(mod.locator('span.line-clamp-2', { hasText: 'DONE ITEM' })).toHaveCSS('text-decoration-line', 'line-through');
      await expect(mod.locator('span.line-clamp-2', { hasText: 'ACTIVE ITEM' })).toHaveCSS('text-decoration-line', 'none');
    },
  },

  // -- display-control --
  {
    type: 'display-control', name: 'layout-bar', kind: 'network-free',
    config: { layout: 'bar' },
    expect: async (mod) => { await child('.items-center.gap-3.px-4')(mod); await child('button.rounded-full')(mod); },
  },
  {
    type: 'display-control', name: 'layout-pad', kind: 'network-free',
    config: { layout: 'pad' },
    expect: child('.grid-cols-2'),
  },

  // ================= NETWORKED =================

  // -- weather --
  {
    type: 'weather', name: 'metric-units', kind: 'networked', stubKey: 'weather', stubBody: WEATHER_WIND,
    settings: { weather: { provider: 'weatherapi', latitude: 44.7133, longitude: -93.4227, units: 'metric' } },
    config: { view: 'daily', showWind: true, daysToShow: 2 },
    expect: has('km/h'),
  },
  {
    type: 'weather', name: 'icon-set-outline', kind: 'networked', stubKey: 'weather',
    config: { view: 'current', iconSet: 'outline' },
    expect: child('svg.lucide'),
  },
  {
    type: 'weather', name: 'show-humidity', kind: 'networked', stubKey: 'weather',
    config: { view: 'current', showHumidity: true, showPrecipitation: false },
    expect: has('55%'),
  },
  {
    // Defined-but-empty alerts + hideWhenNoAlerts → the module renders nothing.
    type: 'weather', name: 'hide-when-no-alerts', kind: 'networked', stubKey: 'weather', stubBody: WEATHER_NO_ALERTS,
    config: { view: 'alerts', hideWhenNoAlerts: true },
    expect: async (mod) => { await expect(mod).toBeEmpty(); },
  },

  // -- standings --
  {
    type: 'standings', name: 'playoff-line', kind: 'networked', stubKey: 'standings', stubBody: STANDINGS_8,
    config: { view: 'table', league: 'nfl', grouping: 'division', showPlayoffLine: true },
    expect: child('.border-dashed'),
  },

  // -- stock-ticker / crypto --
  {
    type: 'stock-ticker', name: 'card-scale', kind: 'networked', stubKey: 'stocks',
    config: { view: 'cards', cardScale: 1.5 },
    expect: child('[style*="font-size: 1.875em"]'),
  },
  {
    type: 'crypto', name: 'card-scale', kind: 'networked', stubKey: 'crypto',
    config: { view: 'cards', cardScale: 1.5 },
    expect: child('[style*="font-size: 1.875em"]'),
  },

  // -- calendar --
  {
    type: 'calendar', name: 'hide-time', kind: 'networked', stubKey: 'calendar',
    config: { viewMode: 'daily', showTime: false },
    expect: async (mod) => { await has('Dentist Appointment')(mod); await notMatches(/\b(AM|PM)\b/)(mod); },
  },
  {
    type: 'calendar', name: 'show-location', kind: 'networked', stubKey: 'calendar',
    config: { viewMode: 'daily', showLocation: true },
    expect: has('123 Main St'),
  },
  {
    type: 'calendar', name: 'source-filter-hides', kind: 'networked', stubKey: 'calendar',
    config: { viewMode: 'daily', sourceFilter: ['nonexistent-source'] },
    expect: async (mod) => { await expect(mod).not.toContainText('Dentist Appointment'); },
  },

  // -- fullscreen-calendar --
  {
    type: 'fullscreen-calendar', name: 'dark-mode', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', darkMode: true },
    expect: async (mod) => { await expect(mod.locator('.fsc-root')).toHaveAttribute('style', /1c1917/i); },
  },
  {
    type: 'fullscreen-calendar', name: 'today-highlight-off', kind: 'networked', stubKey: 'calendar',
    config: { view: 'month-grid', todayHighlightStyle: 'off' },
    expect: async (mod) => {
      await expect(mod.locator('.fsc-root')).toBeVisible();
      await expect(mod.locator('.fsc-today-pulse')).toHaveCount(0);
    },
  },

  // -- news --
  {
    type: 'news', name: 'max-items-1', kind: 'networked', stubKey: 'news',
    config: { view: 'list', maxItems: 1 },
    expect: lacks('Global markets rally on tech surge', 'City council approves new park'),
  },
  {
    type: 'news', name: 'show-description', kind: 'networked', stubKey: 'news',
    config: { view: 'list', showDescription: true },
    expect: has('Stocks climbed today.'),
  },

  // -- todoist --
  {
    type: 'todoist', name: 'group-by-project', kind: 'networked', stubKey: 'todoist',
    config: { viewMode: 'list', groupBy: 'project' },
    // The group header (not the inline project chip) is uppercase/tracking-wider.
    expect: async (mod) => { await expect(mod.locator('.tracking-wider', { hasText: 'Inbox' }).first()).toBeAttached(); },
  },
  {
    type: 'todoist', name: 'show-labels', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_2,
    config: { viewMode: 'list', groupBy: 'none', showLabels: true },
    expect: has('errands'),
  },
  {
    type: 'todoist', name: 'max-tasks-1', kind: 'networked', stubKey: 'todoist', stubBody: TODOIST_2,
    config: { viewMode: 'list', groupBy: 'none', maxTasks: 1 },
    expect: lacks('FIRST TASK', 'SECOND TASK'),
  },

  // -- air-quality --
  {
    type: 'air-quality', name: 'show-pollutants', kind: 'networked', stubKey: 'air-quality',
    config: { showPollutants: true },
    expect: has('PM2.5'),
  },

  // -- rain-map (loads external tiles regardless of config) --
  {
    type: 'rain-map', name: 'map-style-standard', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { mapStyle: 'standard' },
    expect: child('img[src*="openstreetmap.org"]'),
  },

  // -- photo-slideshow / fullscreen-photo --
  {
    type: 'photo-slideshow', name: 'object-fit-contain', kind: 'networked', stubKey: 'backgrounds', stubBody: [TINY_GIF],
    config: { objectFit: 'contain' },
    expect: async (mod) => { await expect(mod.locator('img').first()).toHaveCSS('object-fit', 'contain'); },
  },
  {
    type: 'fullscreen-photo', name: 'transition-slide', kind: 'networked', stubKey: 'backgrounds', stubBody: [TINY_GIF],
    config: { transition: 'slide' },
    expect: child('img[style*="transform 800ms"]'),
  },
  {
    type: 'fullscreen-photo', name: 'transition-zoom', kind: 'networked', stubKey: 'backgrounds', stubBody: [TINY_GIF],
    config: { transition: 'zoom' },
    expect: child('img[style*="transform 1000ms"]'),
  },

  // -- dad-joke / quote / word-of-day / history --
  {
    type: 'dad-joke', name: 'accent-color', kind: 'networked', stubKey: 'dad-joke',
    config: { accentColor: '#ff0000' },
    expect: redBackground('.w-12.rounded-full'),
  },
  {
    type: 'quote', name: 'accent-color', kind: 'networked', stubKey: 'quote',
    config: { accentColor: '#ff0000' },
    expect: async (mod) => {
      const border = await mod.locator('.px-5').first().evaluate((el) => getComputedStyle(el).borderLeftColor);
      expect(border.replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/);
    },
  },
  {
    type: 'word-of-day', name: 'hide-dividers', kind: 'network-free',
    config: { showDividers: false },
    expect: count('.w-12.rounded-full', 0),
  },
  {
    type: 'history', name: 'hide-dividers', kind: 'networked', stubKey: 'history',
    config: { showDividers: false },
    expect: async (mod) => { await has('Apollo 11 lands on the Moon.')(mod); await count('.w-12.rounded-full', 0)(mod); },
  },

  // ================= LOCAL-DATA =================

  // -- meal-planner --
  {
    type: 'meal-planner', name: 'hide-emoji', kind: 'local-data', seed: 'meals',
    config: { view: 'today', showEmoji: false },
    expect: async (mod) => { await has('Spaghetti Night')(mod); await expect(mod).not.toContainText('🍝'); },
  },
  {
    type: 'meal-planner', name: 'hide-prep-time', kind: 'local-data', seed: 'meals',
    config: { view: 'today', showPrepTime: false },
    expect: async (mod) => { await has('Spaghetti Night')(mod); await expect(mod).not.toContainText('25 min'); },
  },

  // -- fullscreen-meal-planner --
  {
    type: 'fullscreen-meal-planner', name: 'theme-midnight', kind: 'local-data', seed: 'meals',
    config: { view: 'week', theme: 'midnight' },
    expect: async (mod) => { await expect(mod.locator('.fmp-root')).toHaveAttribute('style', /#0a0a0a/i); },
  },

  // -- chore-chart --
  {
    type: 'chore-chart', name: 'week-start-sunday', kind: 'local-data', seed: 'chores',
    config: { view: 'star-chart', weekStartDay: 'sunday' },
    expect: async (mod) => { await expect(mod.locator('thead th').nth(1)).toContainText('Sun'); },
  },

  // -- fullscreen-chore-chart --
  {
    type: 'fullscreen-chore-chart', name: 'rewards-button', kind: 'local-data', seed: 'chores',
    config: { view: 'chores', showRewardsButton: true },
    expect: has('Rewards'),
  },
  {
    type: 'fullscreen-chore-chart', name: 'theme-midnight', kind: 'local-data', seed: 'chores',
    config: { view: 'chores', theme: 'midnight' },
    expect: async (mod) => { await expect(mod.locator('.fcc-root')).toHaveAttribute('style', /#0a0a0a/i); },
  },
];
