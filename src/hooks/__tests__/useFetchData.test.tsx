// @vitest-environment jsdom

/**
 * The kept-payload contract of useFetchData across URL changes: a new
 * dataset drops the old payload, while a new slice of the same dataset
 * (the calendar window advancing at midnight) keeps it through a failing
 * fetch, so a day rollover during an outage never blanks the wall.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { displayCache } from '@/lib/display-cache';

const translate = vi.hoisted(() => (key: string) => key);
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));

let hubUp = true;
const responses = new Map<string, unknown>();
let heldRequest: Promise<unknown> | null = null;
let requestCount = 0;
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string) => {
    requestCount++;
    if (heldRequest) {
      const pending = heldRequest;
      heldRequest = null;
      return { ok: true, json: async () => pending };
    }
    if (!hubUp) throw new Error('offline');
    return { ok: true, json: async () => responses.get(url) ?? { url } };
  },
}));

import { useFetchData, publishFetchData } from '../useFetchData';

beforeEach(() => {
  hubUp = true;
  heldRequest = null;
  requestCount = 0;
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


describe('useFetchData after a mutation', () => {
  it('publishes a mutation response immediately to every subscriber while refresh is pending', async () => {
    const url = '/api/family';
    responses.set(url, { revision: 'before-save' });
    const { result } = renderHook(() => ({
      first: useFetchData<{ revision: string }>(url, 60000),
      second: useFetchData<{ revision: string }>(url, 60000),
    }));
    await waitFor(() => expect(result.current.first[0]?.revision).toBe('before-save'));
    let finishRefresh!: (value: unknown) => void;
    heldRequest = new Promise((resolve) => { finishRefresh = resolve; });
    act(() => publishFetchData(url, { revision: 'saved' }, 60000));
    expect(result.current.first[0]?.revision).toBe('saved');
    expect(result.current.second[0]?.revision).toBe('saved');
    await act(async () => { finishRefresh({ revision: 'even-newer' }); });
    expect(result.current.first[0]?.revision).toBe('even-newer');
    expect(result.current.second[0]?.revision).toBe('even-newer');
  });

  it('supersedes an old shared request once and cannot let its late result undo the mutation', async () => {
    const url = '/api/family';
    let releaseOld!: (value: unknown) => void;
    heldRequest = new Promise((resolve) => { releaseOld = resolve; });
    const { result } = renderHook(() => ({
      first: useFetchData<{ revision: string }>(url, 60000),
      second: useFetchData<{ revision: string }>(url, 60000),
    }));
    await waitFor(() => expect(requestCount).toBe(1));
    responses.set(url, { revision: 'after-save' });
    act(() => displayCache.invalidate(url));
    await waitFor(() => expect(result.current.first[0]?.revision).toBe('after-save'));
    expect(result.current.second[0]?.revision).toBe('after-save');
    expect(requestCount).toBe(2);

    await act(async () => { releaseOld({ revision: 'before-save' }); });
    expect(result.current.first[0]?.revision).toBe('after-save');
    expect(result.current.second[0]?.revision).toBe('after-save');
    expect(displayCache.get<{ revision: string }>(url)?.data.revision).toBe('after-save');
  });
});
