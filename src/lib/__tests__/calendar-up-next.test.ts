import { describe, it, expect } from 'vitest';
import { buildUpNextModel } from '@/lib/calendar-up-next';
import type { CalendarEvent } from '@/types/config';

// Local-naive ISO strings so parsing reads the literal clock in any machine
// timezone. Wednesday, 15 July 2026; "now" is noon.
const iso = (day: number, h: number, m = 0) =>
  `2026-07-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
const ev = (id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title: id, start, end, allDay: false, ...extra } as CalendarEvent);

const NOW = new Date(2026, 6, 15, 12, 0, 0);
const TODAY = new Date(2026, 6, 15);
const OPTS = { laterCount: 3, showEarlier: true, showTomorrow: true };

describe('buildUpNextModel', () => {
  it('picks the nearest upcoming event as hero and lists the rest of its day', () => {
    const model = buildUpNextModel([
      ev('u2', iso(15, 15), iso(15, 16)),
      ev('u1', iso(15, 13), iso(15, 14)),
      ev('u3', iso(15, 17), iso(15, 18)),
      ev('finished', iso(15, 9), iso(15, 10)),
      ev('allday', '2026-07-15', '2026-07-16', { allDay: true }),
    ], NOW, TODAY, OPTS);
    expect(model.hero?.ev.id).toBe('u1');
    expect(model.heroIsRunning).toBe(false);
    expect(model.heroToday).toBe(true);
    expect(model.later.map((x) => x.ev.id)).toEqual(['u2', 'u3']);
    expect(model.earlier.map((x) => x.ev.id)).toEqual(['finished']);
    expect(model.allDayToday.map((e) => e.id)).toEqual(['allday']);
    expect(model.remainingToday).toBe(3);
    expect(model.hasAnyUpcoming).toBe(true);
  });

  it('falls back to a running event as hero when nothing is upcoming', () => {
    const model = buildUpNextModel([ev('run', iso(15, 11), iso(15, 13))], NOW, TODAY, OPTS);
    expect(model.hero?.ev.id).toBe('run');
    expect(model.heroIsRunning).toBe(true);
    // The running hero never doubles as an Earlier row.
    expect(model.earlier).toEqual([]);
    expect(model.remainingToday).toBe(0);
  });

  it('puts the hero on a future day and scopes "later" to that day', () => {
    const model = buildUpNextModel([
      ev('fri1', iso(17, 9), iso(17, 10)),
      ev('fri2', iso(17, 11), iso(17, 12)),
    ], NOW, TODAY, OPTS);
    expect(model.hero?.ev.id).toBe('fri1');
    expect(model.heroToday).toBe(false);
    expect(model.heroDay.getDate()).toBe(17);
    expect(model.later.map((x) => x.ev.id)).toEqual(['fri2']);
    expect(model.remainingToday).toBe(0);
  });

  it('excludes still-running multi-day events and already-shown ids from Tomorrow', () => {
    const model = buildUpNextModel([
      // Running now, spilling into tomorrow: Now/Earlier story, never Tomorrow.
      ev('spill', iso(15, 11), iso(16, 13)),
      ev('t1', iso(16, 9), iso(16, 10)),
      ev('t-allday', '2026-07-16', '2026-07-17', { allDay: true }),
    ], NOW, TODAY, OPTS);
    // The nearest upcoming event is tomorrow's t1, so it heroes (on a future
    // day) and leaves the Tomorrow list; the running spill-over stays the
    // Earlier story and never joins Tomorrow either.
    expect(model.hero?.ev.id).toBe('t1');
    expect(model.heroToday).toBe(false);
    expect(model.tomorrowRows.map((e) => e.id)).toEqual(['t-allday']);
    expect(model.earlier.map((x) => x.ev.id)).toEqual(['spill']);
  });

  it('caps finished rows at two (most recent first) and keeps running rows uncapped', () => {
    const model = buildUpNextModel([
      ev('hero', iso(15, 13), iso(15, 14)),
      ev('run', iso(15, 11), iso(15, 13)),
      ev('f1', iso(15, 8), iso(15, 9)),
      ev('f2', iso(15, 9), iso(15, 10)),
      ev('f3', iso(15, 10), iso(15, 11)),
    ], NOW, TODAY, OPTS);
    expect(model.earlier.map((x) => x.ev.id)).toEqual(['run', 'f3', 'f2']);
  });

  it('honors showEarlier / showTomorrow toggles', () => {
    const events = [
      ev('hero', iso(15, 13), iso(15, 14)),
      ev('f1', iso(15, 8), iso(15, 9)),
      ev('t1', iso(16, 9), iso(16, 10)),
    ];
    const model = buildUpNextModel(events, NOW, TODAY, { ...OPTS, showEarlier: false, showTomorrow: false });
    expect(model.earlier).toEqual([]);
    expect(model.tomorrowRows).toEqual([]);
  });
});
