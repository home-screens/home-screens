/**
 * Pure helpers behind the news config sections: readable feed names,
 * friendly feed-check sentences, and relative times. No React here so the
 * behaviour stays unit-testable without a DOM.
 */

import type { TranslateFn } from '@/i18n';
import type { NewsFeedSource } from '@/types/config';
import type { NewsFeedError, NewsFeedResult } from '@/lib/news/types';
import { findPresetByUrl, type NewsPreset } from '@/lib/news-presets';
import { sourceKind } from '@/lib/news/sources';

/** Mirrors `MAX_FEEDS_PER_REQUEST` in `/api/news`; more than this is refused. */
export const NEWS_MAX_FEEDS = 12;

const NEWS_KEY = 'configSections.news';

/** "BBC News · World" — the preset's publisher plus its translated section. */
export function presetName(preset: NewsPreset, t: TranslateFn): string {
  return `${preset.publisher} · ${t(`${NEWS_KEY}.category.${preset.category}`)}`;
}

/**
 * What the feed is, ignoring the user's label: preset name, virtual source
 * description, or the host of a custom URL. Used as the row title when
 * there is no label and as the faint secondary line when there is one.
 */
export function feedKindName(feed: Pick<NewsFeedSource, 'url'>, t: TranslateFn): string {
  const url = (feed.url ?? '').trim();
  const preset = findPresetByUrl(url);
  if (preset) return presetName(preset, t);
  switch (sourceKind(url)) {
    case 'local':
      return t(`${NEWS_KEY}.sourceLocal`);
    case 'topic':
      return t(`${NEWS_KEY}.sourceTopic`, { topic: url.replace(/^topic:/i, '').trim() });
    case 'youtube':
      return t(`${NEWS_KEY}.sourceYoutube`);
    case 'reddit':
      return t(`${NEWS_KEY}.sourceReddit`, { subreddit: url.replace(/^reddit:/i, '').trim() });
    default:
      break;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || t(`${NEWS_KEY}.sourceUnnamed`);
  }
}

/** The row title: the user's label when set, else what the feed is. */
export function feedDisplayName(feed: Pick<NewsFeedSource, 'url' | 'label'>, t: TranslateFn): string {
  const label = feed.label?.trim();
  return label || feedKindName(feed, t);
}

/** "just now", "12m ago", "3h ago", "2d ago" for the check line and preview. */
export function formatAgo(timestamp: number, now: number, t: TranslateFn): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return t(`${NEWS_KEY}.timeAgo.justNow`);
  if (minutes < 60) return t(`${NEWS_KEY}.timeAgo.minutes`, { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(`${NEWS_KEY}.timeAgo.hours`, { count: hours });
  return t(`${NEWS_KEY}.timeAgo.days`, { count: Math.round(hours / 24) });
}

const KNOWN_ERRORS: ReadonlySet<string> = new Set<NewsFeedError>([
  'empty-url', 'blocked-url', 'no-location', 'unreachable', 'timeout', 'http-error', 'not-a-feed', 'too-many-feeds',
]);

/** A friendly sentence for a failed feed. */
export function feedErrorMessage(error: NewsFeedError | string | undefined, status: number | undefined, t: TranslateFn): string {
  if (error === 'http-error' && status) return t(`${NEWS_KEY}.feedError.http-error`, { status });
  if (error && KNOWN_ERRORS.has(error)) return t(`${NEWS_KEY}.feedError.${error}`);
  return t(`${NEWS_KEY}.feedError.failed`);
}

/**
 * One line summarising a feed check: "BBC News · 30 stories · newest 12m ago"
 * or the friendly error.
 */
export function feedCheckSummary(
  result: NewsFeedResult,
  fallbackName: string,
  now: number,
  t: TranslateFn,
): { ok: boolean; text: string } {
  if (!result.ok) return { ok: false, text: feedErrorMessage(result.error, result.status, t) };
  const title = result.title?.trim() || fallbackName;
  const count = result.items.length;
  if (count === 0) return { ok: true, text: t(`${NEWS_KEY}.feedCheckNoStories`, { title }) };
  const newest = result.items.reduce<number | null>(
    (best, item) => (item.timestamp !== null && (best === null || item.timestamp > best) ? item.timestamp : best),
    null,
  );
  if (newest === null) return { ok: true, text: t(`${NEWS_KEY}.feedCheckResultNoDate`, { title, count }) };
  return { ok: true, text: t(`${NEWS_KEY}.feedCheckResult`, { title, count, ago: formatAgo(newest, now, t) }) };
}
