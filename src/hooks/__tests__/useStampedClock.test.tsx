// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStampedClock } from '@/hooks/useStampedClock';

describe('useStampedClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T12:00:05.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks on its own', () => {
    const { result, unmount } = renderHook(() => useStampedClock(30_000, 'same'));
    expect(result.current.getUTCSeconds()).toBe(5);
    act(() => { vi.advanceTimersByTime(25_010); });
    expect(result.current.getUTCSeconds()).toBe(30);
    unmount();
  });

  it('is read afresh when the stamp changes, without waiting for the tick', () => {
    const { result, rerender, unmount } = renderHook(({ stamp }) => useStampedClock(30_000, stamp), { initialProps: { stamp: ['a'] } });
    act(() => { vi.advanceTimersByTime(7_000); });
    expect(result.current.getUTCSeconds()).toBe(5);
    rerender({ stamp: ['a', 'b'] });
    expect(result.current.getUTCSeconds()).toBe(12);
    unmount();
  });

  it('never goes back: a tick after a stamp wins', () => {
    const { result, rerender, unmount } = renderHook(({ stamp }) => useStampedClock(30_000, stamp), { initialProps: { stamp: 1 } });
    act(() => { vi.advanceTimersByTime(7_000); });
    rerender({ stamp: 2 });
    act(() => { vi.advanceTimersByTime(18_010); });
    expect(result.current.getUTCSeconds()).toBe(30);
    unmount();
  });
});
