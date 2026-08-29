import type { NewsFeedSource } from '@/types/config';
import type { NewsDisplayItem, NewsFeedResult } from './types';

/**
 * Turn per-feed results into the one list a view renders. Pure so the display
 * modules, the editor preview, and the unit tests all agree on what shows.
 *
 * Order of operations: per-feed cap -> word filters -> age filter -> dedupe
 * across feeds (id, link, then title) -> sort newest first (undated stories
 * sink, keeping their feed order) unless `preserveOrder` -> total cap.
 */

export interface MergeOptions {
  maxItems: number;
  maxAgeHours?: number;
  blockedWords?: string;
  requiredWords?: string;
  preserveOrder?: boolean;
  /** Epoch ms; injectable for tests. */
  now?: number;
}

export interface FeedWithResult {
  feed: NewsFeedSource;
  result: NewsFeedResult | undefined;
}

/** "shooting, war\nlayoffs" -> ['shooting', 'war', 'layoffs'] (lowercase, unique). */
export function parseWordList(raw: string | undefined): string[] {
  if (!raw) return [];
  const words = raw
    .split(/[,\n;]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
  return Array.from(new Set(words));
}

function mentionsAny(haystack: string, words: string[]): boolean {
  if (words.length === 0) return false;
  const lower = haystack.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function mergeFeeds(feeds: FeedWithResult[], opts: MergeOptions): NewsDisplayItem[] {
  const now = opts.now ?? Date.now();
  const blocked = parseWordList(opts.blockedWords);
  const required = parseWordList(opts.requiredWords);
  const maxAgeMs = opts.maxAgeHours && opts.maxAgeHours > 0 ? opts.maxAgeHours * 3_600_000 : 0;

  const seen = new Set<string>();
  const merged: Array<NewsDisplayItem & { order: number }> = [];
  let order = 0;

  for (const { feed, result } of feeds) {
    if (!result || !result.ok) continue;
    const perFeedCap = feed.maxItems && feed.maxItems > 0 ? feed.maxItems : Infinity;
    let taken = 0;
    for (const item of result.items) {
      if (taken >= perFeedCap) break;
      const searchable = `${item.title} ${item.description}`;
      if (mentionsAny(searchable, blocked)) continue;
      if (required.length > 0 && !mentionsAny(searchable, required)) continue;
      if (maxAgeMs > 0 && item.timestamp !== null && now - item.timestamp > maxAgeMs) continue;

      const keys = [item.id, item.link ?? '', normalizeTitle(item.title)].filter((k) => k.length > 0);
      if (keys.some((k) => seen.has(k))) continue;
      for (const k of keys) seen.add(k);

      merged.push({
        ...item,
        // Keys are unique across the merged list, so a React key can be built
        // from feedId + id without collisions between feeds.
        feedId: feed.id,
        source: item.publisher || feed.label?.trim() || result.title || '',
        sourceColor: feed.color || undefined,
        order: order++,
      });
      taken++;
    }
  }

  if (!opts.preserveOrder) {
    merged.sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) return a.order - b.order;
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      return b.timestamp - a.timestamp || a.order - b.order;
    });
  }

  const cap = Math.max(1, Math.floor(opts.maxItems) || 1);
  return merged.slice(0, cap).map(({ order: _order, ...item }) => item);
}

/** Feeds that answered with an error, for the "unavailable" footer. */
export function failedFeeds(feeds: FeedWithResult[]): FeedWithResult[] {
  return feeds.filter(({ result }) => result !== undefined && !result.ok);
}
