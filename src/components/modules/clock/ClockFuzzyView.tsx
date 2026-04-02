'use client';

import { format } from 'date-fns';
import { parseClockTime } from '@/lib/date-info';
import { timeToFuzzy } from './word-time';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ClockViewProps } from './types';

/**
 * Fuzzy clock — warm, conversational time in italic serif typography.
 * "almost half past two", "quarter to three"
 *
 * Literary and cozy, distinct from the formal "word" view.
 */
export default function ClockFuzzyView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { hours, minutes } = parseClockTime(config.format24h, now);

  const fuzzyText = timeToFuzzy(hours, minutes);
  const dateStr = config.showDate
    ? format(now, config.dateFormat || 'EEEE, MMMM d')
    : null;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center px-6"
    >
      <div
        className="text-center leading-snug"
        style={{
          fontSize: scaledFontSize * 2.2,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontWeight: 300,
          lineHeight: 1.3,
          maxWidth: '90%',
        }}
        suppressHydrationWarning
      >
        {fuzzyText}
      </div>

      {dateStr && (
        <div
          className="text-center font-light tracking-wide"
          style={{
            fontSize: scaledFontSize * 0.9,
            fontFamily: 'inherit',
            fontStyle: 'normal',
            marginTop: scaledFontSize * 0.8,
            opacity: TEXT_OPACITY.tertiary,
          }}
          suppressHydrationWarning
        >
          {dateStr}
        </div>
      )}
    </div>
  );
}
