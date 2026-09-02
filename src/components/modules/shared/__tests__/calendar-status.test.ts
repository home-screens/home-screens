import { describe, it, expect } from 'vitest';
import { startOfDay } from 'date-fns';
import { toTZWallTime } from '@/lib/timezone';
import type { TranslateFn } from '@/i18n';
import type { CalendarSourceStatus } from '@/types/config';
import { calendarStatusView, formatSince, LOUD_AFTER_MS, GOOGLE_NOT_SIGNED_IN_KEY } from '../useFailingSources';

const TZ = 'America/Chicago';
// 2026-09-01 10:30 in Chicago.
const NOW_INSTANT = new Date('2026-09-01T15:30:00Z');
const NOW = toTZWallTime(NOW_INSTANT, TZ);
const TODAY = startOfDay(NOW);
const HOUR = 60 * 60 * 1000;

// Keys come back verbatim with their params spliced in, so assertions read
// like the en-US strings without depending on the dictionary.
const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')})` : key) as TranslateFn;

const base = { timezone: TZ, timeFormat: '12h' as const, locale: 'en-US', now: NOW, today: TODAY, t };

const source = (over: Partial<CalendarSourceStatus>): CalendarSourceStatus =>
  ({ id: 'a', name: 'School', ok: false, fetchedAt: null, ...over });

describe('formatSince', () => {
  it('shows just the time on the day it happened', () => {
    const at = NOW_INSTANT.getTime() - 76 * 60 * 1000; // 9:14 AM
    expect(formatSince(at, base)).toEqual({ text: '9:14 AM', ageMs: 76 * 60 * 1000 });
  });

  it('says yesterday in the locale after a calendar day, with the time', () => {
    const at = NOW_INSTANT.getTime() - 24 * HOUR; // yesterday 10:30 AM
    const { text, ageMs } = formatSince(at, base);
    expect(text).toBe('yesterday, 10:30 AM');
    expect(ageMs).toBe(24 * HOUR);
  });

  it('falls back to the short weekday and date further back, formatted in the display zone', () => {
    const at = new Date('2026-08-29T14:14:00Z').getTime(); // Sat 8/29, 9:14 AM Chicago
    expect(formatSince(at, base).text).toBe('Sat, 8/29, 9:14 AM');
  });

  it('honors the 24-hour preference and a different locale', () => {
    const at = NOW_INSTANT.getTime() - 76 * 60 * 1000;
    expect(formatSince(at, { ...base, timeFormat: '24h', locale: 'de-DE' }).text).toBe('09:14');
  });
});

describe('calendarStatusView', () => {
  const healthy = { calendarSetup: undefined, calendarStatus: undefined, failingSources: [], hasLiveSource: false };

  it('is quiet when nothing is wrong', () => {
    expect(calendarStatusView({ ...base, ...healthy })).toEqual({ kind: 'ok' });
  });

  it('shows the no-calendars setup card before anything else', () => {
    const view = calendarStatusView({
      ...base, ...healthy, calendarSetup: 'noSources', calendarStatus: { error: 'boom', updatedAt: null },
    });
    expect(view).toMatchObject({ kind: 'setup', setup: 'noSources', title: 'calendar.noSourcesYet', hint: 'calendar.noSourcesYetHint' });
  });

  it('shows the sign-in card when every source the module uses needs a Google sign-in', () => {
    const failing = [source({ id: 'g1', messageKey: GOOGLE_NOT_SIGNED_IN_KEY }), source({ id: 'g2', messageKey: GOOGLE_NOT_SIGNED_IN_KEY })];
    expect(calendarStatusView({ ...base, ...healthy, failingSources: failing })).toMatchObject({ kind: 'setup', setup: 'signIn', title: 'calendar.signInAgain' });
  });

  it('keeps live sources on screen and badges the sign-in problem when other calendars still update', () => {
    const failing = [source({ id: 'g1', messageKey: GOOGLE_NOT_SIGNED_IN_KEY })];
    expect(calendarStatusView({ ...base, ...healthy, failingSources: failing, hasLiveSource: true }))
      .toEqual({ kind: 'badge', text: 'calendar.signInAgain', loud: false });
  });

  it('reports cantLoad for a failing fetch that never succeeded', () => {
    expect(calendarStatusView({ ...base, ...healthy, calendarStatus: { error: 'x', updatedAt: null } })).toEqual({ kind: 'cantLoad' });
  });

  it('badges a failing fetch with kept events quietly on the first failure', () => {
    const updatedAt = NOW_INSTANT.getTime() - 76 * 60 * 1000;
    expect(calendarStatusView({ ...base, ...healthy, calendarStatus: { error: 'x', updatedAt } }))
      .toEqual({ kind: 'badge', text: 'calendar.notUpdatingSince(time=9:14 AM)', loud: false });
  });

  it('gets loud once the fetch has been failing for a day', () => {
    const updatedAt = NOW_INSTANT.getTime() - LOUD_AFTER_MS - 60 * 1000;
    const view = calendarStatusView({ ...base, ...healthy, calendarStatus: { error: 'x', updatedAt } });
    expect(view).toMatchObject({ kind: 'badge', loud: true });
    expect((view as { text: string }).text).toContain('yesterday, ');
  });

  it('names a single failing source with its since-time, holidays by their label', () => {
    const fetchedAt = NOW_INSTANT.getTime() - 76 * 60 * 1000;
    expect(calendarStatusView({ ...base, ...healthy, failingSources: [source({ fetchedAt })], hasLiveSource: true }))
      .toEqual({ kind: 'badge', text: 'calendar.sourceNotUpdating(name=School,time=9:14 AM)', loud: false });
    expect(calendarStatusView({ ...base, ...healthy, failingSources: [source({ id: 'holidays', name: 'Public Holidays' })], hasLiveSource: true }))
      .toEqual({ kind: 'badge', text: 'calendar.sourceNotUpdatingNoTime(name=calendar.publicHolidays)', loud: false });
  });

  it('uses the generic wording for several failing sources and escalates off the newest last-good time', () => {
    const old = NOW_INSTANT.getTime() - 3 * 24 * HOUR;
    const newer = NOW_INSTANT.getTime() - 2 * HOUR;
    const quiet = calendarStatusView({ ...base, ...healthy, hasLiveSource: true,
      failingSources: [source({ id: 'a', fetchedAt: old }), source({ id: 'b', fetchedAt: newer })] });
    expect(quiet).toEqual({ kind: 'badge', text: 'calendar.sourcesNotUpdating', loud: false });
    const loud = calendarStatusView({ ...base, ...healthy, hasLiveSource: true,
      failingSources: [source({ id: 'a', fetchedAt: old }), source({ id: 'b', fetchedAt: old })] });
    expect(loud).toEqual({ kind: 'badge', text: 'calendar.sourcesNotUpdating', loud: true });
  });
});
