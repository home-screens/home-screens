// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { NewsSourceOptions } from '@/types/config';
import type { NewsFeedResult, NewsItem, NewsResponse } from '@/lib/news/types';

/**
 * `useFetchData` is the only I/O the hook does; everything else is the pure
 * merge plus the "new story" bookkeeping. The mock hands back whatever the
 * test puts in `fetchState`, so a rerender stands in for a poll tick.
 */
let fetchState: [NewsResponse | null, string | null, number | null] = [null, null, null];
const useFetchData = vi.fn(() => fetchState);
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (...args: unknown[]) => useFetchData(...(args as [])),
}));

import { newsItemKey, useNewsFeeds } from '@/hooks/useNewsFeeds';

const NOW = Date.UTC(2026, 7, 29, 12);
const HOUR = 3_600_000;
const A_URL = 'https://a.example.com/rss';
const B_URL = 'https://b.example.com/rss';

function story(id: string, hoursAgo: number, extra: Partial<NewsItem> = {}): NewsItem {
  return { id, title: `Story ${id}`, link: `https://x.example/${id}`, description: '', timestamp: NOW - hoursAgo * HOUR, imageUrl: null, ...extra };
}

function okResult(url: string, items: NewsItem[], title = `${url} title`): NewsFeedResult {
  return { url, ok: true, title, format: 'rss', items, fetchedAt: NOW };
}

function failedResult(url: string): NewsFeedResult {
  return { url, ok: false, error: 'http-error', status: 500, items: [], fetchedAt: NOW };
}

/** The key a story gets in `newKeys`, built the same way the hook does. */
const key = (feedId: string, id: string) => newsItemKey({ feedId, id } as Parameters<typeof newsItemKey>[0]);

function config(overrides: Partial<NewsSourceOptions> = {}): NewsSourceOptions {
  return {
    feeds: [{ id: 'a', url: A_URL, label: 'Feed A' }, { id: 'b', url: B_URL }],
    refreshIntervalMs: 300_000,
    maxItems: 10,
    ...overrides,
  };
}

beforeEach(() => {
  fetchState = [null, null, null];
  useFetchData.mockClear();
});

describe('useNewsFeeds', () => {
  it('asks useFetchData for the combined feed URL at the given refresh rate', () => {
    renderHook(() => useNewsFeeds(config(), 60_000));
    expect(useFetchData).toHaveBeenCalledWith(
      `/api/news?feed=${encodeURIComponent(A_URL)}&feed=${encodeURIComponent(B_URL)}`,
      60_000,
    );
  });

  it('passes an empty URL when there are no feeds so nothing is fetched', () => {
    renderHook(() => useNewsFeeds(config({ feeds: [] }), 60_000));
    expect(useFetchData).toHaveBeenCalledWith('', 60_000);
  });

  it('is empty and not failed before the first response', () => {
    const { result } = renderHook(() => useNewsFeeds(config(), 60_000));
    expect(result.current.data).toBeNull();
    expect(result.current.items).toEqual([]);
    expect(result.current.failed).toEqual([]);
    expect(result.current.allFailed).toBe(false);
    expect(result.current.newKeys.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('merges every feed result into one newest-first list tagged with its feed', () => {
    fetchState = [{
      feeds: [
        okResult(A_URL, [story('a1', 3), story('a2', 1)]),
        okResult(B_URL, [story('b1', 2)], 'Feed B Title'),
      ],
    }, null, NOW];

    const { result } = renderHook(() => useNewsFeeds(config(), 60_000));

    expect(result.current.items.map((i) => i.id)).toEqual(['a2', 'b1', 'a1']);
    expect(result.current.items[0]).toMatchObject({ feedId: 'a', source: 'Feed A' });
    expect(result.current.items[1]).toMatchObject({ feedId: 'b', source: 'Feed B Title' });
    expect(result.current.data).toBe(fetchState[0]);
  });

  it('applies the merge options from config', () => {
    fetchState = [{
      feeds: [okResult(A_URL, [story('old', 50), story('war', 1, { title: 'War news' }), story('fresh', 2), story('also', 3)])],
    }, null, NOW];

    const { result } = renderHook(() => useNewsFeeds(
      config({ maxItems: 1, maxAgeHours: 24, blockedWords: 'war', feeds: [{ id: 'a', url: A_URL }] }),
      60_000,
    ));

    expect(result.current.items.map((i) => i.id)).toEqual(['fresh']);
  });

  it('defaults maxItems to 10 when the config omits it', () => {
    const many = Array.from({ length: 15 }, (_, i) => story(`s${i}`, i));
    fetchState = [{ feeds: [okResult(A_URL, many)] }, null, NOW];
    const cfg = { feeds: [{ id: 'a', url: A_URL }], refreshIntervalMs: 1 } as unknown as NewsSourceOptions;

    const { result } = renderHook(() => useNewsFeeds(cfg, 60_000));
    expect(result.current.items).toHaveLength(10);
  });

  it('matches results to feeds by trimmed URL and ignores blank feeds', () => {
    fetchState = [{ feeds: [okResult(A_URL, [story('a1', 1)]), okResult('https://stray.example/rss', [story('x', 1)])] }, null, NOW];

    const { result } = renderHook(() => useNewsFeeds(
      config({ feeds: [{ id: 'a', url: `  ${A_URL} ` }, { id: 'blank', url: '   ' }, { id: 'none', url: '' }] }),
      60_000,
    ));

    expect(result.current.items.map((i) => i.id)).toEqual(['a1']);
    expect(result.current.failed).toEqual([]);
    expect(result.current.allFailed).toBe(false);
  });

  it('lists failed feeds next to the healthy ones and only flags allFailed when every feed failed', () => {
    fetchState = [{ feeds: [okResult(A_URL, [story('a1', 1)]), failedResult(B_URL)] }, null, NOW];
    const { result, rerender } = renderHook(() => useNewsFeeds(config(), 60_000));

    expect(result.current.items.map((i) => i.id)).toEqual(['a1']);
    expect(result.current.failed.map((f) => f.feed.id)).toEqual(['b']);
    expect(result.current.failed[0].result?.error).toBe('http-error');
    expect(result.current.allFailed).toBe(false);

    fetchState = [{ feeds: [failedResult(A_URL), failedResult(B_URL)] }, null, NOW];
    rerender();

    expect(result.current.items).toEqual([]);
    expect(result.current.failed.map((f) => f.feed.id)).toEqual(['a', 'b']);
    expect(result.current.allFailed).toBe(true);
  });

  it('a feed missing from the response is neither failed nor counted', () => {
    fetchState = [{ feeds: [okResult(A_URL, [story('a1', 1)])] }, null, NOW];
    const { result } = renderHook(() => useNewsFeeds(config(), 60_000));
    expect(result.current.failed).toEqual([]);
    expect(result.current.allFailed).toBe(false);
  });

  it('allFailed stays false with no feeds configured', () => {
    fetchState = [{ feeds: [] }, null, NOW];
    const { result } = renderHook(() => useNewsFeeds(config({ feeds: [] }), 60_000));
    expect(result.current.allFailed).toBe(false);
  });

  it('passes the fetch error through', () => {
    fetchState = [null, 'API error 502', null];
    const { result } = renderHook(() => useNewsFeeds(config(), 60_000));
    expect(result.current.error).toBe('API error 502');
  });

  describe('new-story marks', () => {
    it('never marks anything on the first load', () => {
      fetchState = [{ feeds: [okResult(A_URL, [story('a1', 1), story('a2', 2)])] }, null, NOW];
      const { result } = renderHook(() => useNewsFeeds(config(), 60_000));
      expect(result.current.newKeys.size).toBe(0);
    });

    it('marks a story that appears on a later response, and returns the same set while nothing changes', () => {
      fetchState = [{ feeds: [okResult(A_URL, [story('a1', 2)])] }, null, NOW];
      const { result, rerender } = renderHook(() => useNewsFeeds(config(), 60_000));
      const initial = result.current.newKeys;

      fetchState = [{ feeds: [okResult(A_URL, [story('a9', 1), story('a1', 2)])] }, null, NOW + 1];
      rerender();

      const afterNew = result.current.newKeys;
      expect(Array.from(afterNew)).toEqual([newsItemKey(result.current.items[0])]);
      expect(afterNew.has(key('a', 'a9'))).toBe(true);
      expect(afterNew).not.toBe(initial);

      // Same stories again: the set reference is stable so consumers do not rerender.
      fetchState = [{ feeds: [okResult(A_URL, [story('a9', 1), story('a1', 2)])] }, null, NOW + 2];
      rerender();
      expect(result.current.newKeys).toBe(afterNew);
    });

    it('keys are feedId + story id so two feeds sharing an id cannot collide', () => {
      fetchState = [{ feeds: [okResult(A_URL, [story('a1', 2)])] }, null, NOW];
      const { result, rerender } = renderHook(() => useNewsFeeds(config(), 60_000));

      fetchState = [{ feeds: [okResult(A_URL, [story('a1', 2)]), okResult(B_URL, [story('b1', 1)])] }, null, NOW + 1];
      rerender();

      expect(Array.from(result.current.newKeys)).toEqual([key('b', 'b1')]);
    });

    it('forgets the mark once the story is older than the new-story window', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      try {
        fetchState = [{ feeds: [okResult(A_URL, [story('a1', 2)])] }, null, NOW];
        const { result, rerender } = renderHook(() => useNewsFeeds(config(), 60_000));

        fetchState = [{ feeds: [okResult(A_URL, [story('a9', 1), story('a1', 2)])] }, null, NOW + 1];
        rerender();
        expect(result.current.newKeys.has(key('a', 'a9'))).toBe(true);

        vi.setSystemTime(NOW + 11 * 60 * 1000);
        fetchState = [{ feeds: [okResult(A_URL, [story('a9', 1), story('a1', 2)])] }, null, NOW + 2];
        rerender();
        expect(result.current.newKeys.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not treat the first non-empty response after an empty one as new', () => {
      fetchState = [{ feeds: [okResult(A_URL, [])] }, null, NOW];
      const { result, rerender } = renderHook(() => useNewsFeeds(config(), 60_000));

      fetchState = [{ feeds: [okResult(A_URL, [story('a1', 1)])] }, null, NOW + 1];
      rerender();

      expect(result.current.newKeys.size).toBe(0);
    });
  });
});
