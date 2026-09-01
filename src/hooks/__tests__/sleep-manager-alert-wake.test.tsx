// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

/**
 * An urgent alert wakes a sleeping display (`wakeForAlert`) and the wake ends
 * with the alert (`releaseAlertWake`), returning the display to how it was:
 * an explicit sleep comes back as sleep, a schedule window re-asserts on the
 * next tick, a remote brightness is restored, and an active display is left
 * alone. Without the return, a smoke alarm at 2 AM would leave a bedroom
 * display bright until morning.
 */

const ALWAYS_ASLEEP: SleepSettings = {
  enabled: true,
  dimAfterMinutes: 5,
  sleepAfterMinutes: 5,
  dimBrightness: 20,
  schedule: { startTime: '00:00', endTime: '23:59' },
};

describe('useSleepManager alert wake', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('wakes an explicitly slept display and puts it back to sleep on release', () => {
    // Sleep disabled: only an explicit sleep can black the display out, and
    // nothing automatic would ever re-sleep it after the alert.
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    act(() => { result.current.forceSleep(); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.wakeForAlert(); });
    expect(result.current.displayState).toBe('active');

    act(() => { result.current.releaseAlertWake(); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('holds against a sleep schedule while the alert is up, and the schedule re-asserts after release', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.wakeForAlert(); });
    expect(result.current.displayState).toBe('active');
    // Several ticks: the schedule does not win while the alert is up.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');

    // Release inside the window: the very next tick sleeps it again.
    act(() => { result.current.releaseAlertWake(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('leaves an active display active on release', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    act(() => { result.current.wakeForAlert(); });
    act(() => { result.current.releaseAlertWake(); });
    expect(result.current.displayState).toBe('active');
  });

  it('restores a remote-set partial brightness on release', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    act(() => { result.current.setRemoteBrightness(40); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.dimOpacity).toBeCloseTo(0.6);

    act(() => { result.current.wakeForAlert(); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);

    act(() => { result.current.releaseAlertWake(); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.dimOpacity).toBeCloseTo(0.6);
  });

  it('a second urgent alert during the wake keeps the first snapshot; release is a no-op without a wake', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    act(() => { result.current.releaseAlertWake(); });
    expect(result.current.displayState).toBe('active');

    act(() => { result.current.forceSleep(); });
    act(() => { result.current.wakeForAlert(); });
    act(() => { result.current.wakeForAlert(); });
    act(() => { result.current.releaseAlertWake(); });
    expect(result.current.displayState).toBe('asleep');
  });
});
