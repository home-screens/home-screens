// @vitest-environment jsdom

/**
 * When the scheduled sleep takes hold, judged on the household's clock
 * (America/Chicago) whatever the kiosk's own zone is. Run under `TZ=UTC` like
 * a stock Pi; every other zone must give the same answers.
 *
 * - A display reloaded inside its sleep window goes dark at once, not on the
 *   first 10s tick: the nightly kiosk restart usually lands in the window.
 * - On fall-back night a window that has started stays in effect through the
 *   repeated hour instead of waking the display for it.
 * - On spring-forward night a window whose end falls in the skipped hour
 *   still ends.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

const CHICAGO = 'America/Chicago';

function sleepWindow(startTime: string, endTime: string): SleepSettings {
  return {
    enabled: true,
    idleDimEnabled: false,
    dimAfterMinutes: 5,
    sleepAfterMinutes: 5,
    dimBrightness: 20,
    schedule: { startTime, endTime },
  };
}

async function advanceTo(iso: string) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(new Date(iso).getTime() - Date.now());
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSleepManager window edges', () => {
  it('is dark from the first render when loaded inside the sleep window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T08:10:00Z')); // 03:10 CDT
    const { result } = renderHook(() => useSleepManager(sleepWindow('22:00', '06:00'), CHICAGO));
    expect(result.current.displayState).toBe('asleep');
  });

  it('stays lit from the first render when loaded outside the sleep window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T17:00:00Z')); // noon CDT
    const { result } = renderHook(() => useSleepManager(sleepWindow('22:00', '06:00'), CHICAGO));
    expect(result.current.displayState).toBe('active');
  });

  it('stays asleep through the repeated hour on fall-back night', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T06:25:00Z')); // 01:25 CDT
    const { result } = renderHook(() => useSleepManager(sleepWindow('01:30', '06:00'), CHICAGO));
    expect(result.current.displayState).toBe('active');

    await advanceTo('2026-11-01T06:30:05Z'); // 01:30 CDT
    expect(result.current.displayState).toBe('asleep');

    // The clock steps back to 01:00 CST; the window started, so it holds.
    await advanceTo('2026-11-01T07:00:05Z');
    expect(result.current.displayState).toBe('asleep');
    await advanceTo('2026-11-01T07:29:55Z');
    expect(result.current.displayState).toBe('asleep');

    await advanceTo('2026-11-01T11:59:55Z'); // 05:59 CST
    expect(result.current.displayState).toBe('asleep');
    await advanceTo('2026-11-01T12:00:05Z'); // 06:00 CST
    expect(result.current.displayState).toBe('active');
  });

  it('is dark when reloaded during the repeated hour of a window that has started', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T07:10:00Z')); // 01:10 CST, the second pass
    const { result } = renderHook(() => useSleepManager(sleepWindow('01:30', '06:00'), CHICAGO));
    expect(result.current.displayState).toBe('asleep');
  });

  it('still ends a window whose end falls in the hour spring-forward skips', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T07:50:00Z')); // 01:50 CST
    const { result } = renderHook(() => useSleepManager(sleepWindow('22:00', '02:30'), CHICAGO));
    expect(result.current.displayState).toBe('asleep');

    // 01:59 CST jumps to 03:00 CDT. 02:30 never shows, so the window keeps its
    // length and ends at 03:30 CDT.
    await advanceTo('2026-03-08T08:05:00Z'); // 03:05 CDT
    expect(result.current.displayState).toBe('asleep');
    await advanceTo('2026-03-08T08:30:05Z'); // 03:30 CDT
    expect(result.current.displayState).toBe('active');
  });
});
