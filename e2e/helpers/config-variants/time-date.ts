import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, lacks, matches, notMatches, child, count, redBackground, redStyle } from './shared';
import { parseDateInTZ } from '@/lib/timezone';

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

/** A YYYY-MM-DD `dayOffset` days from today (all-day event bounds). */
function dateStr(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
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
  {
    // elapsedFormat 'unitsUpper' is the same shape as the default 'units'
    // but with capitalized unit letters — the "50D" example from the issue.
    type: 'clock', name: 'elapsed-format-units-upper', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00', referenceLabel: 'E2E UPPER', elapsedFormat: 'unitsUpper', elapsedPrecision: 'daysHoursMinutes' },
    expect: async (mod) => { await matches(/\d+D \d+H \d+M/)(mod); await notMatches(/\d+d\b/)(mod); },
  },
  {
    // elapsedFormat 'unitsShort' is the same shape as 'units' but with
    // abbreviated-word suffixes instead of single letters, and no space
    // between the number and the word (matches the 'units'/'unitsUpper'
    // convention rather than the spaced 'words' convention).
    type: 'clock', name: 'elapsed-format-units-short', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00', referenceLabel: 'E2E SHORT', elapsedFormat: 'unitsShort', elapsedPrecision: 'daysHoursMinutes' },
    expect: async (mod) => { await matches(/\d+day \d+hr \d+min/)(mod); await notMatches(/\d+d\b/)(mod); },
  },
  {
    // elapsedFormat 'colon' renders colon-joined zero-padded digits instead
    // of the default "Nd Nh Nm" unit-letter style. A fixed years-old
    // referenceTime guarantees days/hours/minutes are all non-zero (and thus
    // all three colon segments render) regardless of wall-clock time.
    type: 'clock', name: 'elapsed-format-colon', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00', referenceLabel: 'E2E COLON', elapsedFormat: 'colon' },
    expect: async (mod) => { await matches(/\d+:\d{2}:\d{2}/)(mod); await notMatches(/\d+d\b/)(mod); },
  },
  {
    // elapsedFormat 'words' renders localized long-form unit words via
    // Intl.DurationFormat — a distinct render path from the unit-letter
    // styles and 'colon', so it gets its own discriminator row (see
    // EXTRA_DISCRIMINATORS below).
    type: 'clock', name: 'elapsed-format-words', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00', referenceLabel: 'E2E WORDS', elapsedFormat: 'words' },
    expect: async (mod) => { await matches(/\d+ days?[\s\S]*\d+ hours?[\s\S]*\d+ minutes?/)(mod); await notMatches(/\d+d\b/)(mod); },
  },
  {
    // elapsedFormat 'wordsTitle' is the same localized rendering as 'words'
    // but with each unit word capitalized (the "50 Days" example) — proves
    // the formatToParts-based capitalization actually reaches the DOM.
    type: 'clock', name: 'elapsed-format-words-title', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00', referenceLabel: 'E2E TITLE', elapsedFormat: 'wordsTitle' },
    expect: matches(/\d+ Days?[\s\S]*\d+ Hours?[\s\S]*\d+ Minutes?/),
  },
  {
    // elapsedPrecision 'days' truncates to a bare day count with no smaller
    // units — proves the precision axis works independent of format. The
    // same years-old referenceTime would otherwise force hours into the
    // default 'auto' output, so the absence of an "Nh" segment is the proof.
    type: 'clock', name: 'elapsed-precision-days', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00', referenceLabel: 'E2E DAYS', elapsedPrecision: 'days' },
    // No trailing `\b` after the unit letter — textContent concatenates the
    // value div directly against the adjacent "since/until" label div with
    // no separating whitespace, so e.g. "2393d" butts against "since..."
    // with no word boundary between the two word characters ('d', 's').
    expect: async (mod) => { await matches(/\d+d/)(mod); await notMatches(/\d+h/)(mod); },
  },
  {
    // Remaining ElapsedPrecision members: 'daysHours' shows exactly two
    // units (no minutes)...
    type: 'clock', name: 'elapsed-precision-days-hours', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00', referenceLabel: 'E2E DAYS HOURS', elapsedPrecision: 'daysHours' },
    expect: async (mod) => { await matches(/\d+d \d+h/)(mod); await notMatches(/\d+m/)(mod); },
  },
  {
    // ...and 'daysHoursMinutesSeconds' shows all four.
    type: 'clock', name: 'elapsed-precision-all-units', kind: 'network-free',
    config: { view: 'elapsed', referenceTime: '2020-01-01T00:00', referenceLabel: 'E2E ALL UNITS', elapsedPrecision: 'daysHoursMinutesSeconds' },
    expect: matches(/\d+d \d+h \d+m \d+s/),
  },
  {
    // Per-module timezone: display pinned to UTC, module to Pacific/Kiritimati
    // (UTC+14). A 14h offset is never 0 mod 24h, so the 24h HH:MM render can't
    // coincide with a no-override render. Tolerates a minute rollover between
    // render and check (the clock re-renders every 60s, so toPass retries hit
    // the next minute).
    type: 'clock', name: 'timezone', kind: 'network-free',
    settings: { timezone: 'UTC' },
    config: { view: 'classic', format24h: true, showSeconds: false, showDate: false, timezone: 'Pacific/Kiritimati' },
    expect: async (mod) => {
      await expect(async () => {
        const text = (await mod.innerText()) ?? '';
        const fmt = new Intl.DateTimeFormat('en-US', {
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Pacific/Kiritimati',
        });
        const now = new Date();
        const candidates = [
          fmt.format(now),
          fmt.format(new Date(now.getTime() - 60_000)),
          fmt.format(new Date(now.getTime() + 60_000)),
        ];
        if (!candidates.some((c) => text.includes(c))) {
          throw new Error(`expected Kiritimati time [${candidates.join(' / ')}] in "${text}"`);
        }
      }).toPass({ timeout: 15_000 });
    },
  },
  {
    // Module timezone must NOT skew elapsed math: the reference parses in the
    // module's zone (Asia/Tokyo) while the display sits on Europe/Berlin —
    // the count must equal real time since 2000-01-01T12:00 Tokyo. Guards the
    // useRealClock fix; the pre-fix shifted-clock math would be off by the
    // module-tz − OS-tz offset (7h on the UTC CI runner, 0 only on a UTC+9 OS — the guard's blind spot).
    type: 'clock', name: 'elapsed-timezone-invariance', kind: 'network-free',
    settings: { timezone: 'Europe/Berlin' },
    config: { view: 'elapsed', referenceTime: '2000-01-01T12:00', countUp: true, elapsedFormat: 'colon', elapsedPrecision: 'auto', timezone: 'Asia/Tokyo' },
    expect: async (mod) => {
      await expect(async () => {
        const text = (await mod.innerText()) ?? '';
        const m = text.match(/(\d+):(\d{2}):(\d{2}):(\d{2})/);
        if (!m) throw new Error(`no DD:HH:MM:SS colon render in "${text}"`);
        const shownMinutes = Number(m[1]) * 1440 + Number(m[2]) * 60 + Number(m[3]);
        const ref = parseDateInTZ('2000-01-01T12:00', 'Asia/Tokyo');
        const expectedMinutes = (Date.now() - ref.getTime()) / 60_000;
        if (Math.abs(shownMinutes - expectedMinutes) > 2) {
          throw new Error(`elapsed skew: shown ${shownMinutes}m vs expected ${expectedMinutes.toFixed(1)}m`);
        }
      }).toPass({ timeout: 15_000 });
    },
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
  {
    // 25-hour gap (UTC+14 display vs UTC-11 module) means the module's
    // calendar date is ALWAYS exactly one day behind the display's — there is
    // no wall-clock window where a no-override render could pass by coincidence.
    // Yesterday tolerance covers a midnight flip between render and check.
    type: 'date', name: 'timezone', kind: 'network-free',
    settings: { timezone: 'Pacific/Kiritimati' },
    config: { view: 'minimal', dateFormat: 'yyyy-MM-dd', timezone: 'Pacific/Niue' },
    expect: async (mod) => {
      await expect(async () => {
        const text = (await mod.innerText()) ?? '';
        const fmt = new Intl.DateTimeFormat('en-CA', {
          year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Pacific/Niue',
        });
        const now = new Date();
        const candidates = [fmt.format(now), fmt.format(new Date(now.getTime() - 86_400_000))];
        if (!candidates.some((c) => text.includes(c))) {
          throw new Error(`expected Niue date [${candidates.join(' / ')}] in "${text}"`);
        }
      }).toPass({ timeout: 15_000 });
    },
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
    // `scale` is view-independent: the Next view must resolve to the SAME
    // 42px as the All view row above at scale 1.5. It used to render at
    // basePx * 1.3, which made scale non-comparable across views (scale 3.4
    // on Next out-rendered scale 4 on All). Keep the expected value here
    // identical to the 'scale' row's — that equality IS the assertion.
    type: 'countdown', name: 'scale-view-independent', kind: 'network-free',
    config: { view: 'next', scale: 1.5, events: [{ id: 'cd-next-scale', name: 'CD NEXT SCALE', date: '2099-06-01' }] },
    expect: async (mod) => {
      await has('CD NEXT SCALE')(mod);
      const block = mod.locator('.items-start.justify-center').first();
      await expect(block).toBeAttached();
      const fs = await block.evaluate((el) => getComputedStyle(el).fontSize);
      expect(fs).toBe('42px');
      // The heading tracks scale by the same 14x coefficient the All view
      // uses, so migrating the stored scale by 1.3 leaves it ~unchanged.
      const heading = mod.getByText('CD NEXT SCALE');
      const hs = await heading.evaluate((el) => getComputedStyle(el).fontSize);
      expect(hs).toBe('21px'); // 14 * 1.5
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

  // --- Countdown format axis (shared with Clock's elapsed formatter,
  // src/lib/duration-format.ts). Each row is a single far-future event
  // (days > 0), so countdown's 'auto' precision shows days/hours/minutes/
  // seconds and every text format renders all four units. 'flip' is the
  // registry default and rides the static matrix, so only the six text
  // formats get rows here (see EXTRA_DISCRIMINATORS in coverage.spec.ts).
  {
    // format 'units' replaces the flip cards with the "Nd Nh Nm Ns" unit-letter
    // text (countdown auto includes seconds, unlike clock's elapsed auto).
    type: 'countdown', name: 'format-units', kind: 'network-free',
    config: { view: 'all', format: 'units', events: [{ id: 'cd-fmt-units', name: 'CD FMT UNITS', date: '2099-06-01' }] },
    expect: matches(/\d+d \d+h \d+m \d+s/),
  },
  {
    // format 'unitsUpper' is the same shape with capitalized unit letters — the
    // absence of a lowercase "Nd" proves the uppercasing reached the DOM.
    type: 'countdown', name: 'format-units-upper', kind: 'network-free',
    config: { view: 'all', format: 'unitsUpper', events: [{ id: 'cd-fmt-upper', name: 'CD FMT UPPER', date: '2099-06-01' }] },
    expect: async (mod) => { await matches(/\d+D \d+H \d+M \d+S/)(mod); await notMatches(/\d+d\b/)(mod); },
  },
  {
    // format 'unitsShort' swaps single letters for abbreviated words with no
    // space between number and word (Nday Nhr Nmin Nsec).
    type: 'countdown', name: 'format-units-short', kind: 'network-free',
    config: { view: 'all', format: 'unitsShort', events: [{ id: 'cd-fmt-short', name: 'CD FMT SHORT', date: '2099-06-01' }] },
    expect: async (mod) => { await matches(/\d+day \d+hr \d+min \d+sec/)(mod); await notMatches(/\d+d\b/)(mod); },
  },
  {
    // format 'colon' renders colon-joined digits (first segment unpadded, the
    // rest 2-padded) instead of the unit-letter style.
    type: 'countdown', name: 'format-colon', kind: 'network-free',
    config: { view: 'all', format: 'colon', events: [{ id: 'cd-fmt-colon', name: 'CD FMT COLON', date: '2099-06-01' }] },
    expect: async (mod) => { await matches(/\d+:\d{2}:\d{2}:\d{2}/)(mod); await notMatches(/\d+d\b/)(mod); },
  },
  {
    // format 'words' renders localized long-form unit words via
    // Intl.DurationFormat (falls back to space-joined English words when the
    // API is unavailable; the [\s\S]* gaps match either separator style).
    type: 'countdown', name: 'format-words', kind: 'network-free',
    config: { view: 'all', format: 'words', events: [{ id: 'cd-fmt-words', name: 'CD FMT WORDS', date: '2099-06-01' }] },
    expect: async (mod) => { await matches(/\d+ days?[\s\S]*\d+ hours?[\s\S]*\d+ minutes?[\s\S]*\d+ seconds?/)(mod); await notMatches(/\d+d\b/)(mod); },
  },
  {
    // format 'wordsTitle' is the same localized rendering with each unit word
    // capitalized (the "50 Days" example).
    type: 'countdown', name: 'format-words-title', kind: 'network-free',
    config: { view: 'all', format: 'wordsTitle', events: [{ id: 'cd-fmt-title', name: 'CD FMT TITLE', date: '2099-06-01' }] },
    expect: matches(/\d+ Days?[\s\S]*\d+ Hours?[\s\S]*\d+ Minutes?[\s\S]*\d+ Seconds?/),
  },

  // --- Countdown precision axis. Members are fixed unit sets shown
  // unconditionally; 'auto' is the registry default (static matrix), so the
  // four named precisions get rows here.
  {
    // precision 'days' with the default flip format proves precision reshapes
    // the FLIP look, not just the text formats: only the days card renders, so
    // the hrs/min/sec unit labels are all absent (the far-future event has
    // days > 0). Labels come from countdown.unit* in the modules dictionary
    // (days/hrs/min/sec); the digit-free event name can't false-match them.
    type: 'countdown', name: 'precision-days-flip', kind: 'network-free',
    config: { view: 'all', precision: 'days', events: [{ id: 'cd-prec-days', name: 'CD PREC FLIP', date: '2099-06-01' }] },
    expect: async (mod) => {
      await has('days')(mod);
      await expect(mod).not.toContainText('hrs');
      await expect(mod).not.toContainText('min');
      await expect(mod).not.toContainText('sec');
    },
  },
  {
    // precision 'daysHours' + format 'units' shows exactly two units, no
    // minutes segment.
    type: 'countdown', name: 'precision-days-hours', kind: 'network-free',
    config: { view: 'all', format: 'units', precision: 'daysHours', events: [{ id: 'cd-prec-dh', name: 'CD PREC DH', date: '2099-06-01' }] },
    expect: async (mod) => { await matches(/\d+d \d+h/)(mod); await notMatches(/\d+m/)(mod); },
  },
  {
    // precision 'daysHoursMinutes' + format 'units' shows three units and drops
    // seconds. The value div is the last child (nothing follows to concatenate
    // against), and the event name is digit-free, so `\d+s` can't false-match.
    type: 'countdown', name: 'precision-days-hours-minutes', kind: 'network-free',
    config: { view: 'all', format: 'units', precision: 'daysHoursMinutes', events: [{ id: 'cd-prec-dhm', name: 'CD PREC DHM', date: '2099-06-01' }] },
    expect: async (mod) => { await matches(/\d+d \d+h \d+m/)(mod); await notMatches(/\d+s/)(mod); },
  },
  {
    // precision 'daysHoursMinutesSeconds' + format 'units' shows all four units.
    // Identical output to 'auto' only when days = 0; this row's job is member
    // coverage, so a far-future event is fine.
    type: 'countdown', name: 'precision-all-units', kind: 'network-free',
    config: { view: 'all', format: 'units', precision: 'daysHoursMinutesSeconds', events: [{ id: 'cd-prec-dhms', name: 'CD PREC DHMS', date: '2099-06-01' }] },
    expect: matches(/\d+d \d+h \d+m \d+s/),
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
  {
    // weeksToShow caps the multi-week grid at N rows; the day+31 event has no
    // row at 4 weeks but WOULD render at the 6-week default, so its absence
    // proves the cap took effect. The timed-today event stays in row 1.
    type: 'calendar', name: 'weeks-to-show', kind: 'networked', stubKey: 'calendar',
    stubBody: [todayEvent('cwts-1', 'CAL NEAR'), dayEvent('cwts-2', 'CAL FARWEEK', 31)],
    config: { viewMode: 'multi-week', weeksToShow: 4 },
    expect: lacks('CAL NEAR', 'CAL FARWEEK'),
  },
  {
    // multiWeekMaxEventsPerCell caps pills per day cell; three single-day
    // timed events on day+1, cap 2 shows the first two, hides the third, and
    // "+1 more" reports it.
    type: 'calendar', name: 'events-per-cell', kind: 'networked', stubKey: 'calendar',
    stubBody: [
      { id: 'cwec-1', title: 'CAL CAP ONE', start: calIso(1, 8), end: calIso(1, 9), allDay: false },
      { id: 'cwec-2', title: 'CAL CAP TWO', start: calIso(1, 10), end: calIso(1, 11), allDay: false },
      { id: 'cwec-3', title: 'CAL CAP THREE', start: calIso(1, 12), end: calIso(1, 13), allDay: false },
    ],
    config: { viewMode: 'multi-week', multiWeekMaxEventsPerCell: 2 },
    expect: async (mod) => {
      await expect(mod).toContainText('CAL CAP ONE');
      await expect(mod).toContainText('CAL CAP TWO');
      await expect(mod).not.toContainText('CAL CAP THREE');
      await expect(mod).toContainText('+1 more');
    },
  },
  {
    // startDay monday shifts the grid so the first day-of-week header reads Mon.
    type: 'calendar', name: 'start-day', kind: 'networked', stubKey: 'calendar',
    stubBody: [todayEvent('cwsd-1', 'CAL STARTDAY')],
    config: { viewMode: 'multi-week', startDay: 'monday' },
    expect: async (mod) => {
      await expect(mod.locator('.grid').first().locator('div.text-center'))
        .toHaveText(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    },
  },
  {
    // Colored style: the all-day event renders a solid calendar-color pill with
    // auto-contrast text (yellow is bright, so near-black #1b1b1f text), while
    // the timed event carries no background of its own and paints its calendar
    // color on the time + title spans instead.
    type: 'calendar', name: 'grid-event-style-colored', kind: 'networked', stubKey: 'calendar',
    stubBody: [
      // All-day bounds are date-only with an exclusive end (next day).
      todayEvent('cges-a', 'CAL SOLID', { allDay: true, start: dateStr(0), end: dateStr(1), calendarColor: '#eab308' }),
      todayEvent('cges-b', 'CAL TIMED', { calendarColor: '#3b82f6' }),
    ],
    config: { viewMode: 'multi-week', gridEventStyle: 'colored' },
    expect: async (mod) => {
      const solid = mod.locator('[data-event-id="cges-a"]');
      await expect(solid).toHaveCSS('background-color', 'rgb(234, 179, 8)');
      await expect(solid).toHaveCSS('color', 'rgb(27, 27, 31)');
      // todayEvent crosses midnight, so it renders in two grid cells; both
      // pills are identical, so asserting the first suffices.
      const timed = mod.locator('[data-event-id="cges-b"]').first();
      await expect(timed).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(timed.locator('span').first()).toHaveCSS('color', 'rgb(59, 130, 246)');
    },
  },
  {
    // The timed-pill toggle adds the faint background in colored mode (without
    // it the colored timed row above asserts the bare no-background render).
    type: 'calendar', name: 'grid-event-pill-background', kind: 'networked', stubKey: 'calendar',
    stubBody: [todayEvent('cgp-a', 'CAL PILLED', { calendarColor: '#3b82f6' })],
    config: { viewMode: 'multi-week', gridEventStyle: 'colored', gridEventPillBackground: true },
    expect: async (mod) => {
      await expect(mod.locator('[data-event-id="cgp-a"]').first()).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.1)');
    },
  },
];
