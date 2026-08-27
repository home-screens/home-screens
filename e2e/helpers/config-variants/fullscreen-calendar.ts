import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, count, lacks, matches, notMatches, dayAt, localIso, localDate } from './shared';

/**
 * Phase-1 batch rows for the fullscreen-calendar module — see
 * .claude/plans/2026-07-09-e2e-100-percent-coverage.md.
 *
 * The module's five views (schedule / week-list / month-grid / day-timeline /
 * agenda) each expose their own config cluster plus a shared cross-view set
 * (theme, accent, typography, density, weather pill, now-line, weekend shading,
 * overlap mode, title wrapping, source filter). The `view` discriminator and
 * `darkMode` / `todayHighlightStyle` are already covered by CORE_VARIANTS, so
 * these rows flip everything else.
 *
 * Every row renders on /display via `stubKey: 'calendar'`. With no `stubBody`
 * the spec serves `todayCalendarEvents()` — one timed event spanning today
 * (00:01 → next-day 23:59) with location "123 Main St", enough to un-gate the
 * per-view render (the module shows an EmptyState when there are zero events).
 * Rows that need specific event shapes (overlap, descriptions, multi-day range,
 * source ids) supply their own `stubBody` built relative to `new Date()`.
 *
 * All hour-window assertions key off the fixed gutter labels (config-driven,
 * not wall-clock), and every date is stamped at row-definition time, so the
 * suite is deterministic at any run time.
 */

// --- Event fixture builders (local naive ISO, matching todayCalendarEvents) --


const BLUE = '#4073ff';

/** One timed event today, 10:00–13:00, with a description tall enough to surface. */
const SCHEDULE_DESC = [
  { id: 'sd1', title: 'SCHED DESC EVENT', start: localIso(0, 10, 0), end: localIso(0, 13, 0), allDay: false, description: 'SCHED DESC E2E', calendarColor: BLUE },
];

/** Two overlapping events today, so stacked mode actually layers one block
 *  over another — the only case that composites an opaque background. */
const OVERLAPPING = [
  { id: 'ov1', title: 'OVERLAP BASE', start: localIso(0, 10, 0), end: localIso(0, 13, 0), allDay: false, calendarColor: BLUE },
  { id: 'ov2', title: 'OVERLAP TOP', start: localIso(0, 11, 0), end: localIso(0, 12, 0), allDay: false, calendarColor: '#e11d48' },
];

/** Two events today with distinct source ids — the filter keeps one, drops the other. */
const SOURCE_FILTER = [
  { id: 'sf1', title: 'KEEP EVENT', start: localIso(0, 10, 0), end: localIso(0, 11, 0), allDay: false, calendarColor: BLUE, sourceId: 'keep-src', sourceName: 'Keep' },
  { id: 'sf2', title: 'DROP EVENT', start: localIso(0, 12, 0), end: localIso(0, 13, 0), allDay: false, calendarColor: '#e11d48', sourceId: 'drop-src', sourceName: 'Drop' },
];

/** One timed event this week with a description (week-list EventRow). */
const WEEK_DESC = [
  { id: 'wd1', title: 'WEEK DESC EVENT', start: localIso(0, 10, 0), end: localIso(0, 11, 0), allDay: false, description: 'WEEK DESC E2E', calendarColor: BLUE },
];

/** Three timed events today so a per-cell cap of 1 forces a "+2 more" overflow. */
const MONTH_MANY = [
  { id: 'mm1', title: 'MONTH EV1', start: localIso(0, 9, 0), end: localIso(0, 10, 0), allDay: false, calendarColor: BLUE },
  { id: 'mm2', title: 'MONTH EV2', start: localIso(0, 11, 0), end: localIso(0, 12, 0), allDay: false, calendarColor: BLUE },
  { id: 'mm3', title: 'MONTH EV3', start: localIso(0, 13, 0), end: localIso(0, 14, 0), allDay: false, calendarColor: BLUE },
];

/** One all-day event today with a description (day-timeline all-day strip). */
const DAY_DESC = [
  { id: 'dd1', title: 'DAY DESC EVENT', start: localDate(0), end: localDate(1), allDay: true, description: 'DAYDESC E2E', calendarColor: BLUE },
];

/** A near (today) and a far (+20d) upcoming all-day event to probe the agenda window. */
const AGENDA_RANGE = [
  { id: 'ar1', title: 'AGENDA NEAR', start: localDate(0), end: localDate(1), allDay: true, calendarColor: BLUE },
  { id: 'ar2', title: 'AGENDA FAR', start: localDate(20), end: localDate(21), allDay: true, calendarColor: BLUE },
];

/** A single upcoming all-day event today (rest of the window is empty). */
const AGENDA_ONE = [
  { id: 'ao1', title: 'AGENDA ONLY', start: localDate(0), end: localDate(1), allDay: true, calendarColor: BLUE },
];

/** One upcoming all-day event today with a description (agenda card). */
const AGENDA_DESC = [
  { id: 'ag1', title: 'AGENDA DESC EVENT', start: localDate(0), end: localDate(1), allDay: true, description: 'AGENDADESC E2E', calendarColor: BLUE },
];

/** A one-hour timed event two days out at noon — its countdown reads "in 2 days" at any run time (whole-calendar-day diff). */
const COUNTDOWN_EVENT = [
  { id: 'cd1', title: 'COUNTDOWN EVENT', start: localIso(2, 12, 0), end: localIso(2, 13, 0), allDay: false, calendarColor: BLUE },
];

/** An all-day event three days out (all-day countdown opt-in). */
const ALLDAY_FUTURE = [
  { id: 'af1', title: 'ALLDAY FUTURE', start: localDate(3), end: localDate(4), allDay: true, calendarColor: BLUE },
];

/**
 * Weather payload with forecast entries dated today/tomorrow. The shared
 * weather fixture pins fixed 2099 dates, which can never match a rendered
 * day, so weather-placement rows bring their own. Hourly is left empty to
 * pin the deterministic daily-fallback path (hourly matching is unit-tested
 * in event-weather.test.ts).
 */
const LIVE_WEATHER = {
  hourly: [],
  forecast: [
    { date: localDate(0), high: 87, low: 61, icon: 'sun', description: 'Sunshowers' },
    { date: localDate(1), high: 80, low: 55, icon: 'sun', description: 'Cloudy' },
  ],
};

/** Today's short weekday label, matching the schedule column-header format. */
const TODAY_EEE = dayAt(0).toLocaleDateString('en-US', { weekday: 'short' });

/** A timed event tomorrow morning: always upcoming, whatever the run time. */
const TOMORROW_MORNING = [
  { id: 'tm1', title: 'UPNEXT HERO', start: localIso(1, 9, 0), end: localIso(1, 10, 0), allDay: false, calendarColor: BLUE, sourceId: 'src-a', sourceName: 'Alpha' },
  { id: 'tm2', title: 'LATER EVENT', start: localIso(1, 11, 0), end: localIso(1, 12, 0), allDay: false, calendarColor: BLUE, sourceId: 'src-a', sourceName: 'Alpha' },
];

/** The shared running event (today 00:01 to tomorrow 23:59) plus tomorrow's hero. */
const RUNNING_PLUS_TOMORROW = [
  { id: 'rn1', title: 'RUNNING NOW', start: localIso(0, 0, 1), end: localIso(1, 23, 59), allDay: false, calendarColor: BLUE, sourceId: 'src-a', sourceName: 'Alpha' },
  ...TOMORROW_MORNING.slice(0, 1),
];

/** A running event today (so the hero is today's) plus an all-day event tomorrow. */
const RUNNING_PLUS_TOMORROW_ALLDAY = [
  RUNNING_PLUS_TOMORROW[0],
  { id: 'ta1', title: 'TOMORROW ALLDAY', start: localDate(1), end: localDate(2), allDay: true, calendarColor: BLUE, sourceId: 'src-a', sourceName: 'Alpha' },
];

/** One event this week with no source id: unclaimed, so it lands on the Everyone row. */
const UNCLAIMED_WEEK = [
  { id: 'uc1', title: 'SHARED EVENT', start: localIso(0, 10, 0), end: localIso(0, 11, 0), allDay: false, calendarColor: BLUE },
];

/** Parse a rolling-window strip label ("2 PM", "12 AM", "14:00") to an hour 0..23. */
function hourOfLabel(label: string): number {
  const m24 = label.match(/^(\d{1,2}):00$/);
  if (m24) return Number(m24[1]);
  const m12 = label.match(/^(\d{1,2}) (AM|PM)$/);
  if (!m12) throw new Error(`unexpected hour label ${label}`);
  const h = Number(m12[1]) % 12;
  return m12[2] === 'PM' ? h + 12 : h;
}

// --- The matrix ------------------------------------------------------------

export const FULLSCREEN_CALENDAR_VARIANTS: ConfigVariant[] = [
  // ================= CROSS-VIEW =================

  {
    // Resolved accent (light theme) lands verbatim in the `--cal-accent` custom
    // property on the root. The default is empty ("follow the theme"), which
    // resolves to the theme's own accent or, on the original themes, #EA580C.
    type: 'fullscreen-calendar', name: 'accent-color', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', accentColor: '#ff0000' },
    expect: async (mod) => { await expect(mod.locator('.fsc-root')).toHaveAttribute('style', /#ff0000/i); },
  },
  {
    // Named theme overrides darkMode: slate's background token is #0f172a
    // (default linen is #f5f1ea).
    type: 'fullscreen-calendar', name: 'theme-slate', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', theme: 'slate' },
    expect: async (mod) => { await expect(mod.locator('.fsc-root')).toHaveAttribute('style', /0f172a/i); },
  },
  {
    // Sandstone paints events `solid`: the block is filled with the source
    // color verbatim (#4073ff from the stub, light theme = no adjustment) and
    // owns its ink, so the title is white on the fill. The theme's own accent
    // (#C2410C) takes over from the orange default while accentColor is empty.
    type: 'fullscreen-calendar', name: 'theme-sandstone-solid', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', theme: 'sandstone', accentColor: '' },
    expect: async (mod) => {
      const block = mod.locator('.fsc-event-block').first();
      await expect(block).toBeVisible();
      await expect(block).toHaveCSS('background-color', 'rgb(64, 115, 255)');
      await expect(block.locator('div').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(mod.locator('.fsc-root')).toHaveAttribute('style', /--cal-accent:\s*#C2410C/i);
    },
  },
  {
    // Vellum paints events `rule`: the theme surface (#ffffff) with a 3px
    // colored edge and no tint.
    type: 'fullscreen-calendar', name: 'theme-vellum-rule', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', theme: 'vellum' },
    expect: async (mod) => {
      const block = mod.locator('.fsc-event-block').first();
      await expect(block).toBeVisible();
      await expect(block).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(block).toHaveCSS('border-left-width', '3px');
      await expect(block).toHaveCSS('border-left-color', 'rgb(64, 115, 255)');
    },
  },
  {
    // Aurora paints events `glass` (a 1px hairline all round, no bar) over a
    // radial-gradient atmosphere layer, and its dark on-accent ink lands on
    // the today circle instead of the original white.
    type: 'fullscreen-calendar', name: 'theme-aurora-glass', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', theme: 'aurora', accentColor: '' },
    expect: async (mod) => {
      const block = mod.locator('.fsc-event-block').first();
      await expect(block).toBeVisible();
      await expect(block).toHaveCSS('border-top-width', '1px');
      await expect(block).toHaveCSS('border-left-width', '1px');
      const rootBg = await mod.locator('.fsc-root').evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(rootBg).toContain('radial-gradient');
      await expect(mod.locator('.fsc-today-pulse').first()).toHaveCSS('color', 'rgb(4, 33, 29)');
    },
  },
  {
    // Header title font-size = bu * 3.5 * typoMul; 4x-large (2.15) clears any
    // smaller size. Measured against the root's own base unit so it holds at
    // any render scale.
    type: 'fullscreen-calendar', name: 'typography-4x-large', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', typographySize: '4x-large' },
    expect: async (mod) => {
      await expect(mod.locator('.fsc-header-title')).toBeVisible();
      const ratio = await mod.locator('.fsc-root').evaluate((root) => {
        const bu = Math.min(root.clientWidth, root.clientHeight) / 100;
        const title = root.querySelector('.fsc-header-title') as HTMLElement;
        return parseFloat(getComputedStyle(title).fontSize) / bu;
      });
      expect(ratio).toBeGreaterThan(3.5 * 2.0);
      expect(ratio).toBeLessThan(3.5 * 2.3);
    },
  },
  {
    // Month day-of-week header = bu * typoMul(1.0) * densityMul * 0.7; snug's
    // densityMul is 1.0 (0.70·bu) vs cozy's 1.2 (0.84·bu).
    type: 'fullscreen-calendar', name: 'density-snug', kind: 'networked', stubKey: 'calendar',
    config: { view: 'month-grid', density: 'snug' },
    expect: async (mod) => {
      await expect(mod.locator('[role="columnheader"]').first()).toBeVisible();
      const ratio = await mod.locator('.fsc-root').evaluate((root) => {
        const bu = Math.min(root.clientWidth, root.clientHeight) / 100;
        const ch = root.querySelector('[role="columnheader"]') as HTMLElement;
        return parseFloat(getComputedStyle(ch).fontSize) / bu;
      });
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(0.77);
    },
  },
  {
    // Legacy pre-placement boolean: showWeather false must still resolve to
    // 'off' and remove the header pill. weatherPlacement is explicitly
    // undefined because a legacy config predates the key entirely, while the
    // registry defaultConfig this row merges over now carries 'header'
    // (JSON.stringify drops the undefined on PUT, so the saved module config
    // genuinely lacks the key, exactly like a real pre-placement config).
    type: 'fullscreen-calendar', name: 'show-weather-off', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', showWeather: false, weatherPlacement: undefined },
    expect: async (mod) => {
      await expect(mod.locator('.fsc-header-title')).toBeVisible();
      await expect(mod.locator('.fsc-weather-pill')).toHaveCount(0);
    },
  },
  {
    // The placement enum's off member removes the pill exactly like the
    // legacy boolean did.
    type: 'fullscreen-calendar', name: 'weather-placement-off', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', weatherPlacement: 'off' },
    expect: async (mod) => {
      await expect(mod.locator('.fsc-header-title')).toBeVisible();
      await expect(mod.locator('.fsc-weather-pill')).toHaveCount(0);
    },
  },
  {
    // 'days' placement puts the daily forecast (high / low) on agenda day
    // headers; the row's own forecast is dated today so it must match.
    type: 'fullscreen-calendar', name: 'weather-placement-days', kind: 'networked', stubKey: 'calendar',
    extraStubs: { weather: LIVE_WEATHER },
    config: { view: 'agenda', weatherPlacement: 'days' },
    expect: async (mod) => { await has('87°')(mod); await has('61°')(mod); },
  },
  {
    // 'events' placement adds a forecast line to each timed event row. With
    // hourly empty, the daily fallback must supply it (high + condition).
    type: 'fullscreen-calendar', name: 'weather-placement-events', kind: 'networked', stubKey: 'calendar',
    extraStubs: { weather: LIVE_WEATHER },
    config: { view: 'agenda', weatherPlacement: 'events' },
    expect: has('Sunshowers'),
  },
  {
    // Schedule columns carry the compact day badge (high only) under the day
    // number; the header pill is header-placement-only, so 87° can only come
    // from the column badge.
    type: 'fullscreen-calendar', name: 'weather-placement-days-schedule', kind: 'networked', stubKey: 'calendar',
    extraStubs: { weather: LIVE_WEATHER },
    config: { view: 'schedule', weatherPlacement: 'days', scheduleDaysToShow: 2 },
    expect: async (mod) => {
      await has('87°')(mod);
      await expect(mod.locator('.fsc-weather-pill')).toHaveCount(0);
    },
  },
  {
    // A placement carried from another view degrades to the header pill on a
    // view without that surface — weather must never vanish on view switch.
    // The shared weather fixture supplies the pill's current temp (72°).
    type: 'fullscreen-calendar', name: 'weather-placement-carried-fallback', kind: 'networked', stubKey: 'calendar',
    config: { view: 'day-timeline', weatherPlacement: 'days' },
    expect: async (mod) => {
      await expect(mod.locator('.fsc-weather-pill')).toBeVisible();
    },
  },
  {
    // Hour window 0–24 keeps "now" in range at any wall-clock time, so the
    // now-line (aria-label "Current time: …") would render if enabled — off
    // removes it while the timeline itself still renders.
    type: 'fullscreen-calendar', name: 'now-line-off', kind: 'networked', stubKey: 'calendar',
    config: { view: 'day-timeline', showNowLine: false, dayHourStart: 0, dayHourEnd: 24 },
    expect: async (mod) => {
      await expect(mod.locator('[aria-label="Day timeline"]')).toBeVisible();
      await expect(mod.locator('[aria-label^="Current time"]')).toHaveCount(0);
    },
  },
  {
    // 7-day schedule always spans a Saturday and Sunday; with shading off no
    // day cell carries the linen weekend shade (#ede8e0 = rgb(237,232,224)).
    type: 'fullscreen-calendar', name: 'shade-weekends-off', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', shadeWeekends: false, scheduleDaysToShow: 7 },
    expect: async (mod) => {
      await expect(mod.locator('[role="columnheader"]')).toHaveCount(7);
      const shaded = await mod.locator('[role="gridcell"]').evaluateAll(
        (cells) => cells.filter((c) => getComputedStyle(c).backgroundColor === 'rgb(237, 232, 224)').length,
      );
      expect(shaded).toBe(0);
    },
  },
  {
    // Week list shades its weekend day groups (audit 26 item 2). A 7-day week
    // always spans Sat and Sun; today's group takes the today fill instead, so
    // at least one weekend group carries linen's shade (#ede8e0).
    type: 'fullscreen-calendar', name: 'shade-weekends-week-list', kind: 'networked', stubKey: 'calendar',
    config: { view: 'week-list', shadeWeekends: true },
    expect: async (mod) => {
      await expect(mod.getByText('Dentist Appointment').first()).toBeVisible();
      const shaded = await mod.locator('div').evaluateAll(
        (els) => els.filter((e) => getComputedStyle(e).backgroundColor === 'rgb(237, 232, 224)').length,
      );
      expect(shaded).toBeGreaterThan(0);
    },
  },
  {
    // Same shading in the agenda, whose 14-day window always spans a weekend.
    type: 'fullscreen-calendar', name: 'shade-weekends-agenda', kind: 'networked', stubKey: 'calendar',
    config: { view: 'agenda', shadeWeekends: true, agendaHideEmptyDays: false },
    expect: async (mod) => {
      await expect(mod.getByText('Dentist Appointment').first()).toBeVisible();
      const shaded = await mod.locator('div').evaluateAll(
        (els) => els.filter((e) => getComputedStyle(e).backgroundColor === 'rgb(237, 232, 224)').length,
      );
      expect(shaded).toBeGreaterThan(0);
    },
  },
  {
    // Audit 26 item 3: the list views used to read todayHighlightStyle as
    // on/off only, so 'full' and 'minimal' were identical. 'full' now tints
    // today's group with --cal-today-fill, which on linen with the default
    // accent is rgba(234,88,12,0.1).
    type: 'fullscreen-calendar', name: 'today-highlight-full-week-list', kind: 'networked', stubKey: 'calendar',
    config: { view: 'week-list', todayHighlightStyle: 'full' },
    expect: async (mod) => {
      await expect(mod.getByText('Dentist Appointment').first()).toBeVisible();
      const tinted = await mod.locator('div').evaluateAll(
        (els) => els.filter((e) => getComputedStyle(e).backgroundColor === 'rgba(234, 88, 12, 0.1)').length,
      );
      expect(tinted).toBeGreaterThan(0);
    },
  },
  {
    // ...and 'minimal' keeps the marker without the tint, which is the
    // distinction those two views previously could not express.
    type: 'fullscreen-calendar', name: 'today-highlight-minimal-agenda', kind: 'networked', stubKey: 'calendar',
    config: { view: 'agenda', todayHighlightStyle: 'minimal', agendaHideEmptyDays: false },
    expect: async (mod) => {
      await expect(mod.getByText('Dentist Appointment').first()).toBeVisible();
      const tinted = await mod.locator('div').evaluateAll(
        (els) => els.filter((e) => getComputedStyle(e).backgroundColor === 'rgba(234, 88, 12, 0.1)').length,
      );
      expect(tinted).toBe(0);
      await expect(mod.locator('.fsc-root')).toBeVisible();
    },
  },
  {
    // Stacked overlap paints the block that sits ON TOP of another with a
    // layered linear-gradient background so what is beneath cannot read
    // through; columns mode (default) uses a flat rgba fill. Needs two
    // overlapping events — a lone block is never layered over anything, so
    // it stays flat in both modes.
    type: 'fullscreen-calendar', name: 'event-overlap-stacked', kind: 'networked', stubKey: 'calendar', stubBody: OVERLAPPING,
    config: { view: 'schedule', eventOverlap: 'stacked', scheduleDaysToShow: 1 },
    expect: async (mod) => {
      await expect(mod.locator('.fsc-event-block').first()).toBeVisible();
      const bgs = await mod.locator('.fsc-event-block').evaluateAll(
        (els) => els.map((e) => getComputedStyle(e).backgroundImage),
      );
      expect(bgs.some((b) => b.includes('gradient'))).toBe(true);
    },
  },
  {
    // Wrapping switches the title clamp from single-line ellipsis to a 2-line
    // -webkit-box; the computed -webkit-line-clamp becomes "2".
    type: 'fullscreen-calendar', name: 'wrap-event-titles', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', wrapEventTitles: true },
    expect: async (mod) => {
      const title = mod.locator('.fsc-event-block').first().locator('div').first();
      await expect(title).toBeVisible();
      const clamp = await title.evaluate((el) => getComputedStyle(el).webkitLineClamp);
      expect(clamp).toBe('2');
    },
  },
  {
    type: 'fullscreen-calendar', name: 'source-filter', kind: 'networked', stubKey: 'calendar', stubBody: SOURCE_FILTER,
    config: { view: 'schedule', scheduleDaysToShow: 1, sourceFilter: ['keep-src'] },
    expect: async (mod) => { await has('KEEP EVENT')(mod); await expect(mod).not.toContainText('DROP EVENT'); },
  },
  {
    type: 'fullscreen-calendar', name: 'title-filter', kind: 'networked', stubKey: 'calendar', stubBody: SOURCE_FILTER,
    config: { view: 'schedule', scheduleDaysToShow: 1, titleFilter: { mode: 'exclude', terms: ['DROP'] } },
    expect: async (mod) => { await has('KEEP EVENT')(mod); await expect(mod).not.toContainText('DROP EVENT'); },
  },
  {
    // Event rule: hide by source, rename by title — both lists run in one pass.
    type: 'fullscreen-calendar', name: 'event-rules', kind: 'networked', stubKey: 'calendar', stubBody: SOURCE_FILTER,
    config: {
      view: 'schedule', scheduleDaysToShow: 1,
      eventRules: [
        { id: 'r1', match: { sourceIds: ['drop-src'] }, hide: true },
        { id: 'r2', match: { text: 'keep' }, title: 'RULE RENAMED', icon: '⭐' },
      ],
    },
    expect: async (mod) => {
      await has('⭐ RULE RENAMED')(mod);
      await expect(mod).not.toContainText('KEEP EVENT');
      await expect(mod).not.toContainText('DROP EVENT');
    },
  },
  {
    // Day rule with a nested event match stamps a badge on today's column header.
    type: 'fullscreen-calendar', name: 'day-rules', kind: 'networked', stubKey: 'calendar', stubBody: SOURCE_FILTER,
    config: {
      view: 'schedule', scheduleDaysToShow: 1,
      dayRules: [{ id: 'd1', match: { withEvents: 'matching', eventMatch: { text: 'keep' } }, badgeText: 'RULE BADGE', badgeColor: '#f97316', background: 'auto' }],
    },
    expect: async (mod) => { await expect(mod.locator('[data-day-badge]')).toHaveText('RULE BADGE'); },
  },

  // ================= SCHEDULE VIEW =================

  {
    // scheduleDaysToShow drives one column header per day.
    type: 'fullscreen-calendar', name: 'schedule-days-to-show', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', scheduleDaysToShow: 3 },
    expect: count('[role="columnheader"]', 3),
  },
  {
    // Gutter labels run from scheduleHourStart to scheduleHourEnd: 10–14 shows
    // "10 AM" and never the default "6 AM".
    type: 'fullscreen-calendar', name: 'schedule-hour-window', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', scheduleHourStart: 10, scheduleHourEnd: 14 },
    expect: async (mod) => { await has('10 AM')(mod); await expect(mod).not.toContainText('6 AM'); },
  },
  {
    type: 'fullscreen-calendar', name: 'schedule-show-description', kind: 'networked', stubKey: 'calendar', stubBody: SCHEDULE_DESC,
    config: { view: 'schedule', scheduleDaysToShow: 1, scheduleShowDescription: true },
    expect: has('SCHED DESC E2E'),
  },
  {
    // Default anchor: the first column is today at any run time.
    type: 'fullscreen-calendar', name: 'schedule-anchor-today', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', scheduleStartAnchor: 'today', scheduleDaysToShow: 3 },
    expect: async (mod) => {
      await expect(mod.locator('[role="columnheader"]').first()).toContainText(TODAY_EEE);
    },
  },
  {
    // Calendar-stable anchor: the first column is the configured week start
    // (Sunday here) no matter which weekday the test runs on.
    type: 'fullscreen-calendar', name: 'schedule-anchor-start-of-week', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', scheduleStartAnchor: 'start-of-week', startDay: 'sunday', scheduleDaysToShow: 7 },
    expect: async (mod) => {
      await expect(mod.locator('[role="columnheader"]').first()).toContainText('Sun');
    },
  },
  {
    // Weekend anchor with two columns renders a Sat + Sun planning board —
    // including on a Sunday, when the running weekend is kept on screen.
    type: 'fullscreen-calendar', name: 'schedule-anchor-weekend', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', scheduleStartAnchor: 'next-weekend', scheduleDaysToShow: 2 },
    expect: async (mod) => {
      await expect(mod.locator('[role="columnheader"]').first()).toContainText('Sat');
      await expect(mod.locator('[role="columnheader"]').nth(1)).toContainText('Sun');
    },
  },

  // ================= WEEK-LIST VIEW =================

  {
    type: 'fullscreen-calendar', name: 'week-show-description', kind: 'networked', stubKey: 'calendar', stubBody: WEEK_DESC,
    config: { view: 'week-list', weekShowDescription: true },
    expect: has('WEEK DESC E2E'),
  },

  // ================= MONTH-GRID VIEW =================

  {
    // The week-number column adds one empty header cell ahead of the 7 weekday
    // headers (7 → 8).
    type: 'fullscreen-calendar', name: 'month-week-numbers', kind: 'networked', stubKey: 'calendar',
    config: { view: 'month-grid', monthShowWeekNumbers: true },
    expect: count('[role="columnheader"]', 8),
  },
  {
    // Cap of 1 with three same-day events forces a "+2 more" overflow row.
    type: 'fullscreen-calendar', name: 'month-max-events', kind: 'networked', stubKey: 'calendar', stubBody: MONTH_MANY,
    config: { view: 'month-grid', monthMaxEventsPerCell: 1 },
    expect: has('+2 more'),
  },
  {
    // startDay monday shifts the grid so the first day-of-week header reads
    // Mon instead of the Sunday default.
    type: 'fullscreen-calendar', name: 'month-start-day', kind: 'networked', stubKey: 'calendar',
    config: { view: 'month-grid', startDay: 'monday' },
    expect: async (mod) => {
      await expect(mod.locator('[role="columnheader"]').first()).toHaveText('Mon');
    },
  },

  // ================= DAY-TIMELINE VIEW =================

  {
    type: 'fullscreen-calendar', name: 'day-hour-window', kind: 'networked', stubKey: 'calendar',
    config: { view: 'day-timeline', dayHourStart: 9, dayHourEnd: 15 },
    expect: async (mod) => { await has('9 AM')(mod); await expect(mod).not.toContainText('6 AM'); },
  },
  {
    // The default event carries location "123 Main St"; hiding locations drops
    // it while the event title stays.
    type: 'fullscreen-calendar', name: 'day-show-location-off', kind: 'networked', stubKey: 'calendar',
    config: { view: 'day-timeline', dayShowLocation: false },
    expect: async (mod) => { await has('Dentist Appointment')(mod); await expect(mod).not.toContainText('123 Main St'); },
  },
  {
    type: 'fullscreen-calendar', name: 'day-show-description', kind: 'networked', stubKey: 'calendar', stubBody: DAY_DESC,
    config: { view: 'day-timeline', dayShowDescription: true },
    expect: has('DAYDESC E2E'),
  },

  // ================= AGENDA VIEW =================

  {
    // The +20d event only falls inside the window once agendaDaysAhead exceeds
    // the default 14.
    type: 'fullscreen-calendar', name: 'agenda-days-ahead', kind: 'networked', stubKey: 'calendar', stubBody: AGENDA_RANGE,
    config: { view: 'agenda', agendaDaysAhead: 30 },
    expect: has('AGENDA FAR'),
  },
  {
    // Hiding empty days collapses the window to just the one populated day, so
    // no "No events" placeholder is emitted.
    type: 'fullscreen-calendar', name: 'agenda-hide-empty-days', kind: 'networked', stubKey: 'calendar', stubBody: AGENDA_ONE,
    config: { view: 'agenda', agendaHideEmptyDays: true },
    expect: async (mod) => { await has('AGENDA ONLY')(mod); await expect(mod).not.toContainText('No events'); },
  },
  {
    // agendaShowFinishedToday: an event that ended at 00:01 today is present
    // with the flag and gone from the flag-off companion (same feed), so the
    // row fails if the agenda ever stops filtering finished events.
    type: 'fullscreen-calendar', name: 'agenda-show-finished-today', kind: 'networked', stubKey: 'calendar',
    stubBody: [{ id: 'aft1', title: 'AGENDA ENDED TODAY', start: localIso(0, 0, 0), end: localIso(0, 0, 1), allDay: false, calendarColor: BLUE }],
    companions: [{ type: 'fullscreen-calendar', config: { view: 'agenda', agendaShowFinishedToday: false } }],
    config: { view: 'agenda', agendaShowFinishedToday: true },
    expect: async (mod, page) => {
      await has('AGENDA ENDED TODAY')(mod);
      const off = page.locator('[data-module-id="companion-0"]');
      await expect(off).toBeVisible();
      await expect(off).not.toContainText('AGENDA ENDED TODAY');
    },
  },
  {
    type: 'fullscreen-calendar', name: 'agenda-show-description', kind: 'networked', stubKey: 'calendar', stubBody: AGENDA_DESC,
    config: { view: 'agenda', agendaShowDescription: true },
    expect: has('AGENDADESC E2E'),
  },
  {
    // Countdown pill on an upcoming timed event; +2 days at noon reads
    // "in 2 days" at any run time (whole-calendar-day diff beyond 24h).
    type: 'fullscreen-calendar', name: 'agenda-show-countdown', kind: 'networked', stubKey: 'calendar', stubBody: COUNTDOWN_EVENT,
    config: { view: 'agenda', showCountdown: true },
    expect: async (mod) => { await has('COUNTDOWN EVENT')(mod); await has('in 2 days')(mod); },
  },
  {
    // All-day rows are countdown-opt-in (whole days to the row's own date).
    type: 'fullscreen-calendar', name: 'agenda-countdown-all-day', kind: 'networked', stubKey: 'calendar', stubBody: ALLDAY_FUTURE,
    config: { view: 'agenda', showCountdown: true, countdownAllDay: true },
    expect: async (mod) => { await has('ALLDAY FUTURE')(mod); await has('in 3 days')(mod); },
  },
  {
    // The default fixture event spans all of today, so it is running at any
    // run time and the progress bar face of the status slot renders.
    type: 'fullscreen-calendar', name: 'week-show-progress-bar', kind: 'networked', stubKey: 'calendar',
    config: { view: 'week-list', showProgressBar: true },
    expect: async (mod) => {
      await expect(mod.locator('[role="progressbar"]').first()).toBeVisible();
    },
  },
  {
    // Custom wording replaces "No events" on every empty day of the window.
    type: 'fullscreen-calendar', name: 'agenda-empty-day-text', kind: 'networked', stubKey: 'calendar',
    config: { view: 'agenda', emptyDayText: 'FREE DAY E2E' },
    expect: async (mod) => { await has('FREE DAY E2E')(mod); await expect(mod).not.toContainText('No events'); },
  },
  {
    // A 14-day agenda window always crosses at least one week start, so the
    // "Week of" rule renders; month beats week when boundaries coincide.
    type: 'fullscreen-calendar', name: 'agenda-separators', kind: 'networked', stubKey: 'calendar',
    config: { view: 'agenda', agendaSeparators: 'weeks-and-months' },
    expect: has('Week of'),
  },
  {
    // Assert on the legend's own list element, not bare source-name text —
    // AgendaView (and any future view) may render sourceName in event rows,
    // which would make a text-only assertion pass with the legend deleted.
    type: 'fullscreen-calendar', name: 'legend-header', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', showLegend: 'header' },
    expect: async (mod) => {
      await expect(mod.locator('[role="list"][aria-label="Calendar sources"]')).toContainText('Personal');
    },
  },
  {
    // Footer placement of the same legend, on a list view.
    type: 'fullscreen-calendar', name: 'legend-footer', kind: 'networked', stubKey: 'calendar',
    config: { view: 'agenda', showLegend: 'footer' },
    expect: async (mod) => {
      await expect(mod.locator('[role="list"][aria-label="Calendar sources"]')).toContainText('Personal');
    },
  },

  // ================= ROLLING HOURS (schedule + day timeline) =================

  {
    // A rolling window renders its footer strip; the fixed default never does.
    type: 'fullscreen-calendar', name: 'hour-window-rolling', kind: 'networked', stubKey: 'calendar',
    config: { view: 'schedule', hourWindow: 'rolling' },
    expect: async (mod) => {
      await expect(mod.locator('[data-rolling-window]')).toContainText('Showing');
    },
  },
  {
    // The strip names the window, so its span is the configured length at
    // any run time: 4 hours here, modulo the midnight clamp.
    type: 'fullscreen-calendar', name: 'rolling-hours-4', kind: 'networked', stubKey: 'calendar',
    config: { view: 'day-timeline', hourWindow: 'rolling', rollingHours: 4 },
    expect: async (mod) => {
      const strip = mod.locator('[data-rolling-window]');
      await expect(strip).toContainText('Showing');
      const text = (await strip.textContent()) ?? '';
      const m = text.match(/Showing (.+?) – (.+?),/);
      expect(m, text).not.toBeNull();
      const span = (hourOfLabel(m![2].trim()) - hourOfLabel(m![1].trim()) + 24) % 24;
      expect(span).toBe(4);
    },
  },

  // ================= WEEK LIST HOUSEHOLD ROWS =================

  {
    // Tonight's planned dinner from the shared meals store renders as a meal row.
    type: 'fullscreen-calendar', name: 'week-show-meals', kind: 'networked', stubKey: 'calendar', seed: 'meals',
    config: { view: 'week-list', showMeals: true },
    expect: async (mod) => {
      await expect(mod.locator('[data-day-meal]').first()).toContainText('Spaghetti Night');
    },
  },
  {
    // One aggregate chore row per day: the seeded daily chore is 0/1 done.
    type: 'fullscreen-calendar', name: 'week-show-chores', kind: 'networked', stubKey: 'calendar', seed: 'chores',
    config: { view: 'week-list', showChores: true },
    expect: async (mod) => {
      await expect(mod.locator('[data-day-chores]').first()).toContainText('0/1');
    },
  },

  // ================= FAMILY GRID =================

  {
    // An event with no source is unclaimed: it lands on the Everyone row.
    type: 'fullscreen-calendar', name: 'family-everyone-row', kind: 'networked', stubKey: 'calendar',
    stubBody: UNCLAIMED_WEEK,
    config: { view: 'family-grid', familyShowEveryoneRow: true },
    expect: async (mod) => { await has('Everyone')(mod); await has('SHARED EVENT')(mod); },
  },
  {
    // With the Everyone row off, unclaimed events have no row and draw nowhere.
    type: 'fullscreen-calendar', name: 'family-everyone-row-off', kind: 'networked', stubKey: 'calendar',
    stubBody: UNCLAIMED_WEEK,
    config: { view: 'family-grid', familyShowEveryoneRow: false },
    expect: async (mod) => { await lacks(TODAY_EEE, 'Everyone')(mod); await expect(mod).not.toContainText('SHARED EVENT'); },
  },
  {
    // People from settings become rows even when their calendars are empty
    // this week; the stub's 'src-a' event belongs to Alpha Person.
    type: 'fullscreen-calendar', name: 'family-people-rows', kind: 'networked', stubKey: 'calendar',
    stubBody: TOMORROW_MORNING,
    settings: { calendar: {
      googleCalendarId: 'primary', googleCalendarIds: ['primary'], icalSources: [], maxEvents: 50, daysAhead: 7,
      people: [
        { id: 'p1', name: 'Alpha Person', color: '#db2777', sourceIds: ['src-a'] },
        { id: 'p2', name: 'Quiet Person', color: '#059669', sourceIds: ['src-none'] },
      ],
    } },
    config: { view: 'family-grid' },
    expect: async (mod) => {
      await has('Alpha Person')(mod);
      await has('Quiet Person')(mod);
      await expect(mod.locator('[role="rowheader"]')).toHaveCount(2);
    },
  },

  // ================= UP NEXT =================

  {
    // Rows after the hero come from the hero's own day, capped by the count.
    type: 'fullscreen-calendar', name: 'up-next-later-count', kind: 'networked', stubKey: 'calendar',
    stubBody: TOMORROW_MORNING,
    config: { view: 'up-next', upNextLaterCount: 3 },
    expect: async (mod) => { await has('UPNEXT HERO')(mod); await has('LATER EVENT')(mod); },
  },
  {
    // Tomorrow is off so the later-count effect is isolated: with the hero on
    // tomorrow, the Tomorrow section would otherwise re-list what the count hid.
    type: 'fullscreen-calendar', name: 'up-next-later-count-0', kind: 'networked', stubKey: 'calendar',
    stubBody: TOMORROW_MORNING,
    config: { view: 'up-next', upNextLaterCount: 0, upNextShowTomorrow: false },
    expect: lacks('UPNEXT HERO', 'LATER EVENT'),
  },
  {
    // A running event is listed under Earlier while tomorrow's is the hero.
    type: 'fullscreen-calendar', name: 'up-next-show-earlier', kind: 'networked', stubKey: 'calendar',
    stubBody: RUNNING_PLUS_TOMORROW,
    config: { view: 'up-next', upNextShowEarlier: true },
    expect: async (mod) => { await has('UPNEXT HERO')(mod); await has('RUNNING NOW')(mod); },
  },
  {
    type: 'fullscreen-calendar', name: 'up-next-show-earlier-off', kind: 'networked', stubKey: 'calendar',
    stubBody: RUNNING_PLUS_TOMORROW,
    config: { view: 'up-next', upNextShowEarlier: false },
    expect: lacks('UPNEXT HERO', 'RUNNING NOW'),
  },
  {
    // With today's running event as the hero, tomorrow gets its own section.
    type: 'fullscreen-calendar', name: 'up-next-show-tomorrow', kind: 'networked', stubKey: 'calendar',
    stubBody: RUNNING_PLUS_TOMORROW_ALLDAY,
    config: { view: 'up-next', upNextShowTomorrow: true },
    expect: async (mod) => { await has('RUNNING NOW')(mod); await has('TOMORROW ALLDAY')(mod); },
  },
  {
    type: 'fullscreen-calendar', name: 'up-next-show-tomorrow-off', kind: 'networked', stubKey: 'calendar',
    stubBody: RUNNING_PLUS_TOMORROW_ALLDAY,
    config: { view: 'up-next', upNextShowTomorrow: false },
    expect: lacks('RUNNING NOW', 'TOMORROW ALLDAY'),
  },

  // ================= FREE TIME =================

  {
    // The hour axis follows the configured window: a noon start has no 9 AM label.
    // The negative patterns exclude a preceding digit: the view's own header
    // prints the wall clock, so a bare /9 AM/ also matches "10:09 AM" and the
    // assertion turns into a once-an-hour flake.
    type: 'fullscreen-calendar', name: 'free-time-hours', kind: 'networked', stubKey: 'calendar',
    config: { view: 'free-time', freeTimeHourStart: 12, freeTimeHourEnd: 18 },
    expect: async (mod) => { await matches(/12 PM/)(mod); await notMatches(/(?<!\d)9 AM/)(mod); await notMatches(/(?<!\d)8 PM/)(mod); },
  },
  {
    // Free gaps are hatched spans; the all-day-spanning stub event leaves none.
    type: 'fullscreen-calendar', name: 'free-time-end-hour', kind: 'networked', stubKey: 'calendar',
    config: { view: 'free-time', freeTimeHourStart: 7, freeTimeHourEnd: 12 },
    expect: async (mod) => { await matches(/11 AM/)(mod); await notMatches(/(?<!\d)1 PM/)(mod); },
  },
  {
    type: 'fullscreen-calendar', name: 'free-time-show-tomorrow', kind: 'networked', stubKey: 'calendar',
    config: { view: 'free-time', freeTimeShowTomorrow: true },
    expect: matches(/Tomorrow/),
  },
  {
    type: 'fullscreen-calendar', name: 'free-time-show-tomorrow-off', kind: 'networked', stubKey: 'calendar',
    config: { view: 'free-time', freeTimeShowTomorrow: false },
    expect: async (mod) => { await has('Today')(mod); await notMatches(/Tomorrow/)(mod); },
  },
];
