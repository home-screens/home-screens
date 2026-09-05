// @vitest-environment jsdom

/**
 * The kept-payload contract of useFetchData across URL changes: a new
 * dataset drops the old payload, while a new slice of the same dataset
 * (the calendar window advancing at midnight) keeps it through a failing
 * fetch, so a day rollover during an outage never blanks the wall.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { displayCache } from '@/lib/display-cache';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));

let hubUp = true;
const responses = new Map<string, unknown>();
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string) => {
    if (!hubUp) throw new Error('offline');
    return { ok: true, json: async () => responses.get(url) ?? { url } };
  },
}));

import { useFetchData } from '../useFetchData';

beforeEach(() => {
  hubUp = true;
  responses.clear();
  displayCache.clear();
});
afterEach(() => vi.restoreAllMocks());

const DAY1 = '/api/calendar?timeMin=2026-09-04';
const DAY2 = '/api/calendar?timeMin=2026-09-05';

describe('useFetchData across URL changes', () => {
  it('drops the kept payload when the URL changes to a different dataset', async () => {
    responses.set('/api/weather?p=a', { p: 'a' });
    const { result, rerender } = renderHook(({ url }) => useFetchData<{ p: string }>(url, 60000), {
      initialProps: { url: '/api/weather?p=a' },
    });
    await waitFor(() => expect(result.current[0]).toEqual({ p: 'a' }));

    hubUp = false;
    rerender({ url: '/api/weather?p=b' });
    await waitFor(() => expect(result.current[1]).not.toBeNull());
    expect(result.current[0]).toBeNull();
    expect(result.current[2]).toBeNull();
  });

  it('keeps the payload and its fetch time across a window change within one dataset while the hub is down', async () => {
    responses.set(DAY1, { events: ['kept'] });
    const { result, rerender } = renderHook(
      ({ url }) => useFetchData<{ events: string[] }>(url, 60000, '/api/calendar'),
      { initialProps: { url: DAY1 } },
    );
    await waitFor(() => expect(result.current[0]).toEqual({ events: ['kept'] }));
    const fetchedAt = result.current[2];
    expect(fetchedAt).not.toBeNull();

    // Midnight: the window advances, the URL changes, and the hub is unreachable.
    hubUp = false;
    rerender({ url: DAY2 });
    await waitFor(() => expect(result.current[1]).not.toBeNull());
    // The events already on the wall stay, badged as not updating since the
    // old fetch time, instead of "can't load".
    expect(result.current[0]).toEqual({ events: ['kept'] });
    expect(result.current[2]).toBe(fetchedAt);
  });

  it('replaces the kept payload once the new window fetches', async () => {
    responses.set(DAY1, { events: ['old'] });
    responses.set(DAY2, { events: ['new'] });
    const { result, rerender } = renderHook(
      ({ url }) => useFetchData<{ events: string[] }>(url, 60000, '/api/calendar'),
      { initialProps: { url: DAY1 } },
    );
    await waitFor(() => expect(result.current[0]).toEqual({ events: ['old'] }));
    rerender({ url: DAY2 });
    await waitFor(() => expect(result.current[0]).toEqual({ events: ['new'] }));
    expect(result.current[1]).toBeNull();
  });

  it('still drops the payload when the dataset key itself changes', async () => {
    responses.set(DAY1, { events: ['a'] });
    const { result, rerender } = renderHook(
      ({ url, key }) => useFetchData<{ events: string[] }>(url, 60000, key),
      { initialProps: { url: DAY1, key: 'sources-a' } },
    );
    await waitFor(() => expect(result.current[0]).toEqual({ events: ['a'] }));
    hubUp = false;
    rerender({ url: DAY2, key: 'sources-b' });
    await waitFor(() => expect(result.current[1]).not.toBeNull());
    expect(result.current[0]).toBeNull();
  });
});
