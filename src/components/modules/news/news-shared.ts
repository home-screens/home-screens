import type { CSSProperties } from 'react';
import type { TranslateFn } from '@/i18n';
import type { NewsDisplayItem } from '@/lib/news/types';
import { sourceKind } from '@/lib/news/sources';
import { formatDateInTZ } from '@/lib/timezone';

/** Stories younger than this get the "Just in" mark when enabled. */
export const BREAKING_WINDOW_MS = 60 * 60 * 1000;

export function isBreaking(item: NewsDisplayItem, now: number = Date.now()): boolean {
  return item.timestamp !== null && now - item.timestamp >= 0 && now - item.timestamp < BREAKING_WINDOW_MS;
}

/** Multi-line ellipsis via -webkit-line-clamp (fine in the Chromium kiosk). */
export function clampLines(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: Math.max(1, Math.round(lines)),
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

/**
 * Compact age: "just now", "12m ago", "3h ago", "2d ago", then a short date
 * beyond a week. Empty for undated stories or bad input.
 *
 * The short date is the day the story came out on the household's calendar
 * (`timezone`), not the Pi's: a 9 PM Chicago story is still "Sep 10" on a Pi
 * whose clock runs on UTC.
 */
export function formatNewsAge(
  timestamp: number | null,
  t: TranslateFn,
  fmt: { locale: string; timezone: string | undefined },
  now: number = Date.now(),
): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return '';
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t('news.timeAgo.justNow');
  if (diffMin < 60) return t('news.timeAgo.minutes', { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('news.timeAgo.hours', { count: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return t('news.timeAgo.days', { count: diffDay });
  try {
    return formatDateInTZ(new Date(timestamp), fmt.timezone, { month: 'short', day: 'numeric' }, fmt.locale);
  } catch {
    // An unusable locale tag: the default language, still on the household's day.
    return formatDateInTZ(new Date(timestamp), fmt.timezone, { month: 'short', day: 'numeric' });
  }
}

/** Description-side meta pieces in display order: "Source · 2h ago". */
export function metaParts(
  item: NewsDisplayItem,
  opts: { showSource: boolean; showTimestamp: boolean },
  age: string,
): string[] {
  const parts: string[] = [];
  if (opts.showSource && item.source) parts.push(item.source);
  if (opts.showTimestamp && age) parts.push(age);
  return parts;
}

/** Initial letter for the no-image placeholder ("B" for BBC News). */
export function sourceInitial(item: NewsDisplayItem): string {
  const src = item.source.trim();
  return src ? src[0].toUpperCase() : '·';
}

/** Label for the unavailable footer: the user's label, else a readable name for the source. */
export function feedDisplayLabel(feed: { url: string; label?: string }, t: (k: string) => string): string {
  if (feed.label?.trim()) return feed.label.trim();
  switch (sourceKind(feed.url)) {
    case 'local': return t('news.localNews');
    case 'topic': return feed.url.replace(/^topic:/i, '').trim();
    case 'youtube': return 'YouTube';
    case 'reddit': return `r/${feed.url.replace(/^reddit:/i, '').trim()}`;
    default: {
      try { return new URL(feed.url).hostname.replace(/^www\./, ''); } catch { return feed.url; }
    }
  }
}
