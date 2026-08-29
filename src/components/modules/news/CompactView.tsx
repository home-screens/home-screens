'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import { newsItemKey } from '@/hooks/useNewsFeeds';
import { formatNewsAge, isBreaking } from './news-shared';
import { useViewCommand } from './news-hooks';
import { StoryButton } from './StoryButton';
import { UnavailableFooter } from './UnavailableFooter';
import type { NewsViewProps } from './news-view-types';

/** Dense one-liners: source, headline, age. No header, no images. */
export default function CompactView({ items, config, t, locale, newKeys, onTap, command, unavailable }: NewsViewProps) {
  useViewCommand(command, {
    details: () => { if (items[0] && onTap) onTap(items[0]); },
  });
  const marker = config.accentColor ?? '#f59e0b';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-col justify-center flex-1 min-h-0 overflow-hidden gap-1 px-1">
        {items.map((item) => {
          const breaking = config.highlightBreaking && isBreaking(item);
          const isNew = config.showNewMarker && newKeys.has(newsItemKey(item));
          const age = formatNewsAge(item.timestamp, t, locale);
          return (
            <StoryButton
              key={newsItemKey(item)}
              item={item}
              onTap={onTap}
              className="flex items-baseline justify-between gap-2 w-full"
              style={{ fontSize: '0.85em' }}
            >
              <span className="flex items-baseline gap-1.5 min-w-0">
                {(breaking || isNew) && (
                  <span
                    data-news-breaking={breaking ? '' : undefined}
                    data-news-new={!breaking && isNew ? '' : undefined}
                    className="inline-block rounded-full shrink-0 self-center"
                    style={{ width: '0.45em', height: '0.45em', backgroundColor: marker }}
                    title={breaking ? t('news.justIn') : t('news.newStory')}
                  />
                )}
                {config.showSource && item.source && (
                  <span
                    className="shrink-0 uppercase tracking-wider"
                    style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.secondary, color: item.sourceColor ?? undefined }}
                  >
                    {item.source}
                  </span>
                )}
                <span className="truncate leading-snug">{item.title}</span>
              </span>
              {config.showTimestamp && age && (
                <span className="shrink-0 tabular-nums" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>
                  {age}
                </span>
              )}
            </StoryButton>
          );
        })}
      </div>
      <UnavailableFooter labels={unavailable} t={t} />
    </div>
  );
}
