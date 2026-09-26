/** Client-side in-memory cache for module data.
 *
 * Stale-while-revalidate semantics: expired entries return data with
 * `stale: true` — they are never deleted. `null` only on cold start.
 * Bounded at MAX_ENTRIES with LRU eviction to stay safe on Pi.
 *
 * An entry is expired by its TTL, except for a read the wall's heartbeat
 * reports on (`followedRevision`): that one is fresh for as long as the
 * latest beat names the revision it was fetched at, however old it is.
 */

import { displayFetch } from '@/lib/display-fetch';
import { followedRevision } from '@/lib/display-heartbeat';
import { logger } from '@/lib/logger';

const log = logger('display-cache');

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  ttlMs: number;
  lastAccessed: number;
  /**
   * The response body `data` was parsed from. An answer with the same bytes
   * hands back this `data` rather than a copy, so nothing keyed on it
   * re-renders or re-derives. Absent for data a write published or a
   * caller stored whole, which makes the next answer count as new.
   */
  body?: string;
  /** For a read the heartbeat reports on, the revision its answer is at (see `answerRevision`). */
  revision?: string;
}

/**
 * The revision a fetched answer is at: its own ETag, which for every read the
 * heartbeat reports on is the very value the heartbeat names, so a read made
 * before the first beat already counts as current when that beat arrives.
 * Without one (an older hub, a stubbed answer), `asked`: the revision the
 * latest beat named when the request went out, which the answer is at least
 * as new as.
 */
export function answerRevision(res: Response, asked: string | undefined): string | undefined {
  return res.headers?.get?.('ETag') ?? asked;
}

export interface CacheStats {
  entries: number;
  maxEntries: number;
  fresh: number;
  stale: number;
  inflight: number;
  hits: number;
  misses: number;
  evictions: number;
  details: Array<{
    url: string;
    ageMs: number;
    ttlMs: number;
    stale: boolean;
  }>;
}

const MAX_ENTRIES = 100;

class DisplayDataCache {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<void>>();
  private generation = 0;
  /**
   * Per-URL count of `replace` calls. A prefetch that was already out when a
   * write published its response would otherwise store its older answer over
   * the newer one; it compares this before storing.
   */
  private published = new Map<string, number>();
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;

  /**
   * Returns cached data + staleness flag + when it was fetched.
   * Returns null ONLY if URL has never been fetched (cold start).
   */
  get<T>(url: string): { data: T; stale: boolean; fetchedAt: number } | null {
    const entry = this.cache.get(url);
    if (!entry) {
      this._misses++;
      return null;
    }
    this._hits++;
    entry.lastAccessed = Date.now();
    return { data: entry.data as T, stale: this.expired(url, entry), fetchedAt: entry.fetchedAt };
  }

  /** The entry's data and fetch time, without counting a hit or touching its LRU place. */
  peek<T>(url: string): { data: T; fetchedAt: number } | null {
    const entry = this.cache.get(url);
    return entry ? { data: entry.data as T, fetchedAt: entry.fetchedAt } : null;
  }

  /** Store data with TTL. Evicts LRU entry if at capacity. */
  set(url: string, data: unknown, ttlMs: number): void {
    this.put(url, { data, fetchedAt: Date.now(), ttlMs, lastAccessed: Date.now() });
  }

  /**
   * Store a fetched response body and return its data. When the bytes match
   * the entry's, the entry's own `data` comes back: a poll that changed
   * nothing hands every subscriber the object it already holds.
   * `revision` is `answerRevision` of the response.
   * Throws when the body is not JSON, like `Response.json()`.
   */
  storeBody(url: string, body: string, ttlMs: number, revision?: string): unknown {
    const entry = this.cache.get(url);
    const data = entry?.body === body ? entry.data : JSON.parse(body);
    this.put(url, { data, fetchedAt: Date.now(), ttlMs, lastAccessed: Date.now(), body, revision });
    return data;
  }

  private put(url: string, entry: CacheEntry): void {
    if (!this.cache.has(url) && this.cache.size >= MAX_ENTRIES) {
      this.evictLRU();
    }
    this.cache.set(url, entry);
  }

  /**
   * Store data AND hand it straight to everything already showing this URL.
   *
   * For a write whose response is the new truth: the caller already holds
   * what a re-fetch would return, so `invalidate` would spend a request
   * re-asking, and a bare `set` would leave subscribers on their old copy
   * until each one's next poll. This does neither — subscribers adopt the
   * data on the spot and nothing goes over the wire.
   *
   * This is the one publication path for a write's response. `useFetchData`
   * listens for the event and also supersedes any shared request still out
   * for the URL, so a poll that started before the write cannot undo it.
   */
  replace(url: string, data: unknown, ttlMs: number): void {
    this.published.set(url, (this.published.get(url) ?? 0) + 1);
    this.set(url, data, ttlMs);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('displaycache:replace', { detail: { url, data, at: Date.now() } }),
      );
    }
  }

  /** True if the entry is missing or expired (see the top of this file). */
  isStale(url: string): boolean {
    const entry = this.cache.get(url);
    return !entry || this.expired(url, entry);
  }

  private expired(url: string, entry: CacheEntry): boolean {
    const live = followedRevision(url);
    if (live !== undefined) return entry.revision !== live;
    return Date.now() - entry.fetchedAt > entry.ttlMs;
  }

  /**
   * Fire-and-forget fetch — only if stale or missing.
   * Deduplicates concurrent calls for the same URL.
   */
  async prefetch(url: string, ttlMs: number): Promise<void> {
    if (!this.isStale(url)) return;
    const existing = this.inflight.get(url);
    if (existing) return existing;
    const p: Promise<void> = this.doFetch(url, ttlMs, () => this.inflight.get(url) === p)
      .finally(() => {
        // An invalidated request can finish after its replacement has started.
        if (this.inflight.get(url) === p) this.inflight.delete(url);
      });
    this.inflight.set(url, p);
    return p;
  }

  /** Invalidate a single URL so subscribers re-fetch immediately. */
  invalidate(url: string): void {
    this.cache.delete(url);
    this.inflight.delete(url);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('displaycache:invalidate', { detail: url }));
    }
  }

  /**
   * Invalidate every cached or in-flight URL under a prefix. Editor actions that mutate
   * the media library (uploads, deletes, iCloud imports) call this with
   * '/api/backgrounds' so canvas module previews re-fetch immediately instead
   * of serving the pre-mutation list for up to a full TTL (useFetchData skips
   * fetching entirely while a cache entry is fresh).
   */
  invalidateByPrefix(prefix: string): void {
    for (const url of new Set([...this.cache.keys(), ...this.inflight.keys()])) {
      if (url.startsWith(prefix)) this.invalidate(url);
    }
  }

  /** Clear all entries and reset stats (call on config change) */
  clear(): void {
    this.generation++;
    this.cache.clear();
    this.inflight.clear();
    this.published.clear();
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  /** Returns aggregate cache statistics for reporting. */
  getStats(): CacheStats {
    const now = Date.now();
    let fresh = 0;
    let stale = 0;
    const details: CacheStats['details'] = [];

    for (const [url, entry] of this.cache) {
      const isStale = now - entry.fetchedAt > entry.ttlMs;
      if (isStale) stale++;
      else fresh++;
      details.push({
        url,
        ageMs: now - entry.fetchedAt,
        ttlMs: entry.ttlMs,
        stale: isStale,
      });
    }

    // Sort details by URL for stable display order
    details.sort((a, b) => a.url.localeCompare(b.url));

    return {
      entries: this.cache.size,
      maxEntries: MAX_ENTRIES,
      fresh,
      stale,
      inflight: this.inflight.size,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      details,
    };
  }

  private async doFetch(url: string, ttlMs: number, isCurrent: () => boolean): Promise<void> {
    const gen = this.generation;
    const published = this.published.get(url) ?? 0;
    const revision = followedRevision(url);
    try {
      const res = await displayFetch(url);
      if (!res.ok) return;
      const body = await res.text();
      // Checked after the body too: a write can publish or invalidate while
      // it downloads. Superseded requests must not warm the cache again.
      if (isCurrent() && gen === this.generation && published === (this.published.get(url) ?? 0)) {
        this.storeBody(url, body, ttlMs, answerRevision(res, revision));
      }
    } catch (err) {
      log.debug('fetch failed, keeping stale entry:', err);
    }
  }

  private evictLRU(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldest = key;
      }
    }
    if (oldest) {
      this.cache.delete(oldest);
      this._evictions++;
    }
  }
}

export const displayCache = new DisplayDataCache();
