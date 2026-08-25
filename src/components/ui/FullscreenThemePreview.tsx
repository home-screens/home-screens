'use client';

import { memo, type CSSProperties } from 'react';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { eventSurface } from '@/lib/calendar-event-surface';

/**
 * A miniature of what a theme actually looks like: its background (including
 * any atmosphere layer), its header bar, its accent, and three event blocks
 * painted in its own event style.
 *
 * The two-swatch chip this replaced could not tell Midnight from Horizon —
 * both are "dark background, dark border" — and said nothing at all about how
 * events are drawn, which is the most visible difference between themes.
 *
 * The blocks go through the same `eventSurface` the kiosk paints with, fed
 * the theme's own tokens as CSS variables, so the tile cannot drift from the
 * real thing. Only the wash bar is thinned: 3px is a third of a 4px block.
 */

const SAMPLE_COLORS = ['#3B82F6', '#10B981', '#8B5CF6'];
const BLOCK_WIDTHS = ['86%', '62%', '74%'];

const SIZES = {
  sm: { w: 44, h: 30, header: 9, pad: 3, block: 4, gap: 2, radius: 5 },
  md: { w: 60, h: 40, header: 11, pad: 4, block: 5, gap: 2.5, radius: 6 },
} as const;

function FullscreenThemePreview({
  tokens,
  size = 'md',
  className,
}: {
  tokens: FullscreenThemeTokens;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  const paint = { isDark: tokens.isDark, eventStyle: tokens.eventStyle ?? 'wash' } as const;
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        width: s.w,
        height: s.h,
        flexShrink: 0,
        borderRadius: s.radius,
        overflow: 'hidden',
        border: `1px solid ${tokens.border}`,
        backgroundColor: tokens.bg,
        backgroundImage: tokens.bgImage ?? 'none',
        backgroundSize: 'cover',
        // The tokens `eventSurface` reads for `rule` and stacked paint.
        '--cal-bg': tokens.bg,
        '--cal-surface': tokens.surface,
        '--cal-card-shadow': tokens.cardShadow,
      } as CSSProperties}
    >
      <div
        style={{
          height: s.header,
          background: tokens.headerBg,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: `0 ${s.pad}px`,
        }}
      >
        <div style={{ width: '38%', height: 2, borderRadius: 1, background: tokens.text, opacity: 0.7 }} />
        <div
          style={{
            marginLeft: 'auto',
            width: '20%',
            height: 3,
            borderRadius: 999,
            background: tokens.accent ?? tokens.textMuted,
          }}
        />
      </div>
      <div style={{ padding: s.pad, display: 'flex', flexDirection: 'column', gap: s.gap }}>
        {SAMPLE_COLORS.map((color, i) => (
          <div
            key={color}
            style={{
              width: BLOCK_WIDTHS[i],
              height: s.block,
              ...eventSurface(color, paint, 'block', { radius: 2, barWidth: '2px' }),
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Rendered a dozen times per picker; the tokens are module-level constants,
// so a memo turns every re-render of the picker into a no-op here.
export default memo(FullscreenThemePreview);
