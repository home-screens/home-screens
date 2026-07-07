import { describe, it, expect } from 'vitest';
import { computeTimedEventLayout, parseTimeToHours } from '../event-layout';

// Local-time ISO strings (with a 'T' and no 'Z') so parseTimeToHours reads the
// literal clock hour regardless of the machine timezone.
const iso = (h: number, m = 0) =>
  `2026-07-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

const ev = (id: string, startH: number, endH: number, startM = 0, endM = 0) => ({
  id,
  start: iso(startH, startM),
  end: iso(endH, endM),
});

describe('parseTimeToHours', () => {
  it('converts an ISO clock time to fractional hours', () => {
    expect(parseTimeToHours(iso(14, 30))).toBe(14.5);
    expect(parseTimeToHours(iso(0, 0))).toBe(0);
    expect(parseTimeToHours(iso(23, 15))).toBe(23.25);
  });
});

describe('computeTimedEventLayout', () => {
  const HOUR_START = 6;
  const HOUR_END = 22;

  it('lays a single in-window event out full width with no hidden overflow', () => {
    const { overlapLayout, hiddenStarts } = computeTimedEventLayout(
      [ev('a', 9, 10)],
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
      HOUR_START,
      HOUR_END,
      'columns',
    );
    expect(overlapLayout.has('zero')).toBe(true);
  });

  it('tallies columns-mode overflow by clamped start hour', () => {
    // Four fully-concurrent events: columns mode shows 3, hides 1 at start hour 9.
    const { overlapLayout, hiddenStarts } = computeTimedEventLayout(
      [ev('a', 9, 12), ev('b', 9, 12), ev('c', 9, 12), ev('d', 9, 12)],
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
      HOUR_START,
      HOUR_END,
      'stacked',
    );
    expect(['a', 'b', 'c', 'd'].every((id) => overlapLayout.get(id)!.width > 0)).toBe(true);
    expect(hiddenStarts.size).toBe(0);
  });
});
