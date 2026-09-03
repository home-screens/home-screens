'use client';

import React from 'react';
import { useTranslate } from '@/i18n';
import { useHiddenRowCount } from '../shared/useHiddenRowCount';

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
  const { scrollerRef, contentRef, overflows, hidden } = useHiddenRowCount('[data-testid="fcc-row"]');

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
        <div ref={contentRef}>{children}</div>
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
            {t('common.moreBelow', { count: hidden })}
          </span>
        </div>
      )}
    </div>
  );
}
