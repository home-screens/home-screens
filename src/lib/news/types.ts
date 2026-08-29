/**
 * Shared shapes for the news pipeline: the server parses feeds into
 * `NewsItem`s, `/api/news` wraps them per feed in `NewsFeedResult`, and the
 * client merges every feed into `NewsDisplayItem`s (see `merge.ts`).
 */

export type NewsFeedFormat = 'rss' | 'rdf' | 'atom' | 'json';

/** Why a feed produced no items. Translated on the client (`news.feedError.*`). */
export type NewsFeedError =
  | 'empty-url'
  | 'blocked-url'
  | 'no-location'
  | 'unreachable'
  | 'timeout'
  | 'http-error'
  | 'not-a-feed'
  | 'too-many-feeds';

export interface NewsItem {
  /** guid / atom id / link / title, in that order of preference. Unique within one feed. */
  id: string;
  title: string;
  link: string | null;
  /** Plain text, never HTML. */
  description: string;
  /** Epoch ms, or null when the feed omits or mangles the date. */
  timestamp: number | null;
  imageUrl: string | null;
  /** Per-story publisher when the feed is an aggregator (Google News `<source>`). */
  publisher?: string;
  categories?: string[];
}

export interface ParsedFeed {
  title: string;
  format: NewsFeedFormat;
  items: NewsItem[];
}

export interface NewsFeedResult {
  /** The feed URL exactly as requested (virtual sources stay virtual here). */
  url: string;
  ok: boolean;
  title?: string;
  format?: NewsFeedFormat;
  error?: NewsFeedError;
  /** Upstream HTTP status when `error` is `http-error`. */
  status?: number;
  items: NewsItem[];
  fetchedAt: number;
}

export interface NewsResponse {
  feeds: NewsFeedResult[];
}

/** A merged story ready to render: carries the feed it came from. */
export interface NewsDisplayItem extends NewsItem {
  feedId: string;
  /** Display name: the story's publisher, else the feed label, else the feed title. */
  source: string;
  sourceColor?: string;
}
