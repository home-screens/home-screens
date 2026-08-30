'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import { SectionHeader } from '../shared/SectionHeader';
import { usePagedRotation } from '@/hooks/usePagedRotation';
import { newsItemKey } from '@/hooks/useNewsFeeds';
import { clampLines, formatNewsAge, isBreaking, metaParts } from './news-shared';
import { useViewCommand } from './news-hooks';
import { SourceTag } from './SourceTag';
import { StoryButton } from './StoryButton';
import { Thumbnail } from './Thumbnail';
import { UnavailableFooter } from './UnavailableFooter';
import type { NewsViewProps } from './news-view-types';

/** Dots stop fitting the tile past a dozen, so the strip windows instead. */
const MAX_DOTS = 12;

/**
 * One story at a time. A plain swap on the timer, no enter/exit animation:
 * rotating content on a wall display should not draw the eye every ten
 * seconds. Hub commands and taps move it by hand.
 */
export default function HeadlineView({ items, config, t, locale, newKeys, onTap, command, unavailable }: NewsViewProps) {
  const { index, next, prev } = usePagedRotation(items.length, config.rotateIntervalMs);
  const item = items[index];
  useViewCommand(command, {
    next,
    prev,
    details: () => { if (item && onTap) onTap(item); },
  });
  if (!item) return null;

  // With more stories than dots the strip slides to keep the lit dot in view;
  // showing the first twelve would leave every dot dim from story 13 on.
  const dotStart = Math.min(
    Math.max(index - Math.floor(MAX_DOTS / 2), 0),
    Math.max(items.length - MAX_DOTS, 0),
  );

  const age = formatNewsAge(item.timestamp, t, locale);
  const parts = metaParts(item, config, age);
  const showImage = config.showImages && !!item.imageUrl;

  return (
    <div className="flex flex-col h-full min-h-0">
      {config.showHeader && (
        <div className="flex items-baseline justify-between gap-2 shrink-0 mb-1">
          <SectionHeader>{config.title ?? t('news.header')}</SectionHeader>
          {config.showCounter && items.length > 1 && (
            <span data-news-counter className="tabular-nums" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}>
              {t('news.counter', { current: index + 1, total: items.length })}
            </span>
          )}
        </div>
      )}
      <StoryButton item={item} onTap={onTap} className="flex-1 min-h-0 w-full flex flex-col justify-center gap-2">
        {showImage && (
          <Thumbnail
            item={item}
            accentColor={config.accentColor}
            className="w-full"
            style={{ flex: '0 1 45%', minHeight: '3em', maxHeight: '45%' }}
          />
        )}
        <span
          className={`font-semibold leading-snug ${showImage ? 'text-left' : 'text-center'}`}
          style={{ fontSize: '1.05em', ...clampLines(config.singleLineTitles ? 1 : showImage ? 3 : 4) }}
        >
          {item.title}
        </span>
        {config.showDescription && item.description && (
          <span
            className={`leading-snug ${showImage ? 'text-left' : 'text-center'}`}
            style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.secondary, ...clampLines(config.descriptionLines) }}
          >
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
          className={showImage ? '' : 'justify-center'}
        />
      </StoryButton>
      {!config.showHeader && config.showCounter && items.length > 1 && (
        <div className="flex justify-center gap-1 shrink-0 pt-1" aria-hidden>
          {items.slice(dotStart, dotStart + MAX_DOTS).map((dot, i) => (
            <span
              key={newsItemKey(dot)}
              className="rounded-full"
              style={{ width: '0.3em', height: '0.3em', backgroundColor: 'currentColor', opacity: dotStart + i === index ? 0.9 : 0.25 }}
            />
          ))}
        </div>
      )}
      <UnavailableFooter labels={unavailable} t={t} />
    </div>
  );
}
