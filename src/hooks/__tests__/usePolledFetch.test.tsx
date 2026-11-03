// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { usePolledFetch, type PollReason } from '../usePolledFetch';

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

function goOnline() {
  act(() => { window.dispatchEvent(new Event('online')); });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usePolledFetch', () => {
  it('fetches on setup and then every interval', () => {
    const poll = vi.fn();
    renderHook(() => usePolledFetch(poll, [], { intervalMs: 1_000 }));
    expect(poll).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(poll).toHaveBeenCalledTimes(3);
    expect(poll.mock.calls.map(([, reason]) => reason)).toEqual(['setup', 'interval', 'interval']);
  });

  it('pauses while the tab is hidden and resumes with an immediate fetch', () => {
    const poll = vi.fn();
    renderHook(() => usePolledFetch(poll, [], { intervalMs: 1_000, pauseWhenHidden: true }));
    expect(poll).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(poll).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll.mock.calls[1][1]).toBe('visible');
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('does not fetch at all while hidden on mount, and starts when the tab is shown', () => {
    visibility = 'hidden';
    const poll = vi.fn();
    renderHook(() => usePolledFetch(poll, [], { intervalMs: 1_000, pauseWhenHidden: true }));
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(poll).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('keeps polling while hidden without pauseWhenHidden', () => {
    const poll = vi.fn();
    renderHook(() => usePolledFetch(poll, [], { intervalMs: 1_000 }));
    setVisibility('hidden');
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('fetches again when the device comes back online', () => {
    const poll = vi.fn();
    renderHook(() => usePolledFetch(poll, [], { intervalMs: 10_000 }));
    goOnline();
    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll.mock.calls[1][1]).toBe('online');
  });

  it('ignores online while hidden, disabled, or unmounted', () => {
    const poll = vi.fn();
    const view = renderHook(
      ({ enabled }) => usePolledFetch(poll, [], { intervalMs: 10_000, pauseWhenHidden: true, enabled }),
      { initialProps: { enabled: true } },
    );
    setVisibility('hidden');
    goOnline();
    expect(poll).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    view.rerender({ enabled: false });
    goOnline();
    expect(poll).toHaveBeenCalledTimes(2);

    view.rerender({ enabled: true });
    view.unmount();
    goOnline();
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('nudge polls now and in a burst, then goes back to the base interval', () => {
    const poll = vi.fn();
    const { result } = renderHook(() => usePolledFetch(poll, [], { intervalMs: 5_000, burst: { intervalMs: 1_000, durationMs: 3_000 } }));
    expect(poll).toHaveBeenCalledTimes(1);

    act(() => { result.current.nudge(); });
    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll.mock.calls[1][1]).toBe('nudge');
    act(() => { vi.advanceTimersByTime(3_000); });
    // Three burst ticks over three seconds, no five-second tick in between.
    expect(poll).toHaveBeenCalledTimes(5);
    act(() => { vi.advanceTimersByTime(4_999); });
    expect(poll).toHaveBeenCalledTimes(5);
    act(() => { vi.advanceTimersByTime(1); });
    expect(poll).toHaveBeenCalledTimes(6);
    const reasons: PollReason[] = poll.mock.calls.map((call) => call[1]);
    expect(reasons.slice(2)).toEqual(['interval', 'interval', 'interval', 'interval']);
  });

  it('a second nudge restarts the burst', () => {
    const poll = vi.fn();
    const { result } = renderHook(() => usePolledFetch(poll, [], { intervalMs: 5_000, burst: { intervalMs: 1_000, durationMs: 3_000 } }));
    act(() => { result.current.nudge(); });
    act(() => { vi.advanceTimersByTime(2_000); });
    act(() => { result.current.nudge(); });
    const after = poll.mock.calls.length;
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(poll).toHaveBeenCalledTimes(after + 3);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(poll).toHaveBeenCalledTimes(after + 3);
  });

  it('nudge does nothing while disabled, hidden, or without an interval', () => {
    const poll = vi.fn();
    const disabled = renderHook(() => usePolledFetch(poll, [], { intervalMs: 5_000, enabled: false }));
    act(() => { disabled.result.current.nudge(); });
    expect(poll).not.toHaveBeenCalled();
    disabled.unmount();

    const oneShot = renderHook(() => usePolledFetch(poll, []));
    expect(poll).toHaveBeenCalledTimes(1);
    act(() => { oneShot.result.current.nudge(); });
    expect(poll).toHaveBeenCalledTimes(1);
    oneShot.unmount();

    const paused = renderHook(() => usePolledFetch(poll, [], { intervalMs: 5_000, pauseWhenHidden: true }));
    expect(poll).toHaveBeenCalledTimes(2);
    setVisibility('hidden');
    act(() => { paused.result.current.nudge(); });
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('a burst does not outlive a pause or an unmount', () => {
    const poll = vi.fn();
    const { result, unmount } = renderHook(() => usePolledFetch(poll, [], { intervalMs: 5_000, pauseWhenHidden: true }));
    act(() => { result.current.nudge(); });
    setVisibility('hidden');
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(poll).toHaveBeenCalledTimes(2);
    setVisibility('visible');
    expect(poll).toHaveBeenCalledTimes(3);
    // Back on the base interval, not the burst.
    act(() => { vi.advanceTimersByTime(4_999); });
    expect(poll).toHaveBeenCalledTimes(3);
    act(() => { result.current.nudge(); });
    unmount();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it('runs onSetup before each setup fetch and onSkip when disabled', () => {
    const calls: string[] = [];
    const view = renderHook(
      ({ enabled, key }) => usePolledFetch(() => { calls.push(`poll:${key}`); }, [key], {
        enabled,
        onSetup: () => calls.push('setup'),
        onSkip: () => calls.push('skip'),
      }),
      { initialProps: { enabled: true, key: 'a' } },
    );
    view.rerender({ enabled: true, key: 'b' });
    view.rerender({ enabled: false, key: 'b' });
    expect(calls).toEqual(['setup', 'poll:a', 'setup', 'poll:b', 'skip']);
  });

  it('tells the poll when it is no longer mounted', async () => {
    let mountedAfter: boolean | null = null;
    const gate = Promise.withResolvers<void>();
    const { unmount } = renderHook(() => usePolledFetch(async (isMounted) => {
      await gate.promise;
      mountedAfter = isMounted();
    }, []));
    unmount();
    gate.resolve();
    await act(async () => {});
    expect(mountedAfter).toBe(false);
  });
});
