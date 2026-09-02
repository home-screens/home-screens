// jsdom (not node) because @testing-library/react/renderHook needs document/window.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScreenRotationTimer } from '@/components/display/useScreenRotationTimer';

describe('useScreenRotationTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires onAdvance after the specified duration', () => {
    const onAdvance = vi.fn();
    renderHook(() =>
      useScreenRotationTimer({
        durationMs: 5000,
        onAdvance,
        active: true,
        resetKey: 0,
      }),
    );
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('reports when the dwell was armed, keeps it while paused, and clears it for sticky', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const onAdvance = vi.fn();
    const { result, rerender } = renderHook(
      ({ durationMs, active, resetKey }) =>
        useScreenRotationTimer({ durationMs, onAdvance, active, resetKey }),
      { initialProps: { durationMs: 5000, active: true, resetKey: 0 } },
    );
    const armedAt = Date.now();
    expect(result.current).toBe(armedAt);

    // Pause: the timer is cleared but the start is kept so the progress line
    // freezes in place instead of vanishing.
    vi.advanceTimersByTime(2000);
    rerender({ durationMs: 5000, active: false, resetKey: 0 });
    expect(result.current).toBe(armedAt);

    // Resume re-arms a full dwell from now.
    vi.advanceTimersByTime(1000);
    rerender({ durationMs: 5000, active: true, resetKey: 0 });
    expect(result.current).toBe(armedAt + 3000);

    // Sticky: nothing is armed.
    rerender({ durationMs: 0, active: true, resetKey: 1 });
    expect(result.current).toBeNull();
  });

  it('does not fire when durationMs is 0 (sticky)', () => {
    const onAdvance = vi.fn();
    renderHook(() =>
      useScreenRotationTimer({
        durationMs: 0,
        onAdvance,
        active: true,
        resetKey: 0,
      }),
    );
    vi.advanceTimersByTime(10_000_000);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('does not fire when active is false (paused or asleep)', () => {
    const onAdvance = vi.fn();
    renderHook(() =>
      useScreenRotationTimer({
        durationMs: 5000,
        onAdvance,
        active: false,
        resetKey: 0,
      }),
    );
    vi.advanceTimersByTime(10_000);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('does not fire after switching to sticky mid-dwell', () => {
    const onAdvance = vi.fn();
    const { rerender } = renderHook(
      ({ durationMs, resetKey }) =>
        useScreenRotationTimer({ durationMs, onAdvance, active: true, resetKey }),
      { initialProps: { durationMs: 5000, resetKey: 0 } },
    );
    vi.advanceTimersByTime(4000);
    rerender({ durationMs: 0, resetKey: 1 });
    vi.advanceTimersByTime(10_000);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('re-arms with a new duration on resetKey bump', () => {
    const onAdvance = vi.fn();
    const { rerender } = renderHook(
      ({ durationMs, resetKey }) =>
        useScreenRotationTimer({ durationMs, onAdvance, active: true, resetKey }),
      { initialProps: { durationMs: 30_000, resetKey: 0 } },
    );
    vi.advanceTimersByTime(20_000);
    rerender({ durationMs: 5000, resetKey: 1 });
    vi.advanceTimersByTime(4999);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('re-arms with the same duration on resetKey bump alone (manual nav case)', () => {
    const onAdvance = vi.fn();
    const { rerender } = renderHook(
      ({ durationMs, resetKey }) =>
        useScreenRotationTimer({ durationMs, onAdvance, active: true, resetKey }),
      { initialProps: { durationMs: 5000, resetKey: 0 } },
    );
    vi.advanceTimersByTime(4000); // 1000ms left on the original dwell
    rerender({ durationMs: 5000, resetKey: 1 }); // manual nav: restart full 5000ms
    vi.advanceTimersByTime(4999);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
