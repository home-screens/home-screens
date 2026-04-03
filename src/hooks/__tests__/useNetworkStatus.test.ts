import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the network-status detection logic from useNetworkStatus.
 * Since the test environment is node (no DOM), we mock the window event API
 * and test the timer/event lifecycle directly.
 */

function makeWindowMock(initialOnLine: boolean) {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    onLine: initialOnLine,
    addEventListener: (event: string, fn: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    },
    removeEventListener: (event: string, fn: (...args: unknown[]) => void) => {
      const fns = listeners.get(event);
      if (fns) listeners.set(event, fns.filter((f) => f !== fn));
    },
    _fire: (event: string) => {
      for (const fn of listeners.get(event) ?? []) fn();
    },
    _listenerCount: (event: string) => (listeners.get(event) ?? []).length,
  };
}

/**
 * Replicates the hook's effect logic so we can test without React/DOM.
 * The onChange callback receives the new isOnline value.
 */
function setupNetworkStatus(
  win: ReturnType<typeof makeWindowMock>,
  onChange: (isOnline: boolean) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function handleOnline() {
    clearTimeout(timer);
    onChange(true);
  }

  function handleOffline() {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(false), 3000);
  }

  win.addEventListener('online', handleOnline);
  win.addEventListener('offline', handleOffline);

  // Sync initial state
  if (win.onLine) {
    handleOnline();
  } else {
    handleOffline();
  }

  return {
    cleanup: () => {
      clearTimeout(timer);
      win.removeEventListener('online', handleOnline);
      win.removeEventListener('offline', handleOffline);
    },
  };
}

describe('useNetworkStatus logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports online when navigator.onLine is true', () => {
    const win = makeWindowMock(true);
    const onChange = vi.fn();
    setupNetworkStatus(win, onChange);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports offline only after 3-second debounce', () => {
    const win = makeWindowMock(true);
    const onChange = vi.fn();
    setupNetworkStatus(win, onChange);
    onChange.mockClear();

    win._fire('offline');

    // Should not report offline yet
    vi.advanceTimersByTime(2999);
    expect(onChange).not.toHaveBeenCalledWith(false);

    // Should report offline after 3s
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('cancels offline timer if online fires within debounce window', () => {
    const win = makeWindowMock(true);
    const onChange = vi.fn();
    setupNetworkStatus(win, onChange);
    onChange.mockClear();

    win._fire('offline');
    vi.advanceTimersByTime(1500);

    // Reconnect before debounce fires
    win._fire('online');
    expect(onChange).toHaveBeenCalledWith(true);
    onChange.mockClear();

    // Original timer should be cancelled
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalledWith(false);
  });

  it('reports online immediately on online event', () => {
    const win = makeWindowMock(false);
    const onChange = vi.fn();
    setupNetworkStatus(win, onChange);

    // After 3s debounce, should be offline
    vi.advanceTimersByTime(3000);
    onChange.mockClear();

    win._fire('online');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('starts offline debounce when initial state is offline', () => {
    const win = makeWindowMock(false);
    const onChange = vi.fn();
    setupNetworkStatus(win, onChange);

    // Should not report offline immediately
    expect(onChange).not.toHaveBeenCalledWith(false);

    // Should report offline after 3s
    vi.advanceTimersByTime(3000);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('cleans up listeners and timers', () => {
    const win = makeWindowMock(true);
    const onChange = vi.fn();
    const { cleanup } = setupNetworkStatus(win, onChange);
    onChange.mockClear();

    // Go offline and cleanup before debounce fires
    win._fire('offline');
    cleanup();

    // Timer should be cleared — no offline report
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalledWith(false);

    // Listeners should be removed
    expect(win._listenerCount('online')).toBe(0);
    expect(win._listenerCount('offline')).toBe(0);
  });
});
