'use client';

import { TEXT_OPACITY, ink } from '@/lib/constants';
import { SectionHeader } from '../shared/SectionHeader';
import { usePagedRotation } from '@/hooks/usePagedRotation';
import { usePagedFit } from '../shared/usePagedFit';
import { newsItemKey } from '@/hooks/useNewsFeeds';
import { formatNewsAge, isBreaking, metaParts } from './news-shared';
import { clampLines } from '@/components/modules/shared/clampLines';
import { useViewCommand } from './news-hooks';
import { SourceTag } from './SourceTag';
import { StoryButton } from './StoryButton';
import { Thumbnail } from './Thumbnail';
import { UnavailableFooter } from './UnavailableFooter';
import type { NewsViewProps } from './news-view-types';

/**
 * Stacked rows. Rows that do not fit are not clipped: the list is measured
 * once per data / size change, cut into pages of whole rows, and pages turn
 * on the rotate interval. Everything fits -> one page, no rotation.
 */
export default function ListView({ items, config, t, locale, timezone, now, newKeys, onTap, command, unavailable, fontScaleKey }: NewsViewProps) {
  // The poll hands back a fresh `items` array every refresh, so keying the
  // re-measure on its identity would re-page (and so reset to page 1) even
  // when the rendered rows are byte-identical. Key on what the rows say.
  const rowsKey = items.map((i) => `${newsItemKey(i)}|${i.title}|${i.description}|${i.imageUrl ?? ''}|${i.source}`).join('\u0001');

  // Everything that changes a row's height. The measurement belongs to exactly
  // one of these keys.
  const measureKey = [rowsKey, config.showDescription, config.descriptionLines, config.showImages, config.showTimestamp, config.showSource, config.singleLineTitles, fontScaleKey].join('|');
  const { ref: listRef, pages } = usePagedFit('[data-news-row]', measureKey);

  const pageCount = pages?.length ?? 1;
  const { index: pageIndex, next, prev } = usePagedRotation(pageCount, config.rotateIntervalMs);
  const visible = pages ? new Set(pages[pageIndex] ?? []) : null;
  useViewCommand(command, {
    next,
    prev,
    details: () => {
      const first = pages ? (pages[pageIndex] ?? [])[0] : 0;
      const item = items[first ?? 0];
      if (item && onTap) onTap(item);
    },
  });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {config.showTitle && (
        <div className="flex items-baseline justify-between gap-2 shrink-0 mb-2">
          <SectionHeader>{config.title ?? t('news.header')}</SectionHeader>
          {config.showCounter && pageCount > 1 && (
            <span data-news-counter className="tabular-nums" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}>
              {t('news.counter', { current: pageIndex + 1, total: pageCount })}
            </span>
          )}
        </div>
      )}
      <div ref={listRef} data-news-list data-news-pages={pages?.length ?? 0} className="flex flex-col gap-2.5 flex-1 min-h-0 overflow-hidden pr-1">
        {items.map((item, i) => {
          const hidden = visible !== null && !visible.has(i);
          const age = formatNewsAge(item.timestamp, t, { locale, timezone }, now);
          const parts = metaParts(item, config, age);
          return (
            <StoryButton
              key={newsItemKey(item)}
              item={item}
              onTap={onTap}
              className="flex gap-2 w-full"
              style={{ fontSize: '0.9em', display: hidden ? 'none' : undefined }}
            >
              <div data-news-row className="flex gap-2 w-full min-w-0">
                {config.showImages && item.imageUrl ? (
                  <Thumbnail item={item} accentColor={config.accentColor} style={{ width: '3.4em', height: '3.4em' }} />
                ) : (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                    style={{ backgroundColor: item.sourceColor ?? config.accentColor ?? ink(0.35) }}
                  />
                )}
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="leading-snug" style={clampLines(config.singleLineTitles ? 1 : 2)}>{item.title}</span>
                  {config.showDescription && item.description && (
                    <span className="leading-snug" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.secondary, ...clampLines(config.descriptionLines) }}>
                      {item.description}
                    </span>
                  )}
                  <SourceTag
                    item={item}
                    parts={parts}
                    breaking={config.highlightBreaking && isBreaking(item, now)}
                    isNew={config.showNewMarker && newKeys.has(newsItemKey(item))}
                    accentColor={config.accentColor}
                    t={t}
                    size="xs"
                  />
                </div>
              </div>
            </StoryButton>
          );
        })}
      </div>
      <UnavailableFooter labels={unavailable} t={t} />
    </div>
  );
}
