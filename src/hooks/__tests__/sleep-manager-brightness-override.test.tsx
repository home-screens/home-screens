// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

/**
 * A remote/Display Control brightness is tracked as its own thing
 * (`brightnessOverride`), distinct from the idle and scheduled dims that share
 * the 'dimmed' display state. SleepOverlay keys the screensaver on it, and the
 * reported `brightness` must keep reading the level a person actually sees.
 */
const IDLE_DIM: SleepSettings = {
  enabled: true,
  dimAfterMinutes: 1,
  sleepAfterMinutes: 0,
  dimBrightness: 20,
};

describe('useSleepManager brightness override', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is null while active and after a wake', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(100);

    act(() => { result.current.setRemoteBrightness(30); });
    expect(result.current.brightnessOverride).toBe(30);
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.brightness).toBe(30);

    act(() => { result.current.wake(); });
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(100);
  });

  it('is null for an idle dim, which reports the configured dim level', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM, undefined));
    await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(20);
  });

  it('brightness 0 is a sleep, not an override', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    act(() => { result.current.setRemoteBrightness(0); });
    expect(result.current.displayState).toBe('asleep');
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(0);
  });
});
