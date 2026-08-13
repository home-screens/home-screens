import { describe, it, expect } from 'vitest';
import { computeTimelineSegments } from '../sleep-timeline';

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
