import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockFetch as stubFetch } from '@/test-utils';

// We can't import the singleton directly for isolated tests, so we
// import the module and test the exported singleton, clearing between tests.
import { displayCache } from '@/lib/display-cache';
import { publishRevisions, __resetHeartbeatForTests } from '@/lib/display-heartbeat';

beforeEach(() => {
  displayCache.clear();
  __resetHeartbeatForTests();
  vi.useFakeTimers();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('displayCache', () => {
  // ── get / set ────────────────────────────────────────────────────

  describe('get / set', () => {
    it('returns null on cold start (never fetched)', () => {
      expect(displayCache.get('/api/stocks')).toBeNull();
    });

    it('returns fresh data within TTL', () => {
      displayCache.set('/api/stocks', { stocks: [] }, 5000);
      vi.advanceTimersByTime(4999);

      const result = displayCache.get('/api/stocks');
      expect(result).toEqual({ data: { stocks: [] }, stale: false, fetchedAt: expect.any(Number) });
    });

    it('returns stale data after TTL expires', () => {
      displayCache.set('/api/stocks', { stocks: [] }, 5000);
      vi.advanceTimersByTime(5001);

      const result = displayCache.get('/api/stocks');
      expect(result).toEqual({ data: { stocks: [] }, stale: true, fetchedAt: expect.any(Number) });
    });

    it('returns fresh at exact TTL boundary', () => {
      displayCache.set('/api/quote', { quote: 'hi' }, 5000);
      vi.advanceTimersByTime(5000);

      const result = displayCache.get('/api/quote');
      expect(result?.stale).toBe(false);
    });

    it('overwrites existing entry', () => {
      displayCache.set('/api/quote', { quote: 'first' }, 5000);
      displayCache.set('/api/quote', { quote: 'second' }, 5000);

      expect(displayCache.get('/api/quote')?.data).toEqual({ quote: 'second' });
    });
  });

  // ── LRU eviction ────────────────────────────────────────────────

  describe('LRU eviction', () => {
    it('evicts least-recently-accessed entry when at capacity', () => {
      // Fill 100 entries (MAX_ENTRIES)
      for (let i = 0; i < 100; i++) {
        displayCache.set(`/api/item-${i}`, { id: i }, 60_000);
        vi.advanceTimersByTime(1); // ensure distinct lastAccessed
      }

      // Access item-0 to make it recently used
      displayCache.get('/api/item-0');

      // Insert entry 101 — should evict item-1 (oldest not accessed)
      displayCache.set('/api/item-100', { id: 100 }, 60_000);

      expect(displayCache.get('/api/item-0')).not.toBeNull(); // recently accessed
      expect(displayCache.get('/api/item-1')).toBeNull();       // evicted
      expect(displayCache.get('/api/item-100')).not.toBeNull(); // newly added
    });

    it('does not evict when updating an existing key', () => {
      for (let i = 0; i < 100; i++) {
        displayCache.set(`/api/item-${i}`, { id: i }, 60_000);
      }

      // Update existing key — should NOT trigger eviction
      displayCache.set('/api/item-0', { id: 'updated' }, 60_000);

      expect(displayCache.get('/api/item-0')?.data).toEqual({ id: 'updated' });
      // item-1 should still exist
      expect(displayCache.get('/api/item-1')).not.toBeNull();
    });
  });

  // ── getStats ────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zeroes on empty cache', () => {
      const stats = displayCache.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.maxEntries).toBe(100);
      expect(stats.fresh).toBe(0);
      expect(stats.stale).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.details).toEqual([]);
    });

    it('counts fresh and stale entries', () => {
      displayCache.set('/api/a', 1, 5000);
      displayCache.set('/api/b', 2, 1000);
      vi.advanceTimersByTime(1001); // b is now stale, a is still fresh

      const stats = displayCache.getStats();
      expect(stats.entries).toBe(2);
      expect(stats.fresh).toBe(1);
      expect(stats.stale).toBe(1);
    });

    it('tracks hits and misses', () => {
      displayCache.set('/api/a', 1, 60_000);
      displayCache.get('/api/a'); // hit
      displayCache.get('/api/a'); // hit
      displayCache.get('/api/missing'); // miss

      const stats = displayCache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('tracks evictions', () => {
      for (let i = 0; i < 100; i++) {
        displayCache.set(`/api/item-${i}`, i, 60_000);
        vi.advanceTimersByTime(1);
      }
      // Trigger eviction by adding entry 101
      displayCache.set('/api/item-100', 100, 60_000);

      const stats = displayCache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('returns sorted details', () => {
      displayCache.set('/api/z', 1, 60_000);
      displayCache.set('/api/a', 2, 30_000);

      const stats = displayCache.getStats();
      expect(stats.details).toHaveLength(2);
      expect(stats.details[0].url).toBe('/api/a');
      expect(stats.details[1].url).toBe('/api/z');
      expect(stats.details[0].ttlMs).toBe(30_000);
      expect(stats.details[1].ttlMs).toBe(60_000);
    });

    it('includes inflight count', async () => {
      let resolveFetch!: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveFetch = r; });

      vi.stubGlobal('fetch', vi.fn(() =>
        fetchPromise.then(() => ({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ data: 1 })),
        })),
      ));

      const p = displayCache.prefetch('/api/test', 60_000);
      expect(displayCache.getStats().inflight).toBe(1);

      resolveFetch();
      await p;
      expect(displayCache.getStats().inflight).toBe(0);
    });
  });

  // ── replace ─────────────────────────────────────────────────────

  describe('replace', () => {
    it('stores the data as a fresh entry', () => {
      displayCache.replace('/api/todo/lists', { lists: [{ id: 'l1' }] }, 5_000);
      expect(displayCache.get('/api/todo/lists')).toEqual({
        data: { lists: [{ id: 'l1' }] },
        stale: false,
        fetchedAt: expect.any(Number),
      });
    });

    // The subscriber-notification half needs a DOM: display-cache-replace-event.test.ts.
  });

  describe('invalidateByPrefix', () => {
    it('drops every entry under the prefix and leaves the rest', () => {
      displayCache.set('/api/backgrounds', ['a'], 60_000);
      displayCache.set('/api/backgrounds?media=videos&file=clip.mp4', [], 60_000);
      displayCache.set('/api/weather?provider=noaa', { temp: 1 }, 60_000);

      displayCache.invalidateByPrefix('/api/backgrounds');

      expect(displayCache.get('/api/backgrounds')).toBeNull();
      expect(displayCache.get('/api/backgrounds?media=videos&file=clip.mp4')).toBeNull();
      expect(displayCache.get('/api/weather?provider=noaa')).not.toBeNull();
    });

    it('is a no-op when nothing matches', () => {
      displayCache.set('/api/weather', 1, 60_000);
      displayCache.invalidateByPrefix('/api/backgrounds');
      expect(displayCache.get('/api/weather')).not.toBeNull();
    });
  });

  // ── clear ────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all cached entries', () => {
      displayCache.set('/api/a', 1, 60_000);
      displayCache.set('/api/b', 2, 60_000);

      displayCache.clear();

      expect(displayCache.get('/api/a')).toBeNull();
      expect(displayCache.get('/api/b')).toBeNull();
    });

    it('resets hit/miss/eviction counters', () => {
      // Generate some hits, misses, and an eviction
      for (let i = 0; i < 100; i++) {
        displayCache.set(`/api/item-${i}`, i, 60_000);
        vi.advanceTimersByTime(1);
      }
      displayCache.set('/api/overflow', 'x', 60_000); // eviction
      displayCache.get('/api/overflow'); // hit
      displayCache.get('/api/nonexistent'); // miss

      const before = displayCache.getStats();
      expect(before.hits).toBeGreaterThan(0);
      expect(before.misses).toBeGreaterThan(0);
      expect(before.evictions).toBeGreaterThan(0);

      displayCache.clear();

      const after = displayCache.getStats();
      expect(after.hits).toBe(0);
      expect(after.misses).toBe(0);
      expect(after.evictions).toBe(0);
      expect(after.entries).toBe(0);
    });
  });

  // ── prefetch ─────────────────────────────────────────────────────

  describe('prefetch', () => {
    it('fetches and caches data for a missing URL', async () => {
      stubFetch({ joke: 'ha' });

      await displayCache.prefetch('/api/jokes', 60_000);

      const result = displayCache.get('/api/jokes');
      expect(result?.data).toEqual({ joke: 'ha' });
      expect(result?.stale).toBe(false);
    });

    it('skips fetch when data is still fresh', async () => {
      displayCache.set('/api/jokes', { joke: 'old' }, 60_000);

      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      await displayCache.prefetch('/api/jokes', 60_000);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refetches when data is stale', async () => {
      displayCache.set('/api/jokes', { joke: 'old' }, 1000);
      vi.advanceTimersByTime(1001);

      stubFetch({ joke: 'new' });

      await displayCache.prefetch('/api/jokes', 1000);

      expect(displayCache.get('/api/jokes')?.data).toEqual({ joke: 'new' });
    });

    it('deduplicates concurrent prefetch calls for the same URL', async () => {
      let resolveOuter!: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveOuter = r; });

      const mockFetch = vi.fn(() =>
        fetchPromise.then(() => ({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ data: 1 })),
        })),
      );
      vi.stubGlobal('fetch', mockFetch);

      // Fire two concurrent prefetches for the same URL
      const p1 = displayCache.prefetch('/api/test', 60_000);
      const p2 = displayCache.prefetch('/api/test', 60_000);

      resolveOuter();
      await Promise.all([p1, p2]);

      // fetch should only have been called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('keeps stale data on fetch failure', async () => {
      displayCache.set('/api/jokes', { joke: 'old' }, 1000);
      vi.advanceTimersByTime(1001);

      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));

      await displayCache.prefetch('/api/jokes', 1000);

      // Should still have the old data (stale)
      expect(displayCache.get('/api/jokes')?.data).toEqual({ joke: 'old' });
    });

    it('does not cache data from a non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({ ok: false, status: 502 }),
      ));

      await displayCache.prefetch('/api/jokes', 60_000);

      expect(displayCache.get('/api/jokes')).toBeNull();
    });
  });

  describe('invalidation during prefetch', () => {
    it.each(['response', 'body'])('discards an invalidated listing while its %s is pending', async (pending) => {
      let release!: () => void;
      const ready = new Promise<void>((resolve) => { release = resolve; });
      vi.stubGlobal('fetch', vi.fn(async () => {
        if (pending === 'response') await ready;
        return {
          ok: true,
          text: async () => {
            if (pending === 'body') await ready;
            return JSON.stringify({ images: ['deleted.jpg'] });
          },
        };
      }));

      const request = displayCache.prefetch('/api/backgrounds', 60_000);
      await Promise.resolve();
      displayCache.invalidate('/api/backgrounds');
      release();
      await request;

      expect(displayCache.get('/api/backgrounds')).toBeNull();
      expect(displayCache.getStats().inflight).toBe(0);
    });

    it('invalidates cold in-flight URLs by prefix without discarding unrelated data', async () => {
      let release!: () => void;
      const ready = new Promise<void>((resolve) => { release = resolve; });
      vi.stubGlobal('fetch', vi.fn(async () => {
        await ready;
        return { ok: true, text: async () => JSON.stringify({ value: 'fetched' }) };
      }));

      const images = displayCache.prefetch('/api/backgrounds?directory=album', 60_000);
      const weather = displayCache.prefetch('/api/weather', 60_000);
      displayCache.invalidateByPrefix('/api/backgrounds');
      release();
      await Promise.all([images, weather]);

      expect(displayCache.get('/api/backgrounds?directory=album')).toBeNull();
      expect(displayCache.get('/api/weather')?.data).toEqual({ value: 'fetched' });
    });

    it.each(['invalidate', 'clear'])('keeps a replacement request deduplicated after %s', async (action) => {
      let releaseOld!: () => void;
      let releaseNew!: () => void;
      const oldReady = new Promise<void>((resolve) => { releaseOld = resolve; });
      const newReady = new Promise<void>((resolve) => { releaseNew = resolve; });
      const mockFetch = vi.fn()
        .mockImplementationOnce(async () => {
          await oldReady;
          return { ok: true, text: async () => JSON.stringify({ images: ['deleted.jpg'] }) };
        })
        .mockImplementation(async () => {
          await newReady;
          return { ok: true, text: async () => JSON.stringify({ images: [] }) };
        });
      vi.stubGlobal('fetch', mockFetch);

      const old = displayCache.prefetch('/api/backgrounds', 60_000);
      if (action === 'clear') displayCache.clear();
      else displayCache.invalidate('/api/backgrounds');
      const replacement = displayCache.prefetch('/api/backgrounds', 60_000);

      releaseOld();
      await old;
      const inflightAfterOld = displayCache.getStats().inflight;
      const subscriber = displayCache.prefetch('/api/backgrounds', 60_000);
      releaseNew();
      await Promise.all([replacement, subscriber]);

      expect(inflightAfterOld).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(displayCache.get('/api/backgrounds')?.data).toEqual({ images: [] });
      expect(displayCache.getStats().inflight).toBe(0);
    });
  });

  // ── generation counter (clear vs in-flight) ─────────────────────

  describe('generation counter', () => {
    it('discards in-flight fetch result after clear()', async () => {
      let resolveFetch!: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveFetch = r; });

      vi.stubGlobal('fetch', vi.fn(() =>
        fetchPromise.then(() => ({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ staleData: true })),
        })),
      ));

      const prefetchPromise = displayCache.prefetch('/api/test', 60_000);

      // Clear while fetch is in-flight
      displayCache.clear();

      // Now resolve the fetch
      resolveFetch();
      await prefetchPromise;

      // The stale data should NOT have been cached
      expect(displayCache.get('/api/test')).toBeNull();
    });

    it('does not let a prefetch whose body was still downloading during replace() store it', async () => {
      let resolveBody!: () => void;
      const bodyReady = new Promise<void>((r) => { resolveBody = r; });
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        text: () => bodyReady.then(() => JSON.stringify({ revision: 'before-save' })),
      })));

      const prefetchPromise = displayCache.prefetch('/api/todo/lists', 60_000);
      await Promise.resolve(); // headers have arrived, the body has not
      displayCache.replace('/api/todo/lists', { revision: 'saved' }, 60_000);
      resolveBody();
      await prefetchPromise;

      expect(displayCache.get('/api/todo/lists')?.data).toEqual({ revision: 'saved' });
    });

    it('does not let a prefetch that was out during replace() store its older answer', async () => {
      let resolveFetch!: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveFetch = r; });
      vi.stubGlobal('fetch', vi.fn(() =>
        fetchPromise.then(() => ({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ revision: 'before-save' })),
        })),
      ));

      const prefetchPromise = displayCache.prefetch('/api/todo/lists', 60_000);
      displayCache.replace('/api/todo/lists', { revision: 'saved' }, 60_000);
      resolveFetch();
      await prefetchPromise;

      expect(displayCache.get('/api/todo/lists')?.data).toEqual({ revision: 'saved' });
    });

    it('allows new fetches after clear()', async () => {
      stubFetch({ fresh: true });

      displayCache.clear();
      await displayCache.prefetch('/api/test', 60_000);

      expect(displayCache.get('/api/test')?.data).toEqual({ fresh: true });
    });
  });

  // ── bodies: an unchanged answer keeps its data ──────────────────

  describe('storeBody', () => {
    it('hands back the data it already holds when the bytes are the same', () => {
      const first = displayCache.storeBody('/api/family', '{"members":["ada"]}', 60_000);
      const again = displayCache.storeBody('/api/family', '{"members":["ada"]}', 60_000);
      expect(again).toBe(first);
    });

    it('parses anew when the bytes change', () => {
      const first = displayCache.storeBody('/api/family', '{"members":["ada"]}', 60_000);
      const next = displayCache.storeBody('/api/family', '{"members":["ada","bram"]}', 60_000);
      expect(next).not.toBe(first);
      expect(next).toEqual({ members: ['ada', 'bram'] });
    });

    it('restarts the TTL even when nothing changed', () => {
      displayCache.storeBody('/api/family', '{}', 5_000);
      vi.advanceTimersByTime(4_000);
      displayCache.storeBody('/api/family', '{}', 5_000);
      vi.advanceTimersByTime(4_000);
      expect(displayCache.get('/api/family')?.stale).toBe(false);
    });

    it.each(['set', 'replace'] as const)('treats the next answer as new after %s, whatever its bytes', (how) => {
      const fetched = displayCache.storeBody('/api/todo/lists', '{"lists":[]}', 60_000);
      displayCache[how]('/api/todo/lists', { lists: ['written'] }, 60_000);
      const after = displayCache.storeBody('/api/todo/lists', '{"lists":[]}', 60_000);
      expect(after).not.toBe(fetched);
      expect(after).toEqual({ lists: [] });
    });

    it('throws on a body that is not JSON, like Response.json()', () => {
      expect(() => displayCache.storeBody('/api/family', '<html>', 60_000)).toThrow();
    });
  });

  // ── reads the heartbeat reports on ──────────────────────────────

  describe('freshness from the heartbeat', () => {
    it('keeps a followed read fresh past its TTL while the beat names its revision', () => {
      publishRevisions({ chores: '"r1"' });
      displayCache.storeBody('/api/chores?days=31', '{}', 5_000, '"r1"');
      vi.advanceTimersByTime(4_000);
      publishRevisions({ chores: '"r1"' });
      vi.advanceTimersByTime(4_000);
      publishRevisions({ chores: '"r1"' });

      expect(displayCache.get('/api/chores?days=31')?.stale).toBe(false);
      expect(displayCache.isStale('/api/chores?days=31')).toBe(false);
    });

    it('makes it stale the moment a beat names another revision, inside its TTL', () => {
      publishRevisions({ chores: '"r1"' });
      displayCache.storeBody('/api/chores?days=31', '{}', 60_000, '"r1"');
      publishRevisions({ chores: '"r2"' });
      expect(displayCache.isStale('/api/chores?days=31')).toBe(true);
    });

    it('counts data a write published as stale until a fetch at the new revision', () => {
      publishRevisions({ rewards: '"r1"' });
      displayCache.replace('/api/rewards', { balances: {} }, 60_000);
      expect(displayCache.isStale('/api/rewards')).toBe(true);
    });

    it('goes back to the TTL once beats stop coming', () => {
      publishRevisions({ chores: '"r1"' });
      displayCache.storeBody('/api/chores?days=31', '{}', 5_000, '"r1"');
      vi.advanceTimersByTime(11_000);
      expect(displayCache.isStale('/api/chores?days=31')).toBe(true);
    });

    it('leaves reads the heartbeat does not report on to their TTL', () => {
      publishRevisions({ chores: '"r1"' });
      displayCache.storeBody('/api/family', '{}', 5_000, undefined);
      vi.advanceTimersByTime(4_000);
      publishRevisions({ chores: '"r1"' });
      expect(displayCache.isStale('/api/family')).toBe(false);
      vi.advanceTimersByTime(2_000);
      expect(displayCache.isStale('/api/family')).toBe(true);
    });

    it('tags a prefetch made before any beat with its answer\'s ETag, so the first beat finds it current', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        headers: new Headers({ ETag: '"r1"' }),
        text: async () => '{"completions":[]}',
      })));
      await displayCache.prefetch('/api/chores?days=31', 5_000);

      publishRevisions({ chores: '"r1"' });
      expect(displayCache.isStale('/api/chores?days=31')).toBe(false);
      publishRevisions({ chores: '"r2"' });
      expect(displayCache.isStale('/api/chores?days=31')).toBe(true);
    });

    it('does not prefetch a followed read the beat says is current, and does once it changes', async () => {
      const spy = stubFetch({ completions: [] });
      publishRevisions({ chores: '"r1"' });
      await displayCache.prefetch('/api/chores?days=31', 5_000);
      vi.advanceTimersByTime(8_000);
      publishRevisions({ chores: '"r1"' });
      await displayCache.prefetch('/api/chores?days=31', 5_000);
      expect(spy).toHaveBeenCalledTimes(1);

      publishRevisions({ chores: '"r2"' });
      await displayCache.prefetch('/api/chores?days=31', 5_000);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(displayCache.isStale('/api/chores?days=31')).toBe(false);
    });
  });
});
