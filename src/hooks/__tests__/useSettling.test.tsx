// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSettling } from '../useSheetTapGuard';

describe('useSettling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('holds for a double tap after it mounts', () => {
    const { result } = renderHook(() => useSettling('details', 300));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('holds again in the same render as the step changes', () => {
    const { result, rerender } = renderHook(({ step }) => useSettling(step, 300), { initialProps: { step: 'typing' } });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(false);
    rerender({ step: 'details' });
    // No tick in between: the very render that draws the new buttons has them held.
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(false);
  });

  it('with fromMount off, answers at once on mount and holds only after a change', () => {
    const { result, rerender } = renderHook(
      ({ offered }) => useSettling(offered, 300, { fromMount: false }),
      { initialProps: { offered: true } },
    );
    expect(result.current).toBe(false);
    rerender({ offered: false });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
    // Back to the first key: it holds again from then.
    rerender({ offered: true });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(false);
  });

  it('holds when a step comes back to one it settled on before', () => {
    const { result, rerender } = renderHook(({ step }) => useSettling(step, 300), { initialProps: { step: 'details' } });
    act(() => vi.advanceTimersByTime(300));
    rerender({ step: 'repeat' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ step: 'details' });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(false);
  });
});
