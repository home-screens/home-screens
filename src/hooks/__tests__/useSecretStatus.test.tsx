// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSecretStatus, __resetSecretStatusForTests } from '../useSecretStatus';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useSecretStatus', () => {
  beforeEach(() => {
    __resetSecretStatusForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is loading with an empty status until the first response lands', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ todoist_token: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSecretStatus());

    expect(result.current.loading).toBe(true);
    expect(result.current.status).toEqual({});

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toEqual({ todoist_token: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('concurrent mounts share a single in-flight request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ nasa_api_key: true }));
    vi.stubGlobal('fetch', fetchMock);

    const a = renderHook(() => useSecretStatus());
    const b = renderHook(() => useSecretStatus());

    await waitFor(() => expect(a.result.current.status).toEqual({ nasa_api_key: true }));
    await waitFor(() => expect(b.result.current.status).toEqual({ nasa_api_key: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a mount inside the TTL window reuses the cache without refetching', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ tomtom_key: true }));
    vi.stubGlobal('fetch', fetchMock);

    const first = renderHook(() => useSecretStatus());
    await waitFor(() => expect(first.result.current.status).toEqual({ tomtom_key: true }));
    first.unmount();

    const second = renderHook(() => useSecretStatus());
    expect(second.result.current.status).toEqual({ tomtom_key: true });
    expect(second.result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetch() bypasses the TTL and updates in place without re-entering loading', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => jsonResponse({ todoist_token: ++call > 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSecretStatus());
    await waitFor(() => expect(result.current.status).toEqual({ todoist_token: false }));

    act(() => {
      result.current.refetch();
    });

    // The stale status stays visible while the refetch is in flight — the
    // consumers (e.g. the Integrations grid) must not flash their loading UI.
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.status).toEqual({ todoist_token: true }));
    expect(result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a refetch after a failed first fetch does not re-enter loading', async () => {
    let resolveSecond: (r: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockImplementationOnce(() => new Promise<Response>((r) => { resolveSecond = r; }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSecretStatus());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.refetch();
    });

    // In flight after an error: still not loading — the first response
    // (even a failure) settles the loading state permanently.
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveSecond(jsonResponse({ github_token: true }));
    });
    await waitFor(() => expect(result.current.status).toEqual({ github_token: true }));
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('stops loading, reports error, and keeps status empty on a failed request', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSecretStatus());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.status).toEqual({});
  });

  it('a forced refetch issued during an in-flight request is not dropped', async () => {
    let resolveFirst: (r: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(jsonResponse({ tomtom_key: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSecretStatus());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A key is saved while the mount fetch is still in flight — the refetch
    // must chain a second request, since the in-flight response predates it.
    act(() => {
      result.current.refetch();
    });
    await act(async () => {
      resolveFirst(jsonResponse({}));
    });

    await waitFor(() => expect(result.current.status).toEqual({ tomtom_key: true }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch when disabled and reads empty regardless of the cache', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ unsplash_access_key: true }));
    vi.stubGlobal('fetch', fetchMock);

    const enabled = renderHook(() => useSecretStatus());
    await waitFor(() => expect(enabled.result.current.status).toEqual({ unsplash_access_key: true }));

    const disabled = renderHook(() => useSecretStatus(false));
    expect(disabled.result.current.loading).toBe(false);
    expect(disabled.result.current.status).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
