// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager, RULE_WAKE_HOLD_MS } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

/**
 * A rule-initiated wake must survive a scheduled sleep window for
 * RULE_WAKE_HOLD_MS before the schedule re-asserts, so a rule (doorbell,
 * alarm) doesn't flash the screen and black out ~10s later. Touch/remote
 * wakes get no such hold — they are re-slept by the next 10s tick, unchanged.
 */

// An always-active sleep window, so `inSleepWindow` is true regardless of the
// (mocked) wall clock, isolating the hold behavior from schedule edges.
const ALWAYS_ASLEEP: SleepSettings = {
  enabled: true,
  dimAfterMinutes: 5,
  sleepAfterMinutes: 5,
  dimBrightness: 20,
  schedule: { startTime: '00:00', endTime: '23:59' },
};

describe('useSleepManager rule-wake hold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Noon, comfortably inside the sleep window.
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('holds the display awake past several ticks and re-sleeps after 5 minutes', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    // The schedule forces sleep on the first tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    // A rule fires a wake with the 5-minute hold.
    act(() => { result.current.wake({ holdMs: RULE_WAKE_HOLD_MS }); });
    expect(result.current.displayState).toBe('active');

    // Several 10s ticks pass — the schedule does NOT re-sleep it during the hold.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(result.current.displayState).toBe('active');

    // Once the 5-minute hold expires, the next tick re-asserts scheduled sleep.
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('a plain wake (touch/remote) is re-slept by the very next tick', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.wake(); });
    expect(result.current.displayState).toBe('active');

    // No hold: the schedule re-asserts within the next 10s tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');
  });
});
