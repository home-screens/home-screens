// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

/**
 * `idleDimEnabled: false` turns off the inactivity dim/sleep machinery while
 * leaving the schedules fully in charge — the "sleep overnight, full
 * brightness all day" configuration from issue #26. Absent means true, because
 * every config saved before the field existed had idle dimming on.
 */
const SCHEDULE_ONLY: SleepSettings = {
  enabled: true,
  idleDimEnabled: false,
  dimAfterMinutes: 5,
  sleepAfterMinutes: 5,
  dimBrightness: 20,
  // Overnight window that does NOT contain the fake "now" of 12:00.
  schedule: { startTime: '23:00', endTime: '06:00' },
};

describe('useSleepManager with idle dimming disabled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('never dims from inactivity, no matter how long the display sits idle', async () => {
    const { result } = renderHook(() => useSleepManager(SCHEDULE_ONLY, undefined));

    // Hours past dimAfterMinutes + sleepAfterMinutes, still daytime
    // (12:00 → 20:00, outside the 23:00–06:00 window).
    await act(async () => { await vi.advanceTimersByTimeAsync(8 * 60 * 60_000); });

    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);
  });

  it('still sleeps and wakes on the schedule', async () => {
    const { result } = renderHook(() => useSleepManager(SCHEDULE_ONLY, undefined));

    // 12:00 → 23:30: inside the sleep window.
    await act(async () => { await vi.advanceTimersByTimeAsync(11.5 * 60 * 60_000); });
    expect(result.current.displayState).toBe('asleep');
    expect(result.current.dimOpacity).toBe(1);

    // 23:30 → 06:30 next morning: window ended, must wake on its own.
    await act(async () => { await vi.advanceTimersByTimeAsync(7 * 60 * 60_000); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);
  });

  it('defaults to idle dimming when the field is absent (pre-existing configs)', async () => {
    const legacy: SleepSettings = { ...SCHEDULE_ONLY };
    delete legacy.idleDimEnabled;
    const { result } = renderHook(() => useSleepManager(legacy, undefined));

    // Past dimAfterMinutes but before dim+sleep: the old idle behavior.
    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60_000); });

    expect(result.current.displayState).toBe('dimmed');
  });

  it('recovers a display that idle-dimmed before the toggle was turned off', async () => {
    // The regression: `idleDimEnabled` is live-pushed with no remount, and the
    // gate only stops FUTURE idle transitions. Without the recovery effect a
    // display that had already dimmed stayed dim forever — no schedule window
    // to leave, no touch on a wall-mounted kiosk.
    const idleOn: SleepSettings = { ...SCHEDULE_ONLY, idleDimEnabled: true };
    const { result, rerender } = renderHook(
      ({ s }: { s: SleepSettings }) => useSleepManager(s, undefined),
      { initialProps: { s: idleOn } },
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60_000); });
    expect(result.current.displayState).toBe('dimmed');

    await act(async () => { rerender({ s: SCHEDULE_ONLY }); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);

    // And it stays bright — later ticks must not re-dim.
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); });
    expect(result.current.displayState).toBe('active');
  });

  it('idle dimming runs outside an inactive dim-schedule window (toggle governs, not the schedule)', async () => {
    // The old implicit rule "a dim schedule suppresses idle behavior" is gone;
    // the v7 migration seeds idleDimEnabled: false for configs that relied on
    // it. With the toggle explicitly ON and a dim window that isn't active
    // (23:00–06:00 at fake-noon), idle transitions must fire.
    const both: SleepSettings = {
      enabled: true,
      idleDimEnabled: true,
      dimAfterMinutes: 5,
      sleepAfterMinutes: 0,
      dimBrightness: 20,
      dimSchedule: { startTime: '23:00', endTime: '06:00' },
    };
    const { result } = renderHook(() => useSleepManager(both, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60_000); });
    expect(result.current.displayState).toBe('dimmed');
  });

  it('a touch during the scheduled sleep still wakes, and the schedule re-asserts after the hold', async () => {
    // wakeHoldMinutes: 0 pins the pre-hold behavior this test is about: the
    // touch-wake path must exist with idle dimming off, and with no hold the
    // schedule re-asserts on the next 10s tick. The wake-hold itself is
    // covered in sleep-manager-wake-hold.test.tsx.
    const { result } = renderHook(() =>
      useSleepManager({ ...SCHEDULE_ONLY, wakeHoldMinutes: 0 }, undefined),
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(11.5 * 60 * 60_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.displayState).toBe('active');

    // Still inside the window: the schedule re-asserts on the next 10s tick,
    // exactly as it does with idle dimming enabled.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');
  });
});
