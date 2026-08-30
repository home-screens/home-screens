'use client';

import { useCallback, useMemo, useState } from 'react';
import type { FullscreenNewsConfig, ModuleStyle, TimeFormat } from '@/types/config';
import { DEFAULT_TIME_FORMAT } from '@/types/config';
import { moduleGate } from '../ModuleStates';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useNewsFeeds } from '@/hooks/useNewsFeeds';
import { useModuleCommand } from '@/hooks/useModuleCommand';
import { usePagedRotation } from '@/hooks/usePagedRotation';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useRealClock } from '@/hooks/useTZClock';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { getThemeTokens, getTypoMultiplier, resolveFullscreenAccent } from '@/lib/fullscreen-themes';
import type { NewsDisplayItem } from '@/lib/news/types';
import { formatNewsAge, metaParts } from '../news/news-shared';
import { StoryOverlay } from '../news/StoryOverlay';
import {
  FRONT_PAGE_SIZE, NEWS_ACCENT, buildNewsScale, mastheadTitle, resolveDisplayOptions, type NewsViewContext,
} from './news-canvas';
import StoryView from './StoryView';
import FrontPageView from './FrontPageView';

interface FullscreenNewsModuleProps {
  config: FullscreenNewsConfig;
  style: ModuleStyle;
  fullscreenTheme?: string;
  timezone?: string;
  /** Household 12/24-hour preference, threaded by buildModuleProps. */
  timeFormat?: TimeFormat;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['fullscreen-news']?.ttlMs ?? 300_000;

/**
 * Full-screen news: one story at a time (`story`) or a newspaper front page
 * (`front-page`). Shares the feed pipeline and the tap overlay with the
 * news tile; only the canvas layout is its own.
 */
export default function FullscreenNewsModule({ config, style, fullscreenTheme, timezone, timeFormat }: FullscreenNewsModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { containerRef, dims } = useFullscreenDims();
  const now = useRealClock(60_000).getTime();

  const theme = getThemeTokens(fullscreenTheme);
  const accent = resolveFullscreenAccent(config.accentColor, theme, NEWS_ACCENT);
  const options = useMemo(() => resolveDisplayOptions(config), [config]);
  const view = config.view ?? 'story';
  const rotateMs = Math.max(1000, config.rotateIntervalMs ?? 15_000);

  const { items, data, error, allFailed } = useNewsFeeds(config, config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);

  // One rotation drives both views: stories one at a time, or front pages
  // six stories at a time.
  const count = view === 'front-page' ? Math.ceil(items.length / FRONT_PAGE_SIZE) : items.length;
  const { index, next, prev } = usePagedRotation(count, rotateMs);

  const [overlay, setOverlay] = useState<NewsDisplayItem | null>(null);
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const onTap = options.tapAction === 'none' ? undefined : (item: NewsDisplayItem) => setOverlay(item);

  // Hub commands: `next` / `prev` page the rotation, `details` opens the
  // current story (the lead on a front page), `dismiss` closes the overlay.
  const current = view === 'front-page' ? items[index * FRONT_PAGE_SIZE] : items[index];
  useModuleCommand('fullscreen-news', (action) => {
    if (action === 'next') next();
    else if (action === 'prev') prev();
    else if (action === 'details') { if (current && options.tapAction !== 'none') setOverlay(current); }
    else if (action === 'dismiss') setOverlay(null);
  });

  const themeGround = { backgroundColor: theme.bg, backgroundImage: theme.bgImage ?? 'none' };
  const hasFeeds = Array.isArray(config.feeds) && config.feeds.some((f) => f?.url?.trim());
  const gate = moduleGate({
    style: { ...style, textColor: theme.text },
    data: hasFeeds ? data : { feeds: [] },
    error,
    loadingMessage: t('news.loading'),
    empty: !hasFeeds ? t('news.noFeeds') : allFailed ? t('news.allUnavailable') : items.length === 0 && t('news.empty'),
  });
  if (gate) {
    return (
      <div ref={containerRef} data-fullscreen-news-view={view} className="w-full h-full" style={{ ...themeGround, fontSize: Math.min(dims.w, dims.h) * 0.026 }}>
        {gate}
      </div>
    );
  }

  const scale = buildNewsScale(dims.w, dims.h, getTypoMultiplier(config.typographySize ?? 'medium'));
  const ctx: NewsViewContext = {
    items, scale, theme, accent, options, t, locale, now, onTap, timezone,
    timeFormat: timeFormat ?? DEFAULT_TIME_FORMAT,
  };
  const overlayMeta = overlay
    ? metaParts(overlay, { showSource: true, showTimestamp: true }, formatNewsAge(overlay.timestamp, t, locale, now)).join(' · ')
    : '';

  return (
    <div
      ref={containerRef}
      data-fullscreen-news-view={view}
      className="relative w-full h-full overflow-hidden"
      style={{ ...themeGround, color: theme.text }}
    >
      {view === 'front-page' ? (
        <FrontPageView page={index} pageCount={count} title={mastheadTitle(config, t)} ctx={ctx} />
      ) : (
        current && <StoryView item={current} index={index} ctx={ctx} />
      )}
      {overlay && options.tapAction !== 'none' && (
        <div className="absolute inset-0 z-20" style={{ fontSize: scale.s * 3.2, color: '#fafafa' }}>
          <StoryOverlay item={overlay} mode={options.tapAction} meta={overlayMeta} onClose={closeOverlay} t={t} />
        </div>
      )}
    </div>
  );
}
