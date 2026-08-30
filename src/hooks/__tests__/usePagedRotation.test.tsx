// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePagedRotation } from '@/hooks/usePagedRotation';

/**
 * The paged rotation drives every "one story at a time" news view, and is
 * also what the hub's next / prev commands and touch taps move. A tap must
 * restart the auto-advance timer, otherwise a story a viewer just flipped to
 * could be replaced a moment later.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePagedRotation', () => {
  it('starts at 0 and auto-advances every interval, wrapping around', () => {
    const { result } = renderHook(() => usePagedRotation(3, 1000));
    expect(result.current.index).toBe(0);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.index).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.index).toBe(2);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.index).toBe(0);
  });

  it('never starts a timer for a count of 0 or 1', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const zero = renderHook(() => usePagedRotation(0, 1000));
    const one = renderHook(() => usePagedRotation(1, 1000));

    act(() => { vi.advanceTimersByTime(10_000); });

    expect(zero.result.current.index).toBe(0);
    expect(one.result.current.index).toBe(0);
    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
  });

  it('next and prev ignore a single item', () => {
    const { result } = renderHook(() => usePagedRotation(1, 1000));
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
  });

  it('next and prev move immediately and wrap', () => {
    const { result } = renderHook(() => usePagedRotation(3, 1000));

    act(() => result.current.prev());
    expect(result.current.index).toBe(2);
    act(() => result.current.next());
    expect(result.current.index).toBe(0);
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
  });

  it('goTo clamps by wrapping and rounding', () => {
    const { result } = renderHook(() => usePagedRotation(4, 1000));

    act(() => result.current.goTo(2));
    expect(result.current.index).toBe(2);
    act(() => result.current.goTo(5));
    expect(result.current.index).toBe(1);
    act(() => result.current.goTo(-1));
    expect(result.current.index).toBe(3);
    act(() => result.current.goTo(2.6));
    expect(result.current.index).toBe(3);
  });

  it('goTo is a no-op with nothing to show', () => {
    const { result } = renderHook(() => usePagedRotation(0, 1000));
    act(() => result.current.goTo(3));
    expect(result.current.index).toBe(0);
  });

  it('a manual move restarts the auto-advance timer', () => {
    const { result } = renderHook(() => usePagedRotation(5, 1000));

    act(() => { vi.advanceTimersByTime(800); });
    act(() => result.current.next());
    expect(result.current.index).toBe(1);

    // Only 200ms remained on the old timer; a restart means no advance yet.
    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current.index).toBe(1);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.index).toBe(2);
  });

  it('prev also restarts the timer', () => {
    const { result } = renderHook(() => usePagedRotation(5, 1000));

    act(() => { vi.advanceTimersByTime(900); });
    act(() => result.current.prev());
    expect(result.current.index).toBe(4);
    act(() => { vi.advanceTimersByTime(900); });
    expect(result.current.index).toBe(4);
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.index).toBe(0);
  });

  it('resets to 0 when the count changes', () => {
    const { result, rerender } = renderHook(({ count }) => usePagedRotation(count, 1000), { initialProps: { count: 4 } });

    act(() => result.current.goTo(3));
    expect(result.current.index).toBe(3);

    rerender({ count: 6 });
    expect(result.current.index).toBe(0);
  });

  it('never reports an index beyond a shrunken count', () => {
    const { result, rerender } = renderHook(({ count }) => usePagedRotation(count, 1000), { initialProps: { count: 5 } });
    act(() => result.current.goTo(4));
    rerender({ count: 2 });
    expect(result.current.index).toBeLessThan(2);
  });

  it('clears the timer on unmount', () => {
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => usePagedRotation(3, 1000));
    unmount();
    expect(clearInterval).toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(5000); });
    clearInterval.mockRestore();
  });

  it('enforces a 500ms floor on the interval', () => {
    const { result } = renderHook(() => usePagedRotation(3, 10));
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current.index).toBe(0);
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.index).toBe(1);
  });
});
