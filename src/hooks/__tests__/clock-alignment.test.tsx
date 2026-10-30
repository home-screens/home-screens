// @vitest-environment jsdom

/**
 * A seconds-off clock mounted at hh:mm:40 used to show the previous minute
 * for the first 40 seconds of every minute: its interval started at mount
 * and never lined up with the clock. The hooks now subscribe to the aligned
 * ticker, so the reading changes at the boundary.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRealClock, useTZClock, useWallClock } from '@/hooks/useTZClock';

describe('clock hooks tick on the boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T12:00:40.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('useRealClock at a minute cadence changes at the next minute, not 60 s after mount', () => {
    const { result, unmount } = renderHook(() => useRealClock(60_000));
    expect(result.current.getUTCMinutes()).toBe(0);
    act(() => { vi.advanceTimersByTime(19_000); });
    expect(result.current.getUTCMinutes()).toBe(0);
    act(() => { vi.advanceTimersByTime(1_010); });
    expect(result.current.getUTCMinutes()).toBe(1);
    expect(result.current.getUTCSeconds()).toBe(0);
    unmount();
  });

  it('useTZClock and useWallClock move together on the same boundary', () => {
    const tz = renderHook(() => useTZClock('Europe/Berlin', 60_000));
    const wall = renderHook(() => useWallClock('Europe/Berlin', 60_000));
    const before = wall.result.current;
    act(() => { vi.advanceTimersByTime(20_010); });
    expect(tz.result.current.getMinutes()).toBe(1);
    expect(wall.result.current).not.toBe(before);
    expect(wall.result.current.minuteOfDay).toBe(before.minuteOfDay + 1);
    tz.unmount();
    wall.unmount();
  });

  it('useWallClock keeps the same object across a tick inside one minute', () => {
    const { result, unmount } = renderHook(() => useWallClock('UTC', 1000));
    const first = result.current;
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).toBe(first);
    unmount();
  });

  it('enabled: false never subscribes', () => {
    const { result, unmount } = renderHook(() => useRealClock(1000, false));
    const first = result.current;
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).toBe(first);
    unmount();
  });
});
