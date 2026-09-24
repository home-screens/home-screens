// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

/**
 * The hub answers `null` for a display that has never sent a heartbeat (a
 * 200, so a new install's phone console stays clean). The phone must still
 * tell that apart from a display it has heard from, so the hero can say
 * "hasn't connected yet" instead of waiting forever.
 */

let body: unknown = null;
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response),
  isSessionExpired: () => false,
}));

const { useRemoteStatus } = await import('../hooks');

afterEach(() => cleanup());

describe('useRemoteStatus', () => {
  it('reads a null answer as a display that has not connected yet', async () => {
    body = null;
    const { result } = renderHook(() => useRemoteStatus(60_000, 'kitchen'));
    await waitFor(() => expect(result.current.neverConnected).toBe(true));
    expect(result.current.status).toBeNull();
    expect(result.current.isConnected).toBe(true);
    expect(result.current.lastUpdated).toBeNull();
  });

  it('reads a reported status as connected', async () => {
    body = {
      currentScreen: { index: 0, id: 's1', name: 'Main' }, screenCount: 1, activeProfile: null,
      displayState: 'active', timestamp: 123,
    };
    const { result } = renderHook(() => useRemoteStatus(60_000, 'kitchen'));
    await waitFor(() => expect(result.current.status?.currentScreen.id).toBe('s1'));
    expect(result.current.neverConnected).toBe(false);
    expect(result.current.lastUpdated).not.toBeNull();
  });
});
