import { describe, it, expect } from 'vitest';
import { computeTimedEventLayout, eventHoursOnDay } from '../calendar-event-layout';

// Local-time ISO strings (with a 'T' and no 'Z') so date parsing reads the
// literal clock hour regardless of the machine timezone.
const iso = (h: number, m = 0, day = 15) =>
  `2026-07-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

const ev = (id: string, startH: number, endH: number, startM = 0, endM = 0) => ({
  id,
  start: iso(startH, startM),
  end: iso(endH, endM),
});

// Local midnight of July 15 / July 16, 2026 — the days the fixtures live on.
const DAY = new Date(2026, 6, 15);
const NEXT_DAY = new Date(2026, 6, 16);

describe('eventHoursOnDay', () => {
  it('returns the literal clock span for a same-day event', () => {
    expect(eventHoursOnDay(ev('a', 9, 10, 0, 30), DAY)).toEqual({ startHour: 9, endHour: 10.5 });
  });

  it('clamps a midnight-crossing event to its start-day segment', () => {
    const overnight = { id: 'o', start: iso(19), end: iso(6, 0, 16) };
    expect(eventHoursOnDay(overnight, DAY)).toEqual({ startHour: 19, endHour: 24 });
  });

  it('clamps a midnight-crossing event to its continuation-day segment', () => {
    const overnight = { id: 'o', start: iso(19), end: iso(6, 0, 16) };
    expect(eventHoursOnDay(overnight, NEXT_DAY)).toEqual({ startHour: 0, endHour: 6 });
  });

  it('spans the full day on middle days of a multi-day event', () => {
    const long = { id: 'l', start: iso(19, 0, 14), end: iso(6, 0, 16) };
    expect(eventHoursOnDay(long, DAY)).toEqual({ startHour: 0, endHour: 24 });
  });

  it('treats end <= start as running to the end of the day', () => {
    expect(eventHoursOnDay(ev('z', 20, 20), DAY)).toEqual({ startHour: 20, endHour: 24 });
    expect(eventHoursOnDay(ev('g', 14, 13), DAY)).toEqual({ startHour: 14, endHour: 24 });
  });

  it('treats an end exactly at next midnight as running to hour 24', () => {
    const untilMidnight = { id: 'm', start: iso(20), end: iso(0, 0, 16) };
    expect(eventHoursOnDay(untilMidnight, DAY)).toEqual({ startHour: 20, endHour: 24 });
  });
});

describe('computeTimedEventLayout', () => {
  const HOUR_START = 6;
  const HOUR_END = 22;

  it('lays a single in-window event out full width with no hidden overflow', () => {
    const { overlapLayout, hiddenStarts } = computeTimedEventLayout(
      [ev('a', 9, 10)],
      DAY,
      HOUR_START,
      HOUR_END,
      'columns',
    );
    expect(overlapLayout.get('a')).toEqual({ left: 0, width: 1, zIndex: 2 });
    expect(hiddenStarts.size).toBe(0);
  });

  it('drops events that fall entirely outside the visible window', () => {
    // 03:00–05:00 is before hourStart 6 → clamps to a degenerate span and is filtered out.
    const { overlapLayout } = computeTimedEventLayout(
      [ev('early', 3, 5)],
      DAY,
      HOUR_START,
      HOUR_END,
      'columns',
    );
    expect(overlapLayout.has('early')).toBe(false);
  });

  it('clamps an event that starts before the window to hourStart', () => {
    // 04:00–10:00 clamps to 6:00–10:00 and stays visible.
    const { overlapLayout } = computeTimedEventLayout(
      [ev('spans-start', 4, 10)],
      DAY,
      HOUR_START,
      HOUR_END,
      'columns',
    );
    expect(overlapLayout.has('spans-start')).toBe(true);
    expect(overlapLayout.get('spans-start')!.width).toBe(1);
  });

  it('treats end <= start as running to the end of the window', () => {
    // end 20:00 == start 20:00 → endHour becomes hourEnd (22), so the event stays visible.
    const { overlapLayout } = computeTimedEventLayout(
      [ev('zero', 20, 20)],
      DAY,
      HOUR_START,
      HOUR_END,
      'columns',
    );
    expect(overlapLayout.has('zero')).toBe(true);
  });

  it('keeps the continuation segment of a midnight-crossing event on the next day', () => {
    // 19:00 → 06:30 next day: on the next day it occupies [0, 6.5), clamping
    // to [6, 6.5) in the visible window and overlapping a 06:00–07:00 event
    // there — both must get columns.
    const overnight = { id: 'overnight', start: iso(19), end: iso(6, 30, 16) };
    const morning = { id: 'morning', start: iso(6, 0, 16), end: iso(7, 0, 16) };
    const { overlapLayout } = computeTimedEventLayout(
      [overnight, morning],
      NEXT_DAY,
      HOUR_START,
      HOUR_END,
      'columns',
    );
    expect(overlapLayout.has('overnight')).toBe(true);
    expect(overlapLayout.get('overnight')!.width).toBeLessThan(1);
    expect(overlapLayout.get('morning')!.width).toBeLessThan(1);
  });

  it('drops a continuation segment that ends before the window opens', () => {
    // 19:00 → 06:00 next day with the grid starting at 6: the next-day
    // segment [0, 6) has nothing visible to draw.
    const overnight = { id: 'overnight', start: iso(19), end: iso(6, 0, 16) };
    const { overlapLayout } = computeTimedEventLayout(
      [overnight],
      NEXT_DAY,
      HOUR_START,
      HOUR_END,
      'columns',
    );
    expect(overlapLayout.has('overnight')).toBe(false);
  });

  it('tallies columns-mode overflow by clamped start hour', () => {
    // Four fully-concurrent events: columns mode shows 3, hides 1 at start hour 9.
    const { overlapLayout, hiddenStarts } = computeTimedEventLayout(
      [ev('a', 9, 12), ev('b', 9, 12), ev('c', 9, 12), ev('d', 9, 12)],
      DAY,
      HOUR_START,
      HOUR_END,
      'columns',
    );
    const hidden = ['a', 'b', 'c', 'd'].filter((id) => overlapLayout.get(id)!.width === 0);
    expect(hidden).toHaveLength(1);
    expect(hiddenStarts.get(9)).toBe(1);
  });

  it('never hides events in stacked mode (no overflow tally)', () => {
    const { overlapLayout, hiddenStarts } = computeTimedEventLayout(
      [ev('a', 9, 12), ev('b', 9, 12), ev('c', 9, 12), ev('d', 9, 12)],
      DAY,
      HOUR_START,
      HOUR_END,
      'stacked',
    );
    expect(['a', 'b', 'c', 'd'].every((id) => overlapLayout.get(id)!.width > 0)).toBe(true);
    expect(hiddenStarts.size).toBe(0);
  });
});

describe('eventHoursOnDay with a display timezone', () => {
  it('reads the clock span in the display timezone, not the OS timezone', () => {
    // 14:00 UTC on Aug 24 is 02:00 on Aug 25 in Auckland (UTC+12). On the
    // Auckland wall date of the 25th the event spans [2, 3], and on the 24th
    // it is not present at all (starts after that day's midnight).
    const ev = { id: 'nz', start: '2026-08-24T14:00:00Z', end: '2026-08-24T15:00:00Z' };
    const tz = 'Pacific/Auckland';
    expect(eventHoursOnDay(ev, new Date(2026, 7, 25), tz)).toEqual({ startHour: 2, endHour: 3 });
  });

  it('passes the timezone through computeTimedEventLayout', () => {
    const ev = { id: 'nz', start: '2026-08-24T14:00:00Z', end: '2026-08-24T15:00:00Z' };
    // Window 0-6: the Auckland reading (02:00-03:00) is inside it; every
    // plausible OS-timezone reading (14:00Z-ish) is outside. Dropping the
    // timezone from the internal eventHoursOnDay call empties the layout,
    // so this fails rather than passing vacuously over a 0-24 window.
    const { overlapLayout, hourSpans } = computeTimedEventLayout([ev], new Date(2026, 7, 25), 0, 6, 'columns', 'Pacific/Auckland');
    expect(overlapLayout.has('nz')).toBe(true);
    expect(hourSpans.get('nz')).toEqual({ startHour: 2, endHour: 3 });
  });

  it('does not treat a DST fall-back wall-time collapse as degenerate data', () => {
    // America/Chicago falls back 2026-11-01: 06:30Z is 01:30 CDT and 07:30Z
    // is 01:30 CST — a real one-hour event whose wall times collide. It must
    // render at its true duration, not balloon to the end of the day.
    const ev = { id: 'dst', start: '2026-11-01T06:30:00Z', end: '2026-11-01T07:30:00Z' };
    expect(eventHoursOnDay(ev, new Date(2026, 10, 1), 'America/Chicago')).toEqual({ startHour: 1.5, endHour: 2.5 });
  });

  it('keeps the end-of-day fallback for truly degenerate zero-length events', () => {
    const ev = { id: 'zero', start: '2026-08-24T14:00:00Z', end: '2026-08-24T14:00:00Z' };
    const { endHour } = eventHoursOnDay(ev, new Date(2026, 7, 25), 'Pacific/Auckland');
    expect(endHour).toBe(24);
  });
});
