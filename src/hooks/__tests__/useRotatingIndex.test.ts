// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';

/**
 * Tests for the timer-driven rotating index used by every module that
 * cycles through multiple views (weather, calendar, affirmations, etc.).
 * Regressions here surface as modules stuck on index 0 or silently
 * leaking setInterval handles — both hard to spot by eye.
 *
 * Runs under jsdom because the hook is entirely React state + setInterval,
 * so renderHook is the cleanest pathway.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRotatingIndex', () => {
  it('returns 0 when itemCount is 0', () => {
    const { result } = renderHook(() => useRotatingIndex(0, 1000));
    expect(result.current).toBe(0);
  });

  it('returns 0 and does not start a timer when itemCount is 1', () => {
    // Intentional short-circuit — a 1-item rotation has nothing to cycle
    // through, and starting a timer would burn battery on every display.
    const { result } = renderHook(() => useRotatingIndex(1, 100));
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current).toBe(0);
  });

  it('advances by one index per interval tick', () => {
    const { result } = renderHook(() => useRotatingIndex(3, 1000));
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(2);
  });

  it('wraps around to 0 after reaching itemCount-1', () => {
    const { result } = renderHook(() => useRotatingIndex(3, 1000));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(1);
  });

  it('resets to 0 and re-arms when itemCount changes', () => {
    // When a module's view list changes (e.g. user toggles a sub-view off)
    // the rotation must restart from 0, otherwise it could point at an
    // index that no longer exists on the next re-render.
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useRotatingIndex(count, 500),
      { initialProps: { count: 4 } },
    );
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current).toBe(3);

    rerender({ count: 2 });
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(1);
  });

  it('keeps its place and re-arms when intervalMs changes', () => {
    // A slider dragged in the editor must not throw the view back to its
    // first item on every step.
    const { result, rerender } = renderHook(
      ({ interval }: { interval: number }) => useRotatingIndex(3, interval),
      { initialProps: { interval: 1000 } },
    );
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(1);

    rerender({ interval: 5000 });
    expect(result.current).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(1);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current).toBe(2);
  });

  it('never turns faster than twice a second, whatever the config holds', () => {
    // A hand-edited 0 used to hand setInterval a zero delay and spin the module.
    const { result } = renderHook(() => useRotatingIndex(3, 0));
    act(() => { vi.advanceTimersByTime(499); });
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(1);
  });

  it('is in range on the very render the list shrinks', () => {
    // Callers read items[index] in that render, before any effect has run.
    const seen: number[] = [];
    const { rerender } = renderHook(
      ({ count }: { count: number }) => {
        const index = useRotatingIndex(count, 1000);
        seen.push(index);
        return index;
      },
      { initialProps: { count: 4 } },
    );
    act(() => { vi.advanceTimersByTime(3000); });
    seen.length = 0;
    rerender({ count: 2 });
    expect(seen.every((index) => index < 2)).toBe(true);
  });

  it('clears the interval on unmount (no orphaned timer)', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useRotatingIndex(3, 1000));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('handles very large itemCount without arithmetic issues', () => {
    const { result } = renderHook(() => useRotatingIndex(1000, 1000));
    act(() => { vi.advanceTimersByTime(2500); });
    expect(result.current).toBe(2);
  });
});
