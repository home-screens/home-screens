'use client';

import type { CSSProperties } from 'react';
import type { DayBadge } from '@/lib/calendar-rules';
import { pickPillTextColor } from '@/lib/calendar-utils';

/**
 * Chip stack from day rules, rendered next to a day number in both calendar
 * modules. Sized in `em` so it follows whichever font size the host cell
 * uses; a badge with a color renders as a filled pill, one without inherits
 * the surrounding text color as a plain glyph/word.
 */
export function DayBadges({ badges, style }: { badges: DayBadge[]; style?: CSSProperties }) {
  if (badges.length === 0) return null;
  return (
    <span
      data-day-badges=""
      className="inline-flex items-center flex-wrap"
      style={{ gap: '0.2em', minWidth: 0, ...style }}
    >
      {badges.map((badge, i) => {
        const label = [badge.icon, badge.text].filter(Boolean).join(' ');
        const filled = Boolean(badge.color);
        return (
          <span
            key={i}
            data-day-badge=""
            className="inline-flex items-center leading-none whitespace-nowrap"
            style={{
              fontSize: '0.7em',
              fontWeight: 700,
              padding: filled ? '0.15em 0.4em' : undefined,
              borderRadius: '0.4em',
              backgroundColor: badge.color || undefined,
              color: badge.color ? pickPillTextColor(badge.color) : undefined,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}
