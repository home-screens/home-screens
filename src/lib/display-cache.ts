/** Client-side in-memory cache for module data.
 *
 * Stale-while-revalidate semantics: expired entries return data with
 * `stale: true` — they are never deleted. `null` only on cold start.
 * Bounded at MAX_ENTRIES with LRU eviction to stay safe on Pi.
 */

import { displayFetch } from '@/lib/display-fetch';

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  ttlMs: number;
  lastAccessed: number;
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
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;

  /**
   * Returns cached data + staleness flag.
   * Returns null ONLY if URL has never been fetched (cold start).
   */
  get<T>(url: string): { data: T; stale: boolean } | null {
    const entry = this.cache.get(url);
    if (!entry) {
      this._misses++;
      return null;
    }
    this._hits++;
    entry.lastAccessed = Date.now();
    const stale = Date.now() - entry.fetchedAt > entry.ttlMs;
    return { data: entry.data as T, stale };
  }

  /** Store data with TTL. Evicts LRU entry if at capacity. */
  set(url: string, data: unknown, ttlMs: number): void {
    if (!this.cache.has(url) && this.cache.size >= MAX_ENTRIES) {
      this.evictLRU();
    }
    this.cache.set(url, {
      data, fetchedAt: Date.now(), ttlMs, lastAccessed: Date.now(),
    });
  }

  /** True if entry is missing or past TTL */
  private isStale(url: string): boolean {
    const entry = this.cache.get(url);
    if (!entry) return true;
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
    const p = this.doFetch(url, ttlMs).finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }

  /** Invalidate a single URL so subscribers re-fetch immediately. */
  invalidate(url: string): void {
    this.cache.delete(url);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('displaycache:invalidate', { detail: url }));
    }
  }

  /** Clear all entries and reset stats (call on config change) */
  clear(): void {
    this.generation++;
    this.cache.clear();
    this.inflight.clear();
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

  private async doFetch(url: string, ttlMs: number): Promise<void> {
    const gen = this.generation;
    try {
      const res = await displayFetch(url);
      if (res.ok && gen === this.generation) {
        const data = await res.json();
        this.set(url, data, ttlMs);
      }
    } catch {
      // keep existing cache entry on failure — stale data beats no data
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
