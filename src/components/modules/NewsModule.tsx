'use client';

import { useCallback, useMemo, useState } from 'react';
import type { NewsConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useNewsFeeds } from '@/hooks/useNewsFeeds';
import { useModuleCommand } from '@/hooks/useModuleCommand';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { useTranslate, useFormattingLocale } from '@/i18n';
import type { NewsDisplayItem } from '@/lib/news/types';
import { sourceKind } from '@/lib/news/sources';
import { resolveNewsConfig, type ViewCommand } from './news/news-view-types';
import { formatNewsAge, metaParts } from './news/news-shared';
import { StoryOverlay } from './news/StoryOverlay';
import HeadlineView from './news/HeadlineView';
import ListView from './news/ListView';
import TickerView from './news/TickerView';
import CompactView from './news/CompactView';
import CardsView from './news/CardsView';

interface NewsModuleProps {
  config: NewsConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['news']?.ttlMs ?? 300_000;

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

export default function NewsModule({ config, style }: NewsModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { items, data, error, failed, allFailed, newKeys } = useNewsFeeds(config, config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);
  const resolved = useMemo(() => resolveNewsConfig(config), [config]);
  const view = config.view ?? 'headline';
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.07);

  const [overlay, setOverlay] = useState<NewsDisplayItem | null>(null);
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const onTap = resolved.tapAction === 'none' ? undefined : (item: NewsDisplayItem) => setOverlay(item);

  // Hub commands (`{ module: 'news', action }`) route into the active view;
  // `dismiss` is handled here because the overlay lives at module level.
  const [command, setCommand] = useState<ViewCommand | null>(null);
  useModuleCommand('news', (action) => {
    if (action === 'dismiss') { setOverlay(null); return; }
    setCommand((prev) => ({ seq: (prev?.seq ?? 0) + 1, action }));
  });

  const hasFeeds = Array.isArray(config.feeds) && config.feeds.some((f) => f?.url?.trim());
  const gate = moduleGate({
    style,
    data: hasFeeds ? data : { feeds: [] },
    error,
    loadingMessage: t('news.loading'),
    empty: !hasFeeds ? t('news.noFeeds') : allFailed ? t('news.allUnavailable') : items.length === 0 && t('news.empty'),
  });
  if (gate) return gate;

  const unavailable = failed.map(({ feed }) => feedDisplayLabel(feed, t));
  const viewProps = { items, config: resolved, t, locale, newKeys, onTap, command, unavailable, fontScaleKey: scaledFontSize };
  const overlayMeta = overlay
    ? metaParts(overlay, { showSource: true, showTimestamp: true }, formatNewsAge(overlay.timestamp, t, locale)).join(' · ')
    : '';

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="relative h-full" style={{ fontSize: `${scaledFontSize}px` }}>
        {view === 'headline' && <HeadlineView {...viewProps} />}
        {view === 'list' && <ListView {...viewProps} />}
        {view === 'ticker' && <TickerView {...viewProps} />}
        {view === 'compact' && <CompactView {...viewProps} />}
        {view === 'cards' && <CardsView {...viewProps} />}
        {overlay && resolved.tapAction !== 'none' && (
          <StoryOverlay item={overlay} mode={resolved.tapAction} meta={overlayMeta} onClose={closeOverlay} t={t} />
        )}
      </div>
    </ModuleWrapper>
  );
}
