// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import { useStayAwakeHold } from '@/lib/interaction-hold';
import type { SleepSettings } from '@/types/config';

/**
 * Cooking mode: an open recipe card keeps the idle dim and sleep waiting, so
 * the wall does not go dark under someone with their hands in dough. A sleep
 * schedule still wins.
 */
const IDLE: SleepSettings = {
  enabled: true,
  idleDimEnabled: true,
  dimAfterMinutes: 5,
  sleepAfterMinutes: 10,
  dimBrightness: 20,
  schedule: { startTime: '23:00', endTime: '06:00' },
};

describe('useSleepManager with a recipe open (useStayAwakeHold)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 17, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('stays awake while the recipe is open, then starts the idle clock over when it closes', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE, undefined));
    const recipe = renderHook(() => useStayAwakeHold());

    // Forty minutes with nobody touching: well past dim and sleep.
    await act(async () => { await vi.advanceTimersByTimeAsync(40 * 60_000); });
    expect(result.current.displayState).toBe('active');

    // The card closes; the dim comes the usual five minutes later, not at once.
    recipe.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); });
    expect(result.current.displayState).toBe('active');
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    expect(result.current.displayState).toBe('dimmed');
  });

  it('dims as usual while the hold is off (a card nobody has cooked from), and stays awake once it is on', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE, undefined));
    const recipe = renderHook(({ cooking }) => useStayAwakeHold(cooking), { initialProps: { cooking: false } });

    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 60_000); });
    expect(result.current.displayState).toBe('dimmed');

    // The first tick: cooking mode from here on.
    recipe.rerender({ cooking: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(40 * 60_000); });
    expect(result.current.displayState).not.toBe('asleep');
    recipe.unmount();
  });

  it('still sleeps on the schedule with a recipe open', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE, undefined));
    renderHook(() => useStayAwakeHold());

    // 17:00 to 23:30: inside the sleep window.
    await act(async () => { await vi.advanceTimersByTimeAsync(6.5 * 60 * 60_000); });
    expect(result.current.displayState).toBe('asleep');
  });
});
