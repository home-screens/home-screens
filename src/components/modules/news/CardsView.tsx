'use client';

import { useMemo } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import { SectionHeader } from '../shared/SectionHeader';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { usePagedRotation } from '@/hooks/usePagedRotation';
import { newsItemKey } from '@/hooks/useNewsFeeds';
import { clampLines, formatNewsAge, isBreaking, metaParts } from './news-shared';
import { useViewCommand } from './news-hooks';
import { SourceTag } from './SourceTag';
import { StoryButton } from './StoryButton';
import { Thumbnail } from './Thumbnail';
import { UnavailableFooter } from './UnavailableFooter';
import type { NewsViewProps } from './news-view-types';

/** Text block under each picture, in em of the module font. */
const CARD_TEXT_EM = 4.4;
const CARD_GAP_EM = 0.6;

/**
 * Photo grid. Column count is configured; rows are however many whole cards
 * fit the box, and the grid pages through the list on the rotate interval.
 */
export default function CardsView({ items, config, t, locale, newKeys, onTap, command, unavailable, fontScaleKey }: NewsViewProps) {
  const { containerRef, dims } = useFullscreenDims();
  const cols = config.cardColumns;

  // Card height = 16:9 picture + fixed text block, all in px of the current font.
  const perPage = useMemo(() => {
    const fontPx = fontScaleKey || parseFloat(containerRef.current ? getComputedStyle(containerRef.current).fontSize : '16') || 16;
    const gapPx = CARD_GAP_EM * fontPx;
    const colW = Math.max(1, (dims.w - gapPx * (cols - 1)) / cols);
    const cardH = (config.showImages ? colW * 9 / 16 : 0) + CARD_TEXT_EM * fontPx;
    const rows = Math.max(1, Math.floor((dims.h + gapPx) / (cardH + gapPx)));
    return rows * cols;
  }, [dims.w, dims.h, cols, config.showImages, containerRef, fontScaleKey]);

  const pages = useMemo(() => {
    const out: typeof items[] = [];
    for (let i = 0; i < items.length; i += perPage) out.push(items.slice(i, i + perPage));
    return out.length > 0 ? out : [[]];
  }, [items, perPage]);

  const { index: pageIndex, next, prev } = usePagedRotation(pages.length, config.rotateIntervalMs);
  const page = pages[pageIndex] ?? [];
  useViewCommand(command, {
    next,
    prev,
    details: () => { if (page[0] && onTap) onTap(page[0]); },
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {config.showTitle && (
        <div className="flex items-baseline justify-between gap-2 shrink-0 mb-2">
          <SectionHeader>{config.title ?? t('news.header')}</SectionHeader>
          {config.showCounter && pages.length > 1 && (
            <span data-news-counter className="tabular-nums" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}>
              {t('news.counter', { current: pageIndex + 1, total: pages.length })}
            </span>
          )}
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
        <div
          data-news-cards
          className="grid content-start"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: `${CARD_GAP_EM}em` }}
        >
          {page.map((item) => {
            const age = formatNewsAge(item.timestamp, t, locale);
            const parts = metaParts(item, config, age);
            return (
              <StoryButton key={newsItemKey(item)} item={item} onTap={onTap} className="flex flex-col gap-1 min-w-0 w-full">
                {config.showImages && (
                  <Thumbnail item={item} accentColor={config.accentColor} className="w-full" style={{ aspectRatio: '16 / 9' }} />
                )}
                <span className="font-semibold leading-snug" style={{ fontSize: '0.85em', ...clampLines(config.singleLineTitles ? 1 : 2) }}>
                  {item.title}
                </span>
                {config.showDescription && item.description && (
                  <span className="leading-snug" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.secondary, ...clampLines(config.descriptionLines) }}>
                    {item.description}
                  </span>
                )}
                <SourceTag
                  item={item}
                  parts={parts}
                  breaking={config.highlightBreaking && isBreaking(item)}
                  isNew={config.showNewMarker && newKeys.has(newsItemKey(item))}
                  accentColor={config.accentColor}
                  t={t}
                  size="xs"
                />
              </StoryButton>
            );
          })}
        </div>
      </div>
      <UnavailableFooter labels={unavailable} t={t} />
    </div>
  );
}
