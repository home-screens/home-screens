// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOrigin, isLoopbackHost, __resetOriginForTests } from '../useOrigin';

// jsdom's default location is http://localhost:3000/, the kiosk-on-the-hub case.
function mockAddress(body: unknown, ok = true) {
  const fetchMock = vi.fn(async (_input: string | URL | Request) => ({ ok, json: async () => body }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('isLoopbackHost', () => {
  it('recognises every spelling of "this machine" and nothing else', () => {
    for (const h of ['localhost', 'LOCALHOST', 'hub.localhost', '127.0.0.1', '127.1.2.3', '[::1]', '0.0.0.0']) {
      expect(isLoopbackHost(h), h).toBe(true);
    }
    for (const h of ['192.168.1.20', 'homescreens.local', 'localhost.example.com', '10.0.0.1']) {
      expect(isLoopbackHost(h), h).toBe(false);
    }
  });
});

describe('useOrigin', () => {
  beforeEach(() => { __resetOriginForTests(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('swaps a loopback origin for the hub LAN address, fetching it once for every caller', async () => {
    const fetchMock = mockAddress({ origin: 'http://192.168.1.20:3000' });
    const a = renderHook(() => useOrigin());
    const b = renderHook(() => useOrigin());
    await waitFor(() => expect(a.result.current).toBe('http://192.168.1.20:3000'));
    await waitFor(() => expect(b.result.current).toBe('http://192.168.1.20:3000'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/system/address');
  });

  it('falls back to the loopback origin when the hub has no LAN address', async () => {
    mockAddress({ origin: null });
    const { result } = renderHook(() => useOrigin());
    await waitFor(() => expect(result.current).toBe('http://localhost:3000'));
  });

  it('falls back to the loopback origin when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { result } = renderHook(() => useOrigin());
    await waitFor(() => expect(result.current).toBe('http://localhost:3000'));
  });
});
