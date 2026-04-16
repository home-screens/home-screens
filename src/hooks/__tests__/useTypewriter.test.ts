// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTypewriter } from '@/hooks/useTypewriter';

/**
 * Tests for the typewriter reveal hook used by the greeting and
 * affirmations modules. Because these run on always-on displays, a timer
 * that never clears or a `done` flag that never flips would leak memory
 * across the rotation cycle — so these tests pay particular attention to
 * cleanup and state transitions.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTypewriter — disabled path', () => {
  it('shows the full text immediately when enabled=false', () => {
    const { result } = renderHook(() => useTypewriter('hello', false, 10));
    expect(result.current.displayed).toBe('hello');
    expect(result.current.done).toBe(true);
  });

  it('does not start a timer when disabled', () => {
    // When the user switches the typewriter off mid-rotation, we want an
    // instant reveal AND no lingering interval — otherwise disabling has
    // no effect beyond hiding a partial string.
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    renderHook(() => useTypewriter('hello', false, 10));
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });
});

describe('useTypewriter — enabled path', () => {
  it('starts with an empty string and done=false', () => {
    const { result } = renderHook(() => useTypewriter('hello', true, 50));
    expect(result.current.displayed).toBe('');
    expect(result.current.done).toBe(false);
  });

  it('reveals one character per tick', () => {
    const { result } = renderHook(() => useTypewriter('hi', true, 50));
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current.displayed).toBe('h');
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current.displayed).toBe('hi');
  });

  it('sets done=true once the final character has been revealed', () => {
    const { result } = renderHook(() => useTypewriter('hi', true, 50));
    // Three ticks: tick 1 shows 'h', tick 2 shows 'hi', tick 3 fires the
    // completion path (i > text.length) which flips `done`.
    act(() => { vi.advanceTimersByTime(50); });
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current.done).toBe(false);
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current.done).toBe(true);
  });

  it('restarts from scratch when text changes mid-reveal', () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) => useTypewriter(text, true, 50),
      { initialProps: { text: 'hello' } },
    );
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.displayed).toBe('he');

    rerender({ text: 'world' });
    // Effect tears down + re-runs → state resets
    expect(result.current.displayed).toBe('');
    expect(result.current.done).toBe(false);

    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current.displayed).toBe('w');
  });

  it('respects a custom speed parameter', () => {
    const { result } = renderHook(() => useTypewriter('ab', true, 200));
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.displayed).toBe('');
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.displayed).toBe('a');
  });

  it('handles the empty-string edge case without leaving done=false forever', () => {
    // Documents existing behavior: with `text = ''`, after one tick the
    // interval fires with `i = 1`, which is > text.length === 0, so `done`
    // flips to true. Anything else would leave an affirmations loop stuck.
    const { result } = renderHook(() => useTypewriter('', true, 10));
    expect(result.current.displayed).toBe('');
    act(() => { vi.advanceTimersByTime(10); });
    expect(result.current.done).toBe(true);
  });

  it('clears its interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useTypewriter('hello', true, 10));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('switches to instant-display when enabled flips from true to false', () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useTypewriter('longword', enabled, 50),
      { initialProps: { enabled: true } },
    );
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.displayed.length).toBe(2);

    rerender({ enabled: false });
    // Effect re-runs with enabled=false → full text + done
    expect(result.current.displayed).toBe('longword');
    expect(result.current.done).toBe(true);
  });
});
