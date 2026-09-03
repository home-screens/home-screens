'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useTranslate } from '@/i18n';
import { useHiddenRowCount } from '../shared/useHiddenRowCount';

/** Rows this box counts. Views stamp it on each chore row. */
export const CHORE_ROW_ATTR = 'data-chore-row';

interface FitRowsProps {
  children: ReactNode;
  /** Classes for the scrolling element (the views' own spacing). */
  className?: string;
  style?: CSSProperties;
}

/**
 * The card chore chart's scrolling list, which says how many chores are below
 * the fold instead of hiding them in silence.
 *
 * The sibling of the wall chart's `FitList`, sharing its measurement
 * (`useHiddenRowCount`) but not its look: a card sits on whatever background
 * the household chose, so this uses a neutral translucent pill that reads on
 * a dark or light card rather than the wall chart's themed gradient fade.
 *
 * Sizes come from the surrounding `em`, so the pill shrinks with the fitted
 * chart type (see `fitChoreFontSize`).
 */
export function FitRows({ children, className = '', style }: FitRowsProps) {
  const t = useTranslate('modules');
  const { scrollerRef, contentRef, overflows, hidden } = useHiddenRowCount(`[${CHORE_ROW_ATTR}]`);

  return (
    // The pill gets its own strip at the bottom rather than sitting on top of
    // a half-visible row. Reserved only once the list already overflows, so it
    // cannot tip a list that fits into one that does not.
    <div className="relative flex-1 min-h-0" style={{ paddingBottom: overflows ? '1.7em' : undefined, ...style }}>
      <div
        ref={scrollerRef}
        data-testid="chore-list"
        className="h-full"
        style={{
          overflowY: overflows ? 'auto' : 'hidden',
          scrollbarWidth: 'none',
          touchAction: 'pan-y',
        }}
      >
        <div ref={contentRef} className={className}>{children}</div>
      </div>
      {overflows && hidden > 0 && (
        <div
          data-testid="chore-more-below"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center"
        >
          <span
            className="font-semibold"
            style={{
              fontSize: '0.62em',
              padding: '0.18em 0.7em',
              borderRadius: 999,
              background: 'rgba(120,120,120,0.30)',
              border: '1px solid rgba(160,160,160,0.35)',
              backdropFilter: 'blur(3px)',
              whiteSpace: 'nowrap',
            }}
          >
            {t('common.moreBelow', { count: hidden })}
          </span>
        </div>
      )}
    </div>
  );
}
