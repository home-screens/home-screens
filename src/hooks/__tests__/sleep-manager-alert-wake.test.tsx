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

// Idle dimming off so the schedule is the only thing that could re-sleep it.
const OVERNIGHT: SleepSettings = {
  ...ALWAYS_ASLEEP,
  idleDimEnabled: false,
  schedule: { startTime: '23:00', endTime: '06:00' },
};

const IDLE_ONLY: SleepSettings = {
  enabled: true,
  dimAfterMinutes: 5,
  sleepAfterMinutes: 5,
  dimBrightness: 20,
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

  it('an alert that outlives the overnight sleep window leaves the display awake on release', async () => {
    // Schedule 23:00-06:00, alert at 02:00, dismissed at 08:00. The schedule
    // ended while the alert was up; release must honor that, not re-judge
    // "no window open" as "this sleep was manual" and black out the day.
    vi.setSystemTime(new Date(2025, 0, 15, 2, 0, 0));
    const { result } = renderHook(() => useSleepManager(OVERNIGHT, undefined));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.wakeForAlert(); });
    expect(result.current.displayState).toBe('active');
    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60 * 60_000); });
    expect(result.current.displayState).toBe('active');

    act(() => { result.current.releaseAlertWake(); });
    expect(result.current.displayState).toBe('active');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.displayState).toBe('active');
  });

  it('restores an idle dim with its idle clock intact instead of escalating to sleep', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_ONLY, undefined));
    // 6 minutes idle: past dimAfter (5), short of dimAfter + sleepAfter (10).
    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60_000); });
    expect(result.current.displayState).toBe('dimmed');

    act(() => { result.current.wakeForAlert(); });
    act(() => { result.current.releaseAlertWake(); });
    expect(result.current.displayState).toBe('dimmed');
    // Ticks continue from six minutes idle, not from "idle forever".
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('dimmed');
    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); });
    expect(result.current.displayState).toBe('asleep');
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
