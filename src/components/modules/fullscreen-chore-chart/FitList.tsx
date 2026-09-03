'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';

interface FitListProps {
  children: React.ReactNode;
  /** Text size for the "more below" line. */
  fontSize: number;
  style?: React.CSSProperties;
  /** Inner scroller padding, so the fade overlay can sit on the outer box. */
  innerStyle?: React.CSSProperties;
  testId?: string;
}

/**
 * A list box that measures its own overflow instead of predicting it. When
 * the rows do not fit it scrolls by touch, fades the last rows, and says how
 * many are below the fold: a wall chart must never hide a chore in silence.
 * Measuring cannot feed back into the row size, which comes from the outer
 * box height, not from the rows.
 */
export default function FitList({ children, fontSize, style, innerStyle, testId }: FitListProps) {
  const t = useTranslate('modules');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState(0);
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const over = el.scrollHeight > el.clientHeight + 1;
    let below = 0;
    if (over) {
      const bottom = el.getBoundingClientRect().bottom;
      for (const row of el.querySelectorAll('[data-testid="fcc-row"]')) {
        const r = row.getBoundingClientRect();
        // A row counts as hidden when less than half of it is on screen.
        if (r.top + r.height / 2 > bottom) below += 1;
      }
    }
    setOverflows((prev) => (prev === over ? prev : over));
    setHidden((prev) => (prev === below ? prev : below));
  }, []);

  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, [measure]);

  return (
    <div style={{ position: 'relative', minHeight: 0, ...style }}>
      <div
        ref={scrollerRef}
        data-testid={testId}
        style={{
          height: '100%',
          overflowY: overflows ? 'auto' : 'hidden',
          scrollbarWidth: 'none',
          touchAction: 'pan-y',
          boxSizing: 'border-box',
          ...innerStyle,
        }}
      >
        {children}
      </div>
      {overflows && hidden > 0 && (
        <div
          data-testid="fcc-more-below"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: fontSize * 3.2,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: fontSize * 0.3,
            background: 'linear-gradient(to bottom, transparent, var(--fcc-bg) 70%)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize, fontWeight: 600, color: 'var(--fcc-text-2)', background: 'var(--fcc-surface)', border: '1px solid var(--fcc-border)', borderRadius: 999, padding: `${fontSize * 0.2}px ${fontSize * 0.7}px` }}>
            {t('fullscreen-chore-chart.moreBelow', { count: hidden })}
          </span>
        </div>
      )}
    </div>
  );
}
