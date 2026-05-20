// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUpdateNotification } from '../useUpdateNotification';

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

function makeFetchMock(responses: Record<string, unknown>): ReturnType<typeof vi.fn> & FetchFn {
  return vi.fn(async (url: string) => {
    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response('Not found', { status: 404 });
  }) as ReturnType<typeof vi.fn> & FetchFn;
}

const VERSION_NO_UPDATE = {
  updateAvailable: false,
  latest: '1.5.0',
  latestCommit: null,
  current: '1.5.0',
  currentCommit: 'abc123',
  tags: [{ tag: 'v1.5.0', version: '1.5.0', commit: 'abc123' }],
  upgradeRunning: false,
  installedVia: 'git' as const,
  channel: 'stable',
};

const VERSION_UPDATE_AVAILABLE = {
  updateAvailable: true,
  latest: '1.6.0',
  latestCommit: 'def456',
  current: '1.5.0',
  currentCommit: 'abc123',
  tags: [{ tag: 'v1.6.0', version: '1.6.0', commit: 'def456' }],
  upgradeRunning: false,
  installedVia: 'git' as const,
  channel: 'stable',
};

describe('useUpdateNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shouldShow is false when enabled is false', async () => {
    const fetchFn = makeFetchMock({
      '/api/system/version': VERSION_UPDATE_AVAILABLE,
      '/api/system/update-notification': { lastDismissedVersion: null },
    });

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: false, fetchFn })
    );

    // Even without waiting, enabled=false means shouldShow is always false
    expect(result.current.shouldShow).toBe(false);
    // Confirm fetch was not called since enabled=false
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('shouldShow is false when no update is available', async () => {
    const fetchFn = makeFetchMock({
      '/api/system/version': VERSION_NO_UPDATE,
      '/api/system/update-notification': { lastDismissedVersion: null },
    });

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: true, fetchFn })
    );

    await waitFor(() => expect(result.current.latestVersion).toBe('1.5.0'));

    expect(result.current.shouldShow).toBe(false);
  });

  it('shouldShow is true when an update is available and not dismissed', async () => {
    const fetchFn = makeFetchMock({
      '/api/system/version': VERSION_UPDATE_AVAILABLE,
      '/api/system/update-notification': { lastDismissedVersion: null },
    });

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: true, fetchFn })
    );

    await waitFor(() => expect(result.current.shouldShow).toBe(true));
  });

  it('shouldShow is false when the latest tag matches lastDismissedVersion', async () => {
    const fetchFn = makeFetchMock({
      '/api/system/version': VERSION_UPDATE_AVAILABLE,
      '/api/system/update-notification': { lastDismissedVersion: 'v1.6.0' },
    });

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: true, fetchFn })
    );

    await waitFor(() => expect(result.current.latestTag).toBe('v1.6.0'));

    expect(result.current.shouldShow).toBe(false);
  });

  it('shouldShow is true when a newer version ships after a dismissal', async () => {
    const fetchFn = makeFetchMock({
      '/api/system/version': VERSION_UPDATE_AVAILABLE,
      '/api/system/update-notification': { lastDismissedVersion: 'v1.5.0' },
    });

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: true, fetchFn })
    );

    // v1.6.0 is available but only v1.5.0 was dismissed — shouldShow must be true
    await waitFor(() => expect(result.current.shouldShow).toBe(true));
  });

  it('handleDismiss flips shouldShow to false and POSTs the dismiss action', async () => {
    const fetchFn = makeFetchMock({
      '/api/system/version': VERSION_UPDATE_AVAILABLE,
      '/api/system/update-notification': { lastDismissedVersion: null },
    });

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: true, fetchFn })
    );

    // Wait until shouldShow is true
    await waitFor(() => expect(result.current.shouldShow).toBe(true));

    // Dismiss
    act(() => {
      result.current.handleDismiss();
    });

    // shouldShow should be false immediately (optimistic local state)
    expect(result.current.shouldShow).toBe(false);

    // Verify POST was made with the correct body
    const postCalls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => {
        const [url, opts] = call as [string, RequestInit | undefined];
        return url === '/api/system/update-notification' && opts?.method === 'POST';
      }
    );
    expect(postCalls.length).toBe(1);
    const [, postOptions] = postCalls[0] as [string, RequestInit];
    expect(JSON.parse(postOptions.body as string)).toEqual({
      action: 'dismiss',
      version: 'v1.6.0',
    });
  });

  it('re-surfaces the toast when a newer tag is published after a dismissal', async () => {
    // Stateful mock: dismiss POSTs mutate `responses.dismissal`, and the
    // version response can be swapped out to simulate a new release shipping.
    const responses = {
      version: { ...VERSION_UPDATE_AVAILABLE } as typeof VERSION_UPDATE_AVAILABLE,
      dismissal: { lastDismissedVersion: null as string | null },
    };
    const fetchFn = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.includes('/api/system/version')) {
        return new Response(JSON.stringify(responses.version), { status: 200 });
      }
      if (url.includes('/api/system/update-notification')) {
        if (opts?.method === 'POST') {
          const body = JSON.parse(opts.body as string);
          if (body.action === 'dismiss') {
            responses.dismissal = { lastDismissedVersion: body.version };
          }
          return new Response('{}', { status: 200 });
        }
        return new Response(JSON.stringify(responses.dismissal), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as ReturnType<typeof vi.fn> & FetchFn;

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: true, fetchFn, pollIntervalMs: 30 })
    );

    await waitFor(() => expect(result.current.shouldShow).toBe(true));

    act(() => {
      result.current.handleDismiss();
    });
    expect(result.current.shouldShow).toBe(false);

    // A newer release ships. The server-side lastDismissedVersion is still
    // anchored to v1.6.0, so the toast must re-appear for v1.7.0.
    responses.version = {
      ...VERSION_UPDATE_AVAILABLE,
      latest: '1.7.0',
      latestCommit: 'ghi789',
      tags: [{ tag: 'v1.7.0', version: '1.7.0', commit: 'ghi789' }],
    };

    await waitFor(() => expect(result.current.latestTag).toBe('v1.7.0'));
    await waitFor(() => expect(result.current.shouldShow).toBe(true));
  });

  it('picks up cross-surface dismissals on the next poll', async () => {
    // Simulates: the editor toast is open, but the user dismisses from the
    // remote banner — the editor instance must suppress its toast within one
    // poll tick rather than waiting for a full remount.
    const responses = {
      version: { ...VERSION_UPDATE_AVAILABLE },
      dismissal: { lastDismissedVersion: null as string | null },
    };
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/api/system/version')) {
        return new Response(JSON.stringify(responses.version), { status: 200 });
      }
      if (url.includes('/api/system/update-notification')) {
        return new Response(JSON.stringify(responses.dismissal), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as ReturnType<typeof vi.fn> & FetchFn;

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: true, fetchFn, pollIntervalMs: 30 })
    );

    await waitFor(() => expect(result.current.shouldShow).toBe(true));

    // Another surface dismissed v1.6.0 in the meantime.
    responses.dismissal = { lastDismissedVersion: 'v1.6.0' };

    await waitFor(() => expect(result.current.shouldShow).toBe(false));
  });

  it('latestVersion and latestTag are populated correctly', async () => {
    const fetchFn = makeFetchMock({
      '/api/system/version': VERSION_UPDATE_AVAILABLE,
      '/api/system/update-notification': { lastDismissedVersion: null },
    });

    const { result } = renderHook(() =>
      useUpdateNotification({ enabled: true, fetchFn })
    );

    await waitFor(() => expect(result.current.latestVersion).not.toBeNull());

    // latestVersion has no "v" prefix
    expect(result.current.latestVersion).toBe('1.6.0');
    // latestTag has "v" prefix
    expect(result.current.latestTag).toBe('v1.6.0');
  });
});
