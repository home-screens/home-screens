import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import {
  has, lacks, matches, notMatches, child, count, redBackground, localDate, localIso,
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
  // The AM/PM regexes below have a boundary before the marker only: the
  // wrapper's textContent runs the marker straight into the date line
  // ("9:32 PMFriday, ..."), so a trailing boundary never matched, and the
  // 24-hour rows' negation was passing without proving anything.
  {
    // A clock placed before `hourFormat` existed: no such key, so its own
    // toggle is what it reads. `undefined` drops the registry default on the
    // way to JSON, which is exactly the on-disk shape of such a clock.
    type: 'clock', name: 'format-24h-legacy', kind: 'network-free',
    config: { view: 'classic', format24h: true, hourFormat: undefined, showSeconds: false },
    expect: async (mod) => { await matches(/\d{1,2}:\d{2}/)(mod); await notMatches(/\b(AM|PM)/)(mod); },
  },
  {
    type: 'clock', name: 'hour-format-24h', kind: 'network-free',
    config: { view: 'classic', hourFormat: '24h', showSeconds: false },
    expect: async (mod) => { await matches(/\d{1,2}:\d{2}/)(mod); await notMatches(/\b(AM|PM)/)(mod); },
  },
  {
    // New clocks follow the household setting.
    type: 'clock', name: 'hour-format-inherit', kind: 'network-free',
    settings: { timeFormat: '24h' },
    config: { view: 'classic', hourFormat: 'inherit', showSeconds: false },
    expect: async (mod) => { await matches(/\d{1,2}:\d{2}/)(mod); await notMatches(/\b(AM|PM)/)(mod); },
  },
  {
    // ...and an explicit 12-hour choice on a clock beats a 24-hour household.
    type: 'clock', name: 'hour-format-12h', kind: 'network-free',
    settings: { timeFormat: '24h' },
    config: { view: 'classic', hourFormat: '12h', showSeconds: false },
    expect: matches(/\b(AM|PM)/),
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
  {
    type: 'sunrise-sunset', name: 'astro-dark', kind: 'network-free',
    config: { view: 'default', showAstroDark: true },
    expect: has('Dark begins'),
  },
  {
    type: 'sunrise-sunset', name: 'circle-astro-dark', kind: 'network-free',
    config: { view: 'circle', showAstroDark: true },
    expect: has('Dark begins'),
  },
  {
    type: 'sunrise-sunset', name: 'arc-astro-dark', kind: 'network-free',
    config: { view: 'arc', showAstroDark: true },
    expect: has('Dark begins'),
  },
  {
    // Sky theme: the flat three-segment ring becomes a ~300-slice gradient, and the
    // dark window is forced on — the 30 seeded stars render without showAstroDark.
    // (Matrix location 44.7°N has astronomical darkness year-round, so stars are
    // safe to assert in any season.)
    type: 'sunrise-sunset', name: 'circle-theme-sky', kind: 'network-free',
    config: { view: 'circle', theme: 'sky' },
    expect: async (mod) => {
      const distinct = await mod.locator('svg path').evaluateAll(
        (paths) => new Set(paths.map((p) => (p as SVGPathElement).getAttribute('stroke'))).size,
      );
      await expect(distinct).toBeGreaterThan(10);
      await expect(mod.locator('svg circle[r="0.5"]')).toHaveCount(30);
    },
  },
  {
    type: 'sunrise-sunset', name: 'circle-theme-simple', kind: 'network-free',
    config: { view: 'circle', theme: 'simple' },
    expect: async (mod) => {
      const distinct = await mod.locator('svg path').evaluateAll(
        (paths) => new Set(paths.map((p) => (p as SVGPathElement).getAttribute('stroke'))).size,
      );
      await expect(distinct).toBeLessThanOrEqual(3);
      await expect(mod.locator('svg circle[r="0.5"]')).toHaveCount(0);
    },
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
  // The widget sizes itself to its box, and the default box is too narrow for
  // five bar buttons to carry words, so assert the layout and its controls
  // rather than the words (see metrics.ts).
  {
    type: 'display-control', name: 'layout-bar', kind: 'network-free',
    config: { layout: 'bar' },
    expect: async (mod) => {
      await child('[data-layout="bar"]')(mod);
      await count('button[aria-label]', 5)(mod);
    },
  },
  // Pad is the panel without the always-visible slider: a Brightness button
  // opens it instead.
  {
    type: 'display-control', name: 'layout-pad', kind: 'network-free',
    config: { layout: 'pad' },
    expect: async (mod) => {
      await child('[data-layout="pad"]')(mod);
      await child('button[aria-label="Brightness"]')(mod);
      await expect(mod.locator('input[type="range"]')).toHaveCount(0);
    },
  },
  // Nav is the pared-back one: the two navigation buttons and nothing else.
  {
    type: 'display-control', name: 'layout-nav', kind: 'network-free',
    config: { layout: 'nav' },
    expect: async (mod) => {
      await child('[data-layout="nav"]')(mod);
      await count('button[aria-label]', 2)(mod);
      await expect(mod.locator('input[type="range"]')).toHaveCount(0);
    },
  },
  // Icons only: the buttons keep their aria-labels but lose their words.
  {
    type: 'display-control', name: 'compact', kind: 'network-free',
    config: { compact: true },
    expect: async (mod) => {
      await expect(mod.locator('button[aria-label="Previous screen"]')).toBeVisible();
      await expect(mod.locator('button[aria-label="Previous screen"]')).toHaveText('');
    },
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
    // Boundary before the marker only, as in the clock rows: the wrapper's
    // textContent can run "PM" straight into the next line.
    expect: async (mod) => { await has('Dentist Appointment')(mod); await notMatches(/\b(AM|PM)/)(mod); },
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
  {
    type: 'calendar', name: 'title-filter-excludes', kind: 'networked', stubKey: 'calendar',
    config: { viewMode: 'daily', titleFilter: { mode: 'exclude', terms: ['Dentist'] } },
    expect: async (mod) => { await expect(mod).not.toContainText('Dentist Appointment'); },
  },
  {
    type: 'calendar', name: 'event-rules', kind: 'networked', stubKey: 'calendar',
    config: {
      viewMode: 'daily',
      eventRules: [{ id: 'r1', match: { text: 'dentist' }, title: 'RULE RENAMED' }],
    },
    expect: async (mod) => { await expect(mod).toContainText('RULE RENAMED'); await expect(mod).not.toContainText('Dentist Appointment'); },
  },
  {
    type: 'calendar', name: 'day-rules', kind: 'networked', stubKey: 'calendar',
    config: {
      viewMode: 'daily',
      dayRules: [{ id: 'd1', match: { when: 'today' }, badgeText: 'RULE BADGE', badgeColor: '#f97316' }],
    },
    expect: async (mod) => { await expect(mod.locator('[data-day-badge]')).toHaveText('RULE BADGE'); },
  },
  {
    // Agenda groups get day decor too — this view rendered no badges at all
    // until the rules review caught it.
    type: 'calendar', name: 'day-rules-agenda', kind: 'networked', stubKey: 'calendar',
    config: {
      viewMode: 'agenda',
      dayRules: [{ id: 'd1', match: { withEvents: 'any' }, badgeText: 'AGENDA BADGE', badgeColor: '#f97316' }],
    },
    expect: async (mod) => { await expect(mod.locator('[data-day-badge]').first()).toHaveText('AGENDA BADGE'); },
  },
  {
    // A single-minute event just after midnight today is always in the past
    // by the time the page renders (any run except literally 00:00-00:01
    // local), so dimming is assertable at any wall-clock time without a
    // fake clock. Deliberately not the shared todayCalendarEvents() fixture
    // — that event is built to always be currently running, never past.
    type: 'calendar', name: 'dim-past-events', kind: 'networked', stubKey: 'calendar',
    stubBody: [{
      id: 'past-1', title: 'Ended Event', start: localIso(0, 0, 1), end: localIso(0, 0, 2),
      allDay: false, calendarColor: '#4073ff', sourceId: 'cal-primary', sourceName: 'Personal',
    }],
    config: { viewMode: 'daily', dimPastEvents: true },
    expect: async (mod) => { await expect(mod.locator('[data-event-id="past-1"]')).toHaveCSS('opacity', '0.4'); },
  },
  {
    // The shared todayCalendarEvents() fixture always spans "currently
    // running" (00:01 today → 23:59 tomorrow), so the now-rule always has
    // an upcoming/running boundary to sit before, at any wall-clock time.
    type: 'calendar', name: 'now-rule', kind: 'networked', stubKey: 'calendar',
    config: { viewMode: 'daily', showNowRule: true },
    expect: child('[data-now-rule]'),
  },
  {
    // Regression: eventsForDay always sorts all-day events first, and they
    // carry no past/future meaning, so the rule-placement scan must skip
    // over them rather than stopping at the first one. Same past-event
    // construction as dim-past-events above.
    type: 'calendar', name: 'now-rule-skips-all-day', kind: 'networked', stubKey: 'calendar',
    stubBody: [
      { id: 'ar-allday', title: 'Vacation', start: localDate(0), end: localDate(1), allDay: true, calendarColor: '#4073ff', sourceId: 'cal-primary', sourceName: 'Personal' },
      { id: 'ar-past', title: 'Ended Event', start: localIso(0, 0, 1), end: localIso(0, 0, 2), allDay: false, calendarColor: '#4073ff', sourceId: 'cal-primary', sourceName: 'Personal' },
    ],
    config: { viewMode: 'daily', daysToShow: 1, dimPastEvents: true, showNowRule: true },
    expect: async (mod) => {
      // evaluateAll grabs a single DOM snapshot with no auto-wait (unlike
      // expect(locator).x()), so poll it until the render settles instead
      // of racing the fetch.
      await expect.poll(() =>
        mod.locator('[data-now-rule], [data-event-id]').evaluateAll((els) =>
          els.map((el) => (el.hasAttribute('data-now-rule') ? 'rule' : el.getAttribute('data-event-id')))),
      ).toEqual(['ar-allday', 'ar-past', 'rule']);
      await expect(mod.locator('[data-event-id="ar-allday"]')).not.toHaveCSS('box-shadow', /inset/);
    },
  },
  {
    // Birthdays and holidays render kind-aware chrome instead of the generic
    // "All day" label: a glyph in the dot slot, "Birthday · turns N" /
    // "Holiday" in the time slot. Birth year computed relative to "now" so
    // the asserted age never drifts as the test suite ages.
    type: 'calendar', name: 'birthday-kind', kind: 'networked', stubKey: 'calendar',
    stubBody: [
      {
        id: 'bday-1', title: 'Ava', kind: 'birthday', birthYear: new Date().getFullYear() - 9,
        start: localDate(0), end: localDate(1), allDay: true, calendarColor: '#EC4899', sourceId: 'cal-primary', sourceName: 'Personal',
      },
      {
        id: 'holiday-1', title: 'Labor Day', kind: 'holiday',
        start: localDate(0), end: localDate(1), allDay: true, calendarColor: '#10b981', sourceId: 'holidays', sourceName: 'Public Holidays',
      },
    ],
    config: { viewMode: 'daily' },
    expect: async (mod) => { await has('Birthday · turns 9')(mod); await has('Holiday')(mod); },
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
  {
    // Month grid pulls birthdays out of the normal all-day bar row entirely:
    // bold name-first text ("Ava turns 9") plus a cake glyph by the day
    // number, no colored bar/dot. Holidays keep the normal solid bar. Birth
    // year computed relative to "now" so the asserted age never drifts.
    type: 'fullscreen-calendar', name: 'birthday-kind', kind: 'networked', stubKey: 'calendar',
    stubBody: [
      {
        id: 'bday-1', title: 'Ava', kind: 'birthday', birthYear: new Date().getFullYear() - 9,
        start: localDate(0), end: localDate(1), allDay: true, calendarColor: '#EC4899', sourceId: 'cal-primary', sourceName: 'Personal',
      },
      {
        id: 'holiday-1', title: 'Labor Day', kind: 'holiday',
        start: localDate(0), end: localDate(1), allDay: true, calendarColor: '#10b981', sourceId: 'holidays', sourceName: 'Public Holidays',
      },
    ],
    config: { view: 'month-grid' },
    expect: async (mod) => { await has('Ava turns 9')(mod); await has('Labor Day')(mod); },
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
