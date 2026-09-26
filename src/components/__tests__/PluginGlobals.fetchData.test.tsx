// @vitest-environment jsdom

/**
 * `__HS_SDK__.useFetchData` keeps the contract plugins were written against:
 * every successful fetch hands them a new `data` object, nested objects
 * included, and a new `updatedAt`, even when the answer did not change. The
 * host hook keeps one object for an unchanged answer; a plugin that keyed a
 * memo or effect on `data` to mean "a fetch happened" must not stop moving.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { displayCache } from '@/lib/display-cache';
import PluginGlobals from '@/components/PluginGlobals';
import { useFetchData } from '@/hooks/useFetchData';

const body = JSON.stringify({ reading: { value: 21 }, items: [{ id: 'a' }] });
let requests = 0;
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async () => {
    requests++;
    return { ok: true, text: async () => body, headers: new Headers() };
  },
}));

type Reading = { reading: { value: number }; items: Array<{ id: string }> };
type SdkFetch = (url: string, refreshMs: number) => [Reading | null, string | null, number | null];

function wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="en-US" blob={{}}>{children}</I18nProvider>;
}

function sdkFetch(): SdkFetch {
  const sdk = window.__HS_SDK__ as unknown as { useFetchData?: SdkFetch } | undefined;
  if (!sdk?.useFetchData) throw new Error('__HS_SDK__ was not installed by PluginGlobals');
  return sdk.useFetchData;
}

beforeEach(async () => {
  __resetLoaderForTests();
  displayCache.clear();
  requests = 0;
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ core: {} }), { status: 200 }));
  await act(async () => {
    render(<I18nProvider locale="en-US" blob={{}}><PluginGlobals /></I18nProvider>);
  });
});

afterEach(() => {
  cleanup();
  delete window.__HS_SDK__;
  vi.restoreAllMocks();
});

describe('__HS_SDK__.useFetchData', () => {
  it('hands a plugin a new copy on every fetch, nested objects included, when nothing changed', async () => {
    const useSdkFetch = sdkFetch();
    const { result } = renderHook(() => useSdkFetch('/api/plugin-probe', 20), { wrapper });
    await waitFor(() => expect(result.current[0]).not.toBeNull());
    const [first, , firstAt] = result.current;

    await waitFor(() => expect(result.current[2]).toBeGreaterThan(firstAt!));

    const [next] = result.current;
    expect(next).toEqual(first);
    expect(next).not.toBe(first);
    expect(next!.reading).not.toBe(first!.reading);
    expect(next!.items).not.toBe(first!.items);
  });

  it('while the host hook keeps one object for the same answer', async () => {
    const { result } = renderHook(() => useFetchData<Reading>('/api/plugin-probe', 20), { wrapper });
    await waitFor(() => expect(result.current[0]).not.toBeNull());
    const first = result.current[0];
    const before = requests;

    await waitFor(() => expect(requests).toBeGreaterThanOrEqual(before + 2));

    expect(result.current[0]).toBe(first);
  });
});
