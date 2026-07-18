import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, lacks, matches, child, count, redBackground, redStyle } from './shared';

/** Phase-1 batch rows — see .claude/plans/2026-07-09-e2e-100-percent-coverage.md. */

// --- Date helpers (computed at import time, close to test run) --------------

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO local timestamp `dayOffset` days from today at `hour:minute`. */
function calIso(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/** Today's YYYY-MM-DD in local time. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A timed calendar event that spans all of today (00:01 → tomorrow 23:59), so
 * it is always "upcoming" during the test and lands in today's daily/agenda
 * column regardless of wall-clock time.
 */
function todayEvent(id: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, start: calIso(0, 0, 1), end: calIso(1, 23, 59), allDay: false, ...extra };
}

/** A short timed event on `dayOffset` at noon. */
function dayEvent(id: string, title: string, dayOffset: number, extra: Record<string, unknown> = {}) {
  return { id, title, start: calIso(dayOffset, 12), end: calIso(dayOffset, 13), allDay: false, ...extra };
}

// --- The matrix ------------------------------------------------------------

export const TIME_DATE_VARIANTS: ConfigVariant[] = [
  // ================= CLOCK (network-free) =================

  {
    // showDate + a custom dateFormat: the default format ('EEEE, MMMM d') is
    // words, so an ISO-shaped render proves the override took effect. Date-safe:
    // the pattern holds at any wall-clock date.
    type: 'clock', name: 'date-format', kind: 'network-free',
    config: { view: 'classic', showSeconds: false, showDate: true, dateFormat: 'yyyy-MM-dd' },
    expect: matches(/\d{4}-\d{2}-\d{2}/),
  },
  {
    // Analog face with hour numerals: 12 <text> glyphs render only when
    // showNumerals is on (otherwise the hour markers are <line>s).
    type: 'clock', name: 'analog-numerals', kind: 'network-free',
    config: { view: 'analog', showNumerals: true },
    expect: count('svg text', 12),
  },
  {
    // accentColor drives the analog second hand + center cap fill.
    type: 'clock', name: 'analog-accent', kind: 'network-free',
    config: { view: 'analog', accentColor: '#ff0000' },
    expect: child('svg circle[fill="#ff0000"]'),
  },
  {
    // Flip view with animateFlip on: ticking seconds change a digit each second,
    // and the folding flap carries an inline `flip-top-down` animation while it
    // flips (~500ms per second, so Playwright's retry reliably catches it).
    type: 'clock', name: 'flip-animate', kind: 'network-free',
    config: { view: 'flip', showSeconds: true, animateFlip: true },
    expect: child('[style*="flip-top-down"]'),
  },
  {
    // Elapsed view counting DOWN to a FUTURE reference (countUp:false). The
    // existing countUp:true row (core.ts) counts up from a past date and renders
    // "since <label>"; this one renders "until <label>" with days remaining.
    type: 'clock', name: 'elapsed-countdown', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2099-01-01T00:00', referenceLabel: 'E2E COUNTDOWN', countUp: false },
    expect: async (mod) => { await has('until E2E COUNTDOWN')(mod); await matches(/\d+d/)(mod); },
  },

  // ================= DATE (network-free) =================

  {
    // showDayName off: the weekday header disappears while the month still renders.
    type: 'date', name: 'hide-day-name', kind: 'network-free',
    config: { view: 'full', showDayName: false },
    expect: async (mod) => {
      const now = new Date();
      const month = now.toLocaleString('en-US', { month: 'long' });
      const dayName = now.toLocaleString('en-US', { weekday: 'long' });
      await lacks(month, dayName)(mod);
    },
  },
  {
    // showDayOfYear on: a "Day N" line appears.
    type: 'date', name: 'day-of-year', kind: 'network-free',
    config: { view: 'full', showDayOfYear: true },
    expect: matches(/Day \d+/),
  },
  {
    // accentColor tints the large day number (default is cyan #22d3ee).
    type: 'date', name: 'accent-color', kind: 'network-free',
    config: { view: 'full', accentColor: '#ff0000' },
    expect: redStyle('.leading-none', 'color'),
  },

  // ================= YEAR-PROGRESS (network-free) =================

  {
    // showYear off: the current year's bar disappears; the Week bar still renders.
    type: 'year-progress', name: 'hide-year', kind: 'network-free',
    config: { showYear: false },
    expect: async (mod) => { await lacks('Week', String(new Date().getFullYear()))(mod); },
  },
  {
    // showMonth off: the month-name bar disappears; the Week bar still renders.
    type: 'year-progress', name: 'hide-month', kind: 'network-free',
    config: { showMonth: false },
    expect: async (mod) => {
      const month = new Date().toLocaleString('en-US', { month: 'long' });
      await lacks('Week', month)(mod);
    },
  },
  {
    // showDay off: the weekday bar disappears; the Week bar still renders.
    type: 'year-progress', name: 'hide-day', kind: 'network-free',
    config: { showDay: false },
    expect: async (mod) => {
      const dayName = new Date().toLocaleString('en-US', { weekday: 'long' });
      await lacks('Week', dayName)(mod);
    },
  },
  {
    // accentColor set (default is #000000 = no accent): the accent knob span
    // renders on each bar with an accent-colored glow.
    type: 'year-progress', name: 'accent-color', kind: 'network-free',
    config: { accentColor: '#ff0000' },
    expect: async (mod) => {
      const knob = mod.locator('span.rounded-full').first();
      await expect(knob).toBeAttached();
      const shadow = await knob.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(shadow.replace(/\s/g, '')).toMatch(/rgba?\(255,0,0/);
    },
  },

  // ================= MULTI-MONTH (network-free) =================

  {
    // startDay 'monday': the first weekday column header flips from Sun to Mon.
    type: 'multi-month', name: 'start-monday', kind: 'network-free',
    config: { startDay: 'monday' },
    expect: async (mod) => { await expect(mod.locator('div.text-center').first()).toHaveText('Mon'); },
  },
  {
    // showWeekNumbers on: the day-of-week header grid gains a leading week-number
    // column, so its computed grid-template-columns goes from 7 tracks to 8.
    type: 'multi-month', name: 'week-numbers', kind: 'network-free',
    config: { showWeekNumbers: true },
    expect: async (mod) => {
      const headerGrid = mod.locator('div:has(> div.text-center)').first();
      await expect(headerGrid).toBeAttached();
      const cols = await headerGrid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
      expect(cols.trim().split(/\s+/)).toHaveLength(8);
    },
  },
  {
    // highlightWeekends off: the Sunday header (first cell, default startDay
    // sunday) drops from the special weekend opacity (0.25) to the normal
    // tertiary opacity (0.35).
    type: 'multi-month', name: 'no-weekend-highlight', kind: 'network-free',
    config: { highlightWeekends: false },
    expect: async (mod) => {
      const firstHeader = mod.locator('div.text-center').first();
      await expect(firstHeader).toBeAttached();
      const opacity = await firstHeader.evaluate((el) => getComputedStyle(el).opacity);
      expect(opacity).toBe('0.35');
    },
  },
  {
    // showAdjacentDays off: leading/trailing days from neighbouring months are
    // no longer painted (adjacent cells render at opacity 0.15 only when shown).
    type: 'multi-month', name: 'no-adjacent-days', kind: 'network-free',
    config: { showAdjacentDays: false },
    expect: async (mod) => {
      await has(String(new Date().getDate()))(mod); // current-month days still render
      await count('[style*="opacity: 0.15"]', 0)(mod);
    },
  },

  // ================= COUNTDOWN (network-free) =================

  {
    // scale bumps the flip-card font size: basePx = 28 * scale = 42px at 1.5.
    type: 'countdown', name: 'scale', kind: 'network-free',
    config: { view: 'all', scale: 1.5, events: [{ id: 'cd-scale', name: 'CD SCALE', date: '2099-06-01' }] },
    expect: async (mod) => {
      await has('CD SCALE')(mod);
      const block = mod.locator('.items-start.justify-center').first();
      await expect(block).toBeAttached();
      const fs = await block.evaluate((el) => getComputedStyle(el).fontSize);
      expect(fs).toBe('42px');
    },
  },
  {
    // stayUntilEndOfDay keeps a today event that already hit zero visible
    // through the rest of the day (it shows "Today!" instead of being dropped).
    type: 'countdown', name: 'stay-until-end-of-day', kind: 'network-free',
    config: {
      view: 'all', showPastEvents: false, stayUntilEndOfDay: true,
      events: [{ id: 'cd-today', name: 'CD TODAY', date: `${todayStr()}T00:00` }],
    },
    expect: async (mod) => { await has('CD TODAY')(mod); await has('Today!')(mod); },
  },

  // ================= CALENDAR (networked · stubKey 'calendar') =================

  {
    // daysToShow limits the daily view to N day columns; the day+2 event has no
    // column to land in, so it drops while today's stays.
    type: 'calendar', name: 'days-to-show', kind: 'networked', stubKey: 'calendar',
    stubBody: [todayEvent('cd-a', 'CAL TODAY'), dayEvent('cd-b', 'CAL FARDAY', 2)],
    config: { viewMode: 'daily', daysToShow: 1 },
    expect: lacks('CAL TODAY', 'CAL FARDAY'),
  },
  {
    // maxEvents caps the agenda list; the third (latest) event is dropped.
    type: 'calendar', name: 'max-events', kind: 'networked', stubKey: 'calendar',
    stubBody: [
      todayEvent('ce-1', 'AGENDA ONE'),
      dayEvent('ce-2', 'AGENDA TWO', 1),
      dayEvent('ce-3', 'AGENDA THREE', 2),
    ],
    config: { viewMode: 'agenda', maxEvents: 2 },
    expect: async (mod) => {
      await has('AGENDA ONE')(mod);
      await has('AGENDA TWO')(mod);
      await expect(mod).not.toContainText('AGENDA THREE');
    },
  },
  {
    // showWeekNumbers adds the "Wk" column + week number to the week grid.
    type: 'calendar', name: 'week-numbers', kind: 'networked', stubKey: 'calendar',
    stubBody: [todayEvent('cw-1', 'CAL WEEK')],
    config: { viewMode: 'week', showWeekNumbers: true },
    expect: has('Wk'),
  },
  {
    // accentColor tints the event indicator bar when the event has no color of
    // its own (default accent is #3b82f6).
    type: 'calendar', name: 'accent-color', kind: 'networked', stubKey: 'calendar',
    stubBody: [todayEvent('ca-1', 'CAL ACCENT')],
    config: { viewMode: 'daily', accentColor: '#ff0000' },
    expect: redBackground('.self-stretch'),
  },
  {
    // dailyShowDescription renders the sanitized event description in daily view.
    type: 'calendar', name: 'daily-description', kind: 'networked', stubKey: 'calendar',
    stubBody: [todayEvent('cdd-1', 'CAL DAILY', { description: 'CAL DAILY DESC' })],
    config: { viewMode: 'daily', dailyShowDescription: true },
    expect: has('CAL DAILY DESC'),
  },
  {
    // agendaShowDescription renders the sanitized description in agenda view.
    type: 'calendar', name: 'agenda-description', kind: 'networked', stubKey: 'calendar',
    stubBody: [todayEvent('cad-1', 'CAL AGENDA', { description: 'CAL AGENDA DESC' })],
    config: { viewMode: 'agenda', agendaShowDescription: true },
    expect: has('CAL AGENDA DESC'),
  },
];
