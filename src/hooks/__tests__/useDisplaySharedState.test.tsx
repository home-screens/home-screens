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
});
