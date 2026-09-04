'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/**
 * Stacked rows. Rows that do not fit are not clipped: the list is measured
 * once per data / size change, cut into pages of whole rows, and pages turn
 * on the rotate interval. Everything fits -> one page, no rotation.
 */
export default function ListView({ items, config, t, locale, newKeys, onTap, command, unavailable, fontScaleKey }: NewsViewProps) {
  // The poll hands back a fresh `items` array every refresh, so keying the
  // re-measure on its identity would re-page (and so reset to page 1) even
  // when the rendered rows are byte-identical. Key on what the rows say.
  const rowsKey = items.map((i) => `${newsItemKey(i)}|${i.title}|${i.description}|${i.imageUrl ?? ''}|${i.source}`).join('\u0001');
  const listRef = useRef<HTMLDivElement>(null);
  // The box the ResizeObserver last reported, as part of the measure key: a
  // module that is resized, or whose font arrives a render after it mounts,
  // must page again against the new box.
  const [boxKey, setBoxKey] = useState('');

  // Everything that changes a row's height. The measurement belongs to exactly
  // one of these keys.
  const measureKey = [rowsKey, config.showDescription, config.descriptionLines, config.showImages, config.showTimestamp, config.showSource, config.singleLineTitles, fontScaleKey, boxKey].join('|');

  // The key is stored WITH the pages, and a stale key reads as null — the
  // measuring pass in which every row is rendered so its height can be read.
  // Deriving the reset rather than firing it from an effect is what makes this
  // safe: on the render where the key changes, the rows are already all on
  // screen for the layout effect below to measure. Resetting from a passive
  // effect instead put a paint between the two, and the reset could land after
  // a measurement it was meant to invalidate — which left the list stuck in
  // its measuring pass, every row rendered and clipped at the box edge.
  const [fit, setFit] = useState<{ key: string; pages: number[][] }>({ key: '', pages: [] });
  const pages = fit.key === measureKey ? fit.pages : null;

  // Size the last measurement saw; a ResizeObserver callback reporting
  // anything else (including the first real layout after a hidden mount)
  // triggers a re-measure.
  const measuredRef = useRef<{ w: number; h: number } | null>(null);

  // No dependency array: the effect runs after every render and returns
  // immediately unless the pages are stale, so it can never miss a key change.
  useLayoutEffect(() => {
    if (pages !== null) return;
    const el = listRef.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-news-row]'));
    const available = el.clientHeight;
    // Not laid out yet (hidden screen, zero-height box): leave the measuring
    // pass in place and let the ResizeObserver below call us back.
    if (available <= 0 || rows.some((r) => r.offsetHeight === 0)) return;
    measuredRef.current = { w: el.clientWidth, h: el.clientHeight };
    const gap = parseFloat(getComputedStyle(el).rowGap || '0') || 0;
    const result: number[][] = [];
    let page: number[] = [];
    let used = 0;
    rows.forEach((row, i) => {
      const h = row.offsetHeight;
      const needed = page.length === 0 ? h : used + gap + h;
      if (page.length > 0 && needed > available) {
        result.push(page);
        page = [i];
        used = h;
      } else {
        page.push(i);
        used = needed;
      }
    });
    if (page.length > 0) result.push(page);
    setFit({ key: measureKey, pages: result.length > 0 ? result : [[]] });
  });

  // Re-measure when the box itself changes size (font scaling, editor resize).
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const m = measuredRef.current;
      if (m && Math.abs(m.h - el.clientHeight) < 1 && Math.abs(m.w - el.clientWidth) < 1) return;
      setBoxKey(`${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
          const age = formatNewsAge(item.timestamp, t, locale);
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
                    style={{ backgroundColor: item.sourceColor ?? config.accentColor ?? 'rgba(255,255,255,0.35)' }}
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
                    breaking={config.highlightBreaking && isBreaking(item)}
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
