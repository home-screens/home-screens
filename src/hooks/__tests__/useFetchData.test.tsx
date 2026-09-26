// @vitest-environment jsdom

/**
 * The kept-payload contract of useFetchData across URL changes: a new
 * dataset drops the old payload, while a new slice of the same dataset
 * (the calendar window advancing at midnight) keeps it through a failing
 * fetch, so a day rollover during an outage never blanks the wall.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { displayCache } from '@/lib/display-cache';

const translate = vi.hoisted(() => (key: string) => key);
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));

let hubUp = true;
const responses = new Map<string, unknown>();
/** The ETag an answer carries, by URL; none when unset. */
const etags = new Map<string, string>();
let heldRequest: Promise<unknown> | null = null;
let requestCount = 0;
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string) => {
    requestCount++;
    if (heldRequest) {
      const pending = heldRequest;
      heldRequest = null;
      return { ok: true, text: async () => JSON.stringify(await pending) };
    }
    if (!hubUp) throw new Error('offline');
    const body = JSON.stringify(responses.get(url) ?? { url });
    const etag = etags.get(url);
    return { ok: true, text: async () => body, headers: new Headers(etag ? { ETag: etag } : {}) };
  },
}));

import { useFetchData } from '../useFetchData';
import { publishRevisions, __resetHeartbeatForTests } from '@/lib/display-heartbeat';

beforeEach(() => {
  hubUp = true;
  heldRequest = null;
  requestCount = 0;
  responses.clear();
  etags.clear();
  displayCache.clear();
  __resetHeartbeatForTests();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
      ({ url }) => useFetchData<{ events: string[] }>(url, 60000, { datasetKey: '/api/calendar' }),
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
      ({ url }) => useFetchData<{ events: string[] }>(url, 60000, { datasetKey: '/api/calendar' }),
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
      ({ url, key }) => useFetchData<{ events: string[] }>(url, 60000, { datasetKey: key }),
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
  it('hands a write response to every subscriber without asking the hub again', async () => {
    const url = '/api/family';
    responses.set(url, { revision: 'before-save' });
    const { result } = renderHook(() => ({
      first: useFetchData<{ revision: string }>(url, 60000),
      second: useFetchData<{ revision: string }>(url, 60000),
    }));
    await waitFor(() => expect(result.current.first[0]?.revision).toBe('before-save'));
    expect(requestCount).toBe(1);
    act(() => displayCache.replace(url, { revision: 'saved' }, 60000));
    expect(result.current.first[0]?.revision).toBe('saved');
    expect(result.current.second[0]?.revision).toBe('saved');
    expect(requestCount).toBe(1);
  });

  /* A poll that started before a write and answers after it carries the
   * pre-write snapshot. Publishing the write's response has to supersede that
   * poll, or the wall shows the tick, loses it when the poll lands, and gets
   * it back on the poll after. */
  it('does not let a poll that was out during the write undo its published response', async () => {
    const url = '/api/todo/lists';
    let releaseOld!: (value: unknown) => void;
    heldRequest = new Promise((resolve) => { releaseOld = resolve; });
    const { result } = renderHook(() => ({
      first: useFetchData<{ revision: string }>(url, 60000),
      second: useFetchData<{ revision: string }>(url, 60000),
    }));
    await waitFor(() => expect(requestCount).toBe(1));

    act(() => displayCache.replace(url, { revision: 'saved' }, 60000));
    expect(result.current.first[0]?.revision).toBe('saved');
    expect(result.current.second[0]?.revision).toBe('saved');

    await act(async () => { releaseOld({ revision: 'before-save' }); });
    expect(result.current.first[0]?.revision).toBe('saved');
    expect(result.current.second[0]?.revision).toBe('saved');
    expect(displayCache.get<{ revision: string }>(url)?.data.revision).toBe('saved');
    expect(requestCount).toBe(1);
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


/** Resolves once `count` more requests went out than when it was called. */
async function morePolls(count: number) {
  const target = requestCount + count;
  await waitFor(() => expect(requestCount).toBeGreaterThanOrEqual(target));
}

describe('useFetchData when a poll changed nothing', () => {
  it('keeps the same object and renders nothing', async () => {
    const url = '/api/family';
    responses.set(url, { members: ['ada'] });
    let renders = 0;
    const { result } = renderHook(() => { renders++; return useFetchData<{ members: string[] }>(url, 20); });
    await waitFor(() => expect(result.current[0]).toEqual({ members: ['ada'] }));
    const first = result.current[0];
    const settled = renders;

    await morePolls(3);

    expect(result.current[0]).toBe(first);
    expect(renders).toBe(settled);
  });

  it('hands over a new object once the bytes change', async () => {
    const url = '/api/family';
    responses.set(url, { members: ['ada'] });
    const { result } = renderHook(() => useFetchData<{ members: string[] }>(url, 20));
    await waitFor(() => expect(result.current[0]).toEqual({ members: ['ada'] }));

    responses.set(url, { members: ['ada', 'bram'] });

    await waitFor(() => expect(result.current[0]).toEqual({ members: ['ada', 'bram'] }));
  });

  it('keeps updatedAt while nothing changes, and says when the last good fetch was once one fails', async () => {
    const url = '/api/family';
    responses.set(url, { members: ['ada'] });
    const { result } = renderHook(() => useFetchData<{ members: string[] }>(url, 20));
    await waitFor(() => expect(result.current[2]).not.toBeNull());
    const changedAt = result.current[2]!;

    await morePolls(3);
    expect(result.current[2]).toBe(changedAt);

    hubUp = false;
    await waitFor(() => expect(result.current[1]).not.toBeNull());
    // Later than the change: the polls after it worked, and the wall's "saved
    // X ago" counts from the last of them.
    expect(result.current[2]).toBeGreaterThan(changedAt);
    expect(result.current[0]).toEqual({ members: ['ada'] });
  });

  it('moves updatedAt on every fetch when asked to, for the plugin SDK', async () => {
    const url = '/api/family';
    responses.set(url, { members: ['ada'] });
    const { result } = renderHook(() => useFetchData<{ members: string[] }>(url, 20, { stampEveryFetch: true }));
    await waitFor(() => expect(result.current[2]).not.toBeNull());
    const first = result.current[2]!;

    await waitFor(() => expect(result.current[2]).toBeGreaterThan(first));
  });

  /* A write's answer is published with replace(). If the next answer were
   * compared with the bytes fetched before the write, a household that undid
   * the write from another screen would send those same bytes back, and the
   * wall would keep showing the write. */
  it('treats the first answer after a published write as new, even with the bytes fetched before it', async () => {
    const url = '/api/todo/lists';
    responses.set(url, { lists: ['before'] });
    const { result } = renderHook(() => useFetchData<{ lists: string[] }>(url, 20));
    await waitFor(() => expect(result.current[0]).toEqual({ lists: ['before'] }));

    act(() => displayCache.replace(url, { lists: ['written'] }, 20));
    expect(result.current[0]).toEqual({ lists: ['written'] });

    await waitFor(() => expect(result.current[0]).toEqual({ lists: ['before'] }));
  });
});

describe('useFetchData following the heartbeat', () => {
  const CHORES = '/api/chores?days=31';

  it('fetches a read the heartbeat reports on once, then only when a beat names a new revision', async () => {
    responses.set(CHORES, { completions: ['a'] });
    publishRevisions({ chores: '"r1"' });
    const { result } = renderHook(() => ({
      card: useFetchData<{ completions: string[] }>(CHORES, 20),
      calendar: useFetchData<{ completions: string[] }>(CHORES, 20),
    }));
    await waitFor(() => expect(result.current.card[0]).toEqual({ completions: ['a'] }));
    expect(requestCount).toBe(1);

    // Beats naming the same revision, and many poll intervals: nothing asked.
    for (let i = 0; i < 5; i++) {
      act(() => publishRevisions({ chores: '"r1"' }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(requestCount).toBe(1);

    responses.set(CHORES, { completions: ['a', 'b'] });
    act(() => publishRevisions({ chores: '"r2"' }));
    await waitFor(() => expect(result.current.card[0]).toEqual({ completions: ['a', 'b'] }));
    expect(result.current.calendar[0]).toBe(result.current.card[0]);
    // Both subscribers heard the beat; they shared one request.
    expect(requestCount).toBe(2);
  });

  it('takes a remount from the cache while the beat still names what it holds', async () => {
    responses.set(CHORES, { completions: ['a'] });
    publishRevisions({ chores: '"r1"' });
    const first = renderHook(() => useFetchData<{ completions: string[] }>(CHORES, 20));
    await waitFor(() => expect(first.result.current[0]).toEqual({ completions: ['a'] }));
    first.unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The screen comes round again, long after the 20 ms the read lives for.
    const again = renderHook(() => useFetchData<{ completions: string[] }>(CHORES, 20));

    expect(again.result.current[0]).toEqual({ completions: ['a'] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requestCount).toBe(1);
  });

  it('counts a read made before the first beat as current once that beat names its ETag', async () => {
    responses.set(CHORES, { completions: ['a'] });
    etags.set(CHORES, '"r1"');
    // The page has taken no beat yet when the chart mounts and reads. A long
    // interval, so only a beat could cause another read.
    const { result } = renderHook(() => useFetchData<{ completions: string[] }>(CHORES, 60_000));
    await waitFor(() => expect(result.current[0]).toEqual({ completions: ['a'] }));

    for (let i = 0; i < 3; i++) {
      act(() => publishRevisions({ chores: '"r1"' }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(requestCount).toBe(1);
  });

  it('reads again on the first beat when the answer carried no ETag to go by', async () => {
    responses.set(CHORES, { completions: ['a'] });
    renderHook(() => useFetchData<{ completions: string[] }>(CHORES, 60_000));
    await waitFor(() => expect(requestCount).toBe(1));

    act(() => publishRevisions({ chores: '"r1"' }));

    await waitFor(() => expect(requestCount).toBe(2));
    act(() => publishRevisions({ chores: '"r1"' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requestCount).toBe(2);
  });

  /* A card decides whether to read again from the shared cache. When its own
   * read failed and something else then stored the new revision (a prefetch
   * for the next screen, or another card mounting), the cache is current and
   * the card must take the data from there, not wait for another change. */
  it('takes the current data from the cache when a prefetch stored it after this card\'s read failed', async () => {
    responses.set(CHORES, { completions: ['a'] });
    etags.set(CHORES, '"r1"');
    publishRevisions({ chores: '"r1"' });
    const { result } = renderHook(() => useFetchData<{ completions: string[] }>(CHORES, 60_000));
    await waitFor(() => expect(result.current[0]).toEqual({ completions: ['a'] }));

    hubUp = false;
    act(() => publishRevisions({ chores: '"r2"' }));
    await waitFor(() => expect(result.current[1]).not.toBeNull());

    hubUp = true;
    responses.set(CHORES, { completions: ['a', 'b'] });
    etags.set(CHORES, '"r2"');
    await act(async () => { await displayCache.prefetch(CHORES, 60_000); });
    const asked = requestCount;

    act(() => publishRevisions({ chores: '"r2"' }));

    await waitFor(() => expect(result.current[0]).toEqual({ completions: ['a', 'b'] }));
    expect(result.current[1]).toBeNull();
    expect(requestCount).toBe(asked);
  });

  it('takes the current data from the cache when another card read it after this one\'s read failed', async () => {
    responses.set(CHORES, { completions: ['a'] });
    etags.set(CHORES, '"r1"');
    publishRevisions({ chores: '"r1"' });
    const first = renderHook(() => useFetchData<{ completions: string[] }>(CHORES, 60_000));
    await waitFor(() => expect(first.result.current[0]).toEqual({ completions: ['a'] }));

    hubUp = false;
    act(() => publishRevisions({ chores: '"r2"' }));
    await waitFor(() => expect(first.result.current[1]).not.toBeNull());

    hubUp = true;
    responses.set(CHORES, { completions: ['a', 'b'] });
    etags.set(CHORES, '"r2"');
    const second = renderHook(() => useFetchData<{ completions: string[] }>(CHORES, 60_000));
    await waitFor(() => expect(second.result.current[0]).toEqual({ completions: ['a', 'b'] }));

    act(() => publishRevisions({ chores: '"r2"' }));

    await waitFor(() => expect(first.result.current[0]).toBe(second.result.current[0]));
    expect(first.result.current[1]).toBeNull();
  });

  it('polls on its own interval again when the beat stops naming it', async () => {
    responses.set(CHORES, { completions: ['a'] });
    publishRevisions({ chores: '"r1"' });
    renderHook(() => useFetchData<{ completions: string[] }>(CHORES, 20));
    await waitFor(() => expect(requestCount).toBe(1));

    // A hub that cannot work the revision out leaves it out of the beat.
    act(() => publishRevisions({ buildId: 'b1' }));

    await morePolls(2);
  });

  it('keeps polling a read the heartbeat does not report on, beats or not', async () => {
    const url = '/api/weather?provider=noaa';
    responses.set(url, { temp: 20 });
    publishRevisions({ chores: '"r1"', rewards: '"r1"' });
    renderHook(() => useFetchData<{ temp: number }>(url, 20));
    await waitFor(() => expect(requestCount).toBe(1));

    await morePolls(2);
  });
});
