'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { newsUrl } from '@/lib/fetch-keys';
import { mergeFeeds } from '@/lib/news/merge';
import type { NewsDisplayItem, NewsResponse } from '@/lib/news/types';
import { useTranslate } from '@/i18n';
import type { NewsSourceOptions } from '@/types/config';
import { formatAgo } from './feed-display';

const PREVIEW_ITEMS = 3;
const DEBOUNCE_MS = 600;

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'done'; items: NewsDisplayItem[]; at: number };

interface NewsPreviewProps {
  config: Partial<NewsSourceOptions>;
}

/**
 * The first few stories the display will show for the current feeds and
 * filters. Runs the same `/api/news` fetch and `mergeFeeds` pass the module
 * uses, so what the preview shows is what the wall shows. Refetches 600ms
 * after the last config change; the Refresh button skips the wait.
 */
export function NewsPreview({ config }: NewsPreviewProps) {
  const t = useTranslate('editor');
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const requestSeq = useRef(0);

  const feeds = config.feeds ?? [];
  const url = newsUrl(config);
  const { maxAgeHours, blockedWords, requiredWords, preserveOrder } = config;
  // One string that changes whenever anything affecting the merged list does,
  // so the debounce can key on it without deep-comparing the feed array.
  const mergeKey = JSON.stringify([
    feeds.map((f) => [f.id, f.url, f.label ?? '', f.color ?? '', f.maxItems ?? 0]),
    maxAgeHours ?? 0, blockedWords ?? '', requiredWords ?? '', preserveOrder ?? false,
  ]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (!url) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const res = await editorFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NewsResponse;
      if (seq !== requestSeq.current) return;
      const now = Date.now();
      const items = mergeFeeds(
        feeds.map((feed) => ({ feed, result: data.feeds?.find((r) => r.url === feed.url.trim()) })),
        { maxItems: PREVIEW_ITEMS, maxAgeHours, blockedWords, requiredWords, preserveOrder, now },
      );
      setState({ status: 'done', items, at: now });
    } catch (err) {
      if (isSessionExpired(err) || seq !== requestSeq.current) return;
      setState({ status: 'failed' });
    }
    // `mergeKey` stands in for every value read above (feeds + filters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, mergeKey]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">{t('configSections.news.preview')}</span>
        <Button size="sm" variant="ghost" onClick={() => { void load(); }} disabled={!url || state.status === 'loading'}>
          {t('common.refresh')}
        </Button>
      </div>
      <div className="rounded bg-hs-card p-1.5 text-[11px] leading-snug" aria-live="polite">
        {!url && <p className="text-hs-text-faint">{t('configSections.news.previewNoFeeds')}</p>}
        {url && (state.status === 'idle' || state.status === 'loading') && (
          <p className="text-hs-text-faint">{t('configSections.news.previewLoading')}</p>
        )}
        {state.status === 'failed' && <p className="text-hs-danger">{t('configSections.news.previewFailed')}</p>}
        {state.status === 'done' && state.items.length === 0 && (
          <p className="text-hs-text-faint">{t('configSections.news.previewEmpty')}</p>
        )}
        {state.status === 'done' && state.items.length > 0 && (
          <ul className="space-y-1.5">
            {state.items.map((item) => (
              <li key={`${item.feedId}:${item.id}`} className="flex gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.sourceColor || 'var(--color-hs-text-faint)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-hs-text-body">{item.title}</span>
                  <span className="block truncate text-hs-text-faint">
                    {[item.source, item.timestamp !== null ? formatAgo(item.timestamp, state.at, t) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
