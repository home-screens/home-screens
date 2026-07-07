// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEditorData } from '../useEditorData';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useEditorData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches on mount and exposes the parsed body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ hello: 'world' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEditorData<{ hello: string }>('/api/thing'));

    await waitFor(() => expect(result.current.data).toEqual({ hello: 'world' }));
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not fetch and keeps data null when url is null', () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEditorData<unknown>(null));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets error and leaves data null on a non-ok response', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEditorData('/api/thing'));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('sets error on a network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEditorData('/api/thing'));

    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it('refetch() re-runs the current url', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => jsonResponse({ n: ++n }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useEditorData<{ n: number }>('/api/thing'));
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches when the url changes and disables (resets) on null', async () => {
    const fetchMock = vi.fn(async (url: string) => jsonResponse({ url }));
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ url }: { url: string | null }) => useEditorData<{ url: string }>(url),
      { initialProps: { url: '/api/a' as string | null } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ url: '/api/a' }));

    rerender({ url: '/api/b' });
    await waitFor(() => expect(result.current.data).toEqual({ url: '/api/b' }));

    rerender({ url: null });
    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
