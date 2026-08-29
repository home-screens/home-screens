'use client';

import { useEffect, useState } from 'react';
import TickerMarquee from '../TickerMarquee';
import { TEXT_OPACITY } from '@/lib/constants';
import { newsItemKey } from '@/hooks/useNewsFeeds';
import { isBreaking } from './news-shared';
import { useViewCommand } from './news-hooks';
import { StoryButton } from './StoryButton';
import type { NewsViewProps } from './news-view-types';

const PAUSE_MS = 15_000;
const SEPARATORS = { dot: '•', pipe: '|', slash: '/' } as const;

/**
 * Horizontal marquee. A touch pauses the scroll for a moment so a headline
 * can actually be read (and tapped) on a touch display.
 */
export default function TickerView({ items, config, t, newKeys, onTap, command }: NewsViewProps) {
  const [pausedUntil, setPausedUntil] = useState(0);
  const paused = pausedUntil > Date.now();
  useEffect(() => {
    if (!paused) return;
    const id = setTimeout(() => setPausedUntil(0), pausedUntil - Date.now());
    return () => clearTimeout(id);
  }, [paused, pausedUntil]);

  useViewCommand(command, {
    details: () => { if (items[0] && onTap) onTap(items[0]); },
  });

  const sep = SEPARATORS[config.tickerSeparator] ?? SEPARATORS.dot;
  const marker = config.accentColor ?? '#f59e0b';

  return (
    <div
      className="h-full w-full"
      data-news-ticker-paused={paused ? 'true' : undefined}
      onPointerDown={() => setPausedUntil(Date.now() + PAUSE_MS)}
    >
      <TickerMarquee itemCount={items.length} speed={config.tickerSpeed} gap={8} paused={paused}>
        {items.map((item) => {
          const breaking = config.highlightBreaking && isBreaking(item);
          const isNew = config.showNewMarker && newKeys.has(newsItemKey(item));
          return (
            <StoryButton
              key={newsItemKey(item)}
              item={item}
              onTap={onTap}
              className="inline-flex items-center gap-3 whitespace-nowrap"
              style={{ fontSize: '0.9em' }}
            >
              <span
                className="shrink-0"
                style={{ color: item.sourceColor ?? config.accentColor ?? 'inherit', opacity: item.sourceColor || config.accentColor ? 0.9 : TEXT_OPACITY.tertiary }}
                aria-hidden
              >
                {sep}
              </span>
              {breaking && (
                <span
                  data-news-breaking
                  className="shrink-0 rounded-full px-1.5 uppercase tracking-wider font-semibold"
                  style={{ fontSize: '0.6em', color: marker, border: `1px solid ${marker}` }}
                >
                  {t('news.justIn')}
                </span>
              )}
              {isNew && !breaking && (
                <span data-news-new className="inline-block rounded-full shrink-0" style={{ width: '0.45em', height: '0.45em', backgroundColor: marker }} />
              )}
              {config.showSource && item.source && (
                <span className="shrink-0 uppercase tracking-wider" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.secondary }}>
                  {item.source}
                </span>
              )}
              <span>{item.title}</span>
            </StoryButton>
          );
        })}
      </TickerMarquee>
    </div>
  );
}
