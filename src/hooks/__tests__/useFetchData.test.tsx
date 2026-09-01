// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('@/lib/display-cache', () => ({
  displayCache: { get: () => null, set: () => {} },
}));

const displayFetch = vi.fn();
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: (...args: unknown[]) => displayFetch(...args),
}));

import { useFetchData } from '../useFetchData';

function okResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('useFetchData', () => {
  beforeEach(() => {
    displayFetch.mockReset();
  });

  it('drops the kept payload when the URL changes so a new request never renders old data', async () => {
    const pending = new Promise(() => {}); // the new URL's fetch never settles
    displayFetch.mockImplementation((url: string) =>
      url.includes('charts=day') ? okResponse({ stocks: [{ symbol: 'AAPL', sparkline: [1, 2] }] }) : pending,
    );

    const { result, rerender } = renderHook(
      ({ url }) => useFetchData<{ stocks: unknown[] }>(url, 60_000),
      { initialProps: { url: '/api/stocks?symbols=AAPL&charts=day' } },
    );
    await waitFor(() => expect(result.current[0]).not.toBeNull());

    rerender({ url: '/api/stocks?symbols=AAPL&charts=week' });

    expect(result.current[0]).toBeNull();
    expect(result.current[1]).toBeNull();
    expect(result.current[2]).toBeNull();
  });

  it('keeps the payload across a refreshMs change for the same URL', async () => {
    displayFetch.mockImplementation(() => okResponse({ ok: 1 }));

    const { result, rerender } = renderHook(
      ({ url, refresh }) => useFetchData<{ ok: number }>(url, refresh),
      { initialProps: { url: '/api/x', refresh: 60_000 } },
    );
    await waitFor(() => expect(result.current[0]).toEqual({ ok: 1 }));

    rerender({ url: '/api/x', refresh: 30_000 });

    expect(result.current[0]).toEqual({ ok: 1 });
  });

  it('keeps the last good payload when a refresh of the same URL fails', async () => {
    let fail = false;
    displayFetch.mockImplementation(() =>
      fail
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'boom' }) })
        : okResponse({ ok: 1 }),
    );

    const { result } = renderHook(() => useFetchData<{ ok: number }>('/api/x', 60_000));
    await waitFor(() => expect(result.current[0]).toEqual({ ok: 1 }));

    fail = true;
    window.dispatchEvent(new CustomEvent('displaycache:invalidate', { detail: '/api/x' }));
    await waitFor(() => expect(result.current[1]).toEqual({ kind: 'transient', message: 'boom' }));

    expect(result.current[0]).toEqual({ ok: 1 });
  });
});
