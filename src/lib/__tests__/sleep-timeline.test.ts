import { describe, it, expect } from 'vitest';
import { computeTimelineSegments, isInstantInScheduleWindow, isMinuteInScheduleWindow } from '../sleep-timeline';
import { wallClockParts } from '../timezone';

describe('computeTimelineSegments', () => {
  it('returns a single bright segment when no windows are set', () => {
    expect(computeTimelineSegments()).toEqual([
      { state: 'bright', startMin: 0, endMin: 1440 },
    ]);
  });

  it('splits an overnight sleep window across midnight', () => {
    const segments = computeTimelineSegments(undefined, { startTime: '23:00', endTime: '06:00' });
    expect(segments).toEqual([
      { state: 'off', startMin: 0, endMin: 360 },
      { state: 'bright', startMin: 360, endMin: 1380 },
      { state: 'off', startMin: 1380, endMin: 1440 },
    ]);
  });

  it('renders a same-day dim window in place', () => {
    const segments = computeTimelineSegments({ startTime: '09:00', endTime: '17:00' });
    expect(segments).toEqual([
      { state: 'bright', startMin: 0, endMin: 540 },
      { state: 'dim', startMin: 540, endMin: 1020 },
      { state: 'bright', startMin: 1020, endMin: 1440 },
    ]);
  });

  it('lets the sleep window win where the two overlap, matching the runtime', () => {
    // Dim 20:30–02:00 overlaps sleep 23:00–06:00; useSleepManager checks the
    // sleep window first, so 23:00 onward must be off, not dimmed.
    const segments = computeTimelineSegments(
      { startTime: '20:30', endTime: '02:00' },
      { startTime: '23:00', endTime: '06:00' },
    );
    expect(segments).toEqual([
      { state: 'off', startMin: 0, endMin: 360 },
      { state: 'bright', startMin: 360, endMin: 1230 },
      { state: 'dim', startMin: 1230, endMin: 1380 },
      { state: 'off', startMin: 1380, endMin: 1440 },
    ]);
  });

  it('treats a zero-length window as no window, like isInScheduleWindow', () => {
    expect(computeTimelineSegments({ startTime: '12:00', endTime: '12:00' })).toEqual([
      { state: 'bright', startMin: 0, endMin: 1440 },
    ]);
  });

  it('treats an end time of 00:00 as next-day midnight, matching the runtime', () => {
    // The case the hook's own schedule tests single out: 22:00–00:00 is an
    // overnight window whose membership ends exactly at midnight.
    const segments = computeTimelineSegments(undefined, { startTime: '22:00', endTime: '00:00' });
    expect(segments).toEqual([
      { state: 'bright', startMin: 0, endMin: 1320 },
      { state: 'off', startMin: 1320, endMin: 1440 },
    ]);
  });

  it('ignores a window with a cleared time input instead of rendering NaN widths', () => {
    // <input type="time"> can be cleared, persisting ''. The invalid window
    // must vanish (fail-safe, same as the runtime predicate) rather than
    // poisoning the boundary sort with NaN.
    expect(computeTimelineSegments({ startTime: '', endTime: '06:00' })).toEqual([
      { state: 'bright', startMin: 0, endMin: 1440 },
    ]);
    expect(computeTimelineSegments(undefined, { startTime: '23:00', endTime: '99:99' })).toEqual([
      { state: 'bright', startMin: 0, endMin: 1440 },
    ]);
  });

  it('merges segments that touch at midnight without a seam', () => {
    // A dim window ending exactly where sleep begins produces three clean
    // segments, not four with a zero-width sliver.
    const segments = computeTimelineSegments(
      { startTime: '20:00', endTime: '23:00' },
      { startTime: '23:00', endTime: '06:00' },
    );
    expect(segments).toEqual([
      { state: 'off', startMin: 0, endMin: 360 },
      { state: 'bright', startMin: 360, endMin: 1200 },
      { state: 'dim', startMin: 1200, endMin: 1380 },
      { state: 'off', startMin: 1380, endMin: 1440 },
    ]);
  });
});

describe('isInstantInScheduleWindow', () => {
  const CHICAGO = 'America/Chicago';
  const at = (iso: string) => new Date(iso);

  it('agrees with the minute test at every minute of an ordinary day', () => {
    const windows = [
      { startTime: '22:00', endTime: '06:00' },
      { startTime: '09:00', endTime: '17:00' },
      { startTime: '00:00', endTime: '06:00' },
      { startTime: '12:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '14:01' },
    ];
    // 2026-09-24 in Chicago, CDT all day.
    const from = at('2026-09-24T05:00:00Z').getTime();
    for (let m = 0; m < 1440; m++) {
      const instant = new Date(from + m * 60_000);
      const minute = wallClockParts(instant, CHICAGO).minuteOfDay;
      for (const w of windows) {
        expect(isInstantInScheduleWindow(w, instant, CHICAGO)).toBe(isMinuteInScheduleWindow(w, minute));
      }
    }
  });

  it('stays asleep through the repeated hour on fall-back night', () => {
    // 2026-11-01: Chicago reads 01:00 to 01:59 twice (CDT, then CST).
    const w = { startTime: '01:30', endTime: '06:00' };
    expect(isInstantInScheduleWindow(w, at('2026-11-01T06:29:00Z'), CHICAGO)).toBe(false); // 01:29 CDT
    expect(isInstantInScheduleWindow(w, at('2026-11-01T06:30:00Z'), CHICAGO)).toBe(true); //  01:30 CDT
    expect(isInstantInScheduleWindow(w, at('2026-11-01T07:00:00Z'), CHICAGO)).toBe(true); //  01:00 CST
    expect(isInstantInScheduleWindow(w, at('2026-11-01T07:29:00Z'), CHICAGO)).toBe(true); //  01:29 CST
    expect(isInstantInScheduleWindow(w, at('2026-11-01T11:59:00Z'), CHICAGO)).toBe(true); //  05:59 CST
    expect(isInstantInScheduleWindow(w, at('2026-11-01T12:00:00Z'), CHICAGO)).toBe(false); // 06:00 CST
  });

  it('does not reopen a window whose end the clock passes twice', () => {
    const w = { startTime: '22:00', endTime: '01:30' };
    expect(isInstantInScheduleWindow(w, at('2026-11-01T06:29:00Z'), CHICAGO)).toBe(true); //  01:29 CDT
    expect(isInstantInScheduleWindow(w, at('2026-11-01T06:30:00Z'), CHICAGO)).toBe(false); // 01:30 CDT
    expect(isInstantInScheduleWindow(w, at('2026-11-01T07:10:00Z'), CHICAGO)).toBe(false); // 01:10 CST
  });

  it('still ends a window whose end falls in the hour spring-forward skips', () => {
    // 2026-03-08: Chicago jumps from 01:59 CST to 03:00 CDT. 02:30 does not
    // exist, so the window keeps its four and a half hours and ends at 03:30.
    const w = { startTime: '22:00', endTime: '02:30' };
    expect(isInstantInScheduleWindow(w, at('2026-03-08T04:00:00Z'), CHICAGO)).toBe(true); //  22:00 CST
    expect(isInstantInScheduleWindow(w, at('2026-03-08T07:59:00Z'), CHICAGO)).toBe(true); //  01:59 CST
    expect(isInstantInScheduleWindow(w, at('2026-03-08T08:29:00Z'), CHICAGO)).toBe(true); //  03:29 CDT
    expect(isInstantInScheduleWindow(w, at('2026-03-08T08:30:00Z'), CHICAGO)).toBe(false); // 03:30 CDT
    expect(isInstantInScheduleWindow(w, at('2026-03-08T15:00:00Z'), CHICAGO)).toBe(false); // 10:00 CDT
  });

  it('treats an unparseable or zero-length window as no window', () => {
    const now = at('2026-09-24T08:00:00Z');
    expect(isInstantInScheduleWindow({ startTime: '', endTime: '06:00' }, now, CHICAGO)).toBe(false);
    expect(isInstantInScheduleWindow({ startTime: '03:00', endTime: '03:00' }, now, CHICAGO)).toBe(false);
  });
});
