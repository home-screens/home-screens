// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDisplaySharedState } from '../useDisplaySharedState';

/**
 * The editor's only window into live display values: producers run on the
 * display client, so this hook polls the hub's per-display snapshot. It must
 * be resilient — a failed or malformed poll keeps the last snapshot (the
 * hint is best-effort), and switching displays must not show the previous
 * display's values.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Flush the initial poll's promise chain without advancing timers. */
const flushPoll = () => act(async () => {});

describe('useDisplaySharedState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls on mount and exposes the reported entries', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ entries: { 'plugin:ha:door': { value: 'open', updatedAt: 1 } }, reportedAt: 42 }),
    );
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current.entries['plugin:ha:door']?.value).toBe('open');
    expect(result.current.reportedAt).toBe(42);
  });

  it('passes through providerHealth from the response and defaults it to empty', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        entries: {},
        reportedAt: 1,
        providerHealth: { 'home-assistant': { message: "Can't reach HA", since: 5 } },
      }))
      .mockResolvedValueOnce(jsonResponse({ entries: {}, reportedAt: 2 }));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(result.current.providerHealth['home-assistant']).toEqual({ message: "Can't reach HA", since: 5 });

    // The next report omits the field (outage resolved) — it clears to empty.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.providerHealth).toEqual({});
  });

  it('targets the legacy slot when displayId is null and encodes the id otherwise', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ entries: {}, reportedAt: null }),
    );
    const legacy = renderHook(() => useDisplaySharedState(null));
    await flushPoll();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/display/shared-state', undefined);
    legacy.unmount();

    renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/display/shared-state?display=kitchen', undefined);
  });

  it('re-polls on the 5s interval and picks up new values', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 1 }))
      .mockResolvedValueOnce(jsonResponse({ entries: { k: { value: 'b', updatedAt: 2 } }, reportedAt: 2 }));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(result.current.entries.k?.value).toBe('a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.entries.k?.value).toBe('b');
  });

  it('keeps the last snapshot when a poll rejects', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 1 }))
      .mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.entries.k?.value).toBe('a');
  });

  it('keeps the last snapshot on a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 1 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.entries.k?.value).toBe('a');
  });

  it('ignores a malformed body (missing entries object)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ nope: true }));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();

    expect(result.current.entries).toEqual({});
    expect(result.current.reportedAt).toBeNull();
  });

  it('resets to empty and re-fetches when the displayId changes', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ entries: { k: { value: 'kitchen-val', updatedAt: 1 } }, reportedAt: 1 }))
      // Second display's poll never resolves within the test — the reset
      // must not wait for it.
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useDisplaySharedState(id),
      { initialProps: { id: 'kitchen' as string | null } },
    );
    await flushPoll();
    expect(result.current.entries.k?.value).toBe('kitchen-val');

    rerender({ id: 'bedroom' });
    // The previous display's values must never bleed into the new selection.
    expect(result.current.entries).toEqual({});
    expect(fetchMock).toHaveBeenLastCalledWith('/api/display/shared-state?display=bedroom', undefined);
  });

  it('stops polling after unmount', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ entries: {}, reportedAt: null }),
    );
    const { unmount } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(fetchMock).toHaveBeenCalledOnce();

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not fetch when disabled and returns the empty snapshot', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useDisplaySharedState('kitchen', false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual({});
    expect(result.current.reportedAt).toBeNull();
    expect(result.current.states).toBeNull();
  });

  it('resets to empty and stops polling when enabled flips off, resumes when flipped on', async () => {
    vi.setSystemTime(1_000_000);
    const body = () => jsonResponse({ entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 1_000_000 });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(body()));
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDisplaySharedState('kitchen', enabled),
      { initialProps: { enabled: true } },
    );
    await flushPoll();
    expect(result.current.entries.k?.value).toBe('a');

    rerender({ enabled: false });
    expect(result.current.entries).toEqual({});
    const callsWhileDisabled = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsWhileDisabled);

    rerender({ enabled: true });
    await flushPoll();
    expect(result.current.entries.k?.value).toBe('a');
  });

  it('keeps the snapshot identity across polls that report nothing new', async () => {
    vi.setSystemTime(1_000_000);
    const body = { entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 1_000_000 };
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse(body)));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    const first = result.current;
    expect(first.states?.get('k')?.value).toBe('a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    // Two more polls with a byte-identical response: no state churn at all.
    expect(result.current).toBe(first);
  });

  it('preserves entries/states identity when only reportedAt advances', async () => {
    vi.setSystemTime(1_000_000);
    const entries = { k: { value: 'a', updatedAt: 1 } };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ entries, reportedAt: 1_000_000 }))
      .mockResolvedValueOnce(jsonResponse({ entries, reportedAt: 1_005_000 }));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    const first = result.current;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    // The heartbeat is newer, so reportedAt updates — but the unchanged
    // entries keep their references so memoized consumers don't recompute.
    expect(result.current).not.toBe(first);
    expect(result.current.reportedAt).toBe(1_005_000);
    expect(result.current.entries).toBe(first.entries);
    expect(result.current.states).toBe(first.states);
  });

  it('exposes states as null for a stale report and flips fresh verdicts to null once the report ages out', async () => {
    vi.setSystemTime(1_000_000);
    // Stale from the start: a minute-old report must never produce verdicts.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse({ entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 900_000 })),
    );
    const stale = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(stale.result.current.entries.k?.value).toBe('a');
    expect(stale.result.current.states).toBeNull();
    stale.unmount();

    // Fresh report, then the display goes silent (reportedAt frozen while the
    // wall clock advances): the poll loop re-evaluates freshness every tick,
    // so states flips to null right after the 60s cutoff.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse({ entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 1_000_000 })),
    );
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(result.current.states?.get('k')?.value).toBe('a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000);
    });
    expect(result.current.states).toBeNull();
    expect(result.current.entries.k?.value).toBe('a');
  });

  it('flips verdicts to null once the poll transport keeps rejecting past the cutoff', async () => {
    vi.setSystemTime(1_000_000);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    // One fresh report, then every poll rejects (network outage).
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 1_000_000 }),
    );
    fetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(result.current.states?.get('k')?.value).toBe('a');

    // Within 60s of failures the last snapshot is still served as fresh.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.states?.get('k')?.value).toBe('a');

    // Past the cutoff the failing polls re-run freshness and go neutral.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });
    expect(result.current.states).toBeNull();
    expect(result.current.entries.k?.value).toBe('a');
  });

  it('flips verdicts to null once the poll keeps returning non-OK past the cutoff', async () => {
    vi.setSystemTime(1_000_000);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ entries: { k: { value: 'a', updatedAt: 1 } }, reportedAt: 1_000_000 }),
    );
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    const { result } = renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(result.current.states?.get('k')?.value).toBe('a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.states?.get('k')?.value).toBe('a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });
    expect(result.current.states).toBeNull();
    expect(result.current.entries.k?.value).toBe('a');
  });

  it('shares one poll loop between consumers of the same display', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ entries: {}, reportedAt: null }),
    );
    renderHook(() => useDisplaySharedState('kitchen'));
    renderHook(() => useDisplaySharedState('kitchen'));
    await flushPoll();
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    // One interval for the slot, not one per consumer.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
