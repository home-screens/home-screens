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
  const listRef = useRef<HTMLDivElement>(null);
  // null = measuring pass: every row rendered so heights can be read.
  const [pages, setPages] = useState<number[][] | null>(null);
  const [gen, setGen] = useState(0);

  // Anything that changes row heights sends the list back to its measuring
  // pass. Skipped on mount: the layout effect below has already measured by
  // the time this passive effect runs, and resetting here would throw that
  // first page layout away.
  const measureDeps = [items, config.showDescription, config.descriptionLines, config.showImages, config.showTimestamp, config.showSource, config.singleLineTitles, fontScaleKey, gen];
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    setPages(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps listed explicitly above
  }, measureDeps);

  // Size the last measurement saw; a ResizeObserver callback reporting
  // anything else (including the first real layout after a hidden mount)
  // triggers a re-measure.
  const measuredRef = useRef<{ w: number; h: number } | null>(null);

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
    setPages(result.length > 0 ? result : [[]]);
    // `gen` re-runs the measurement even when `pages` was already null (a
    // hidden mount that never produced a first page).
  }, [pages, gen]);

  // Re-measure when the box itself changes size (font scaling, editor resize).
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const m = measuredRef.current;
      if (m && Math.abs(m.h - el.clientHeight) < 1 && Math.abs(m.w - el.clientWidth) < 1) return;
      setGen((g) => g + 1);
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
      {config.showHeader && (
        <div className="flex items-baseline justify-between gap-2 shrink-0 mb-2">
          <SectionHeader>{config.title ?? t('news.header')}</SectionHeader>
          {pageCount > 1 && (
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
