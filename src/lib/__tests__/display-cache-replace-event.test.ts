// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { displayCache } from '@/lib/display-cache';

/**
 * The DOM half of `displayCache.replace`, split out because the rest of the
 * cache suite runs in the node environment. `useFetchData` listens for
 * `displaycache:replace` and adopts the payload without fetching; this is the
 * only thing that dispatches it.
 */
beforeEach(() => {
  displayCache.clear();
});

describe('displayCache.replace', () => {
  it('hands the data to subscribers instead of making them re-fetch', () => {
    const seen: unknown[] = [];
    const onReplace = (e: Event) => seen.push((e as CustomEvent).detail);
    const onInvalidate = vi.fn();
    window.addEventListener('displaycache:replace', onReplace);
    window.addEventListener('displaycache:invalidate', onInvalidate);

    displayCache.replace('/api/todo/lists', { lists: [] }, 5_000);

    window.removeEventListener('displaycache:replace', onReplace);
    window.removeEventListener('displaycache:invalidate', onInvalidate);

    expect(seen).toEqual([{ url: '/api/todo/lists', data: { lists: [] }, at: expect.any(Number) }]);
    // The point of replace: no invalidation, so nothing goes back over the wire.
    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it('still caches the data it broadcast', () => {
    displayCache.replace('/api/todo/lists', { lists: [{ id: 'l1' }] }, 5_000);
    expect(displayCache.get('/api/todo/lists')?.data).toEqual({ lists: [{ id: 'l1' }] });
  });
});
