'use client';

import { parseClockTime } from '@/lib/date-info';
import { timeToFuzzy } from './word-time';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { clockAlignmentStyle } from './alignment';
import { noWrap } from './fixed-size';
import { useClockDateLine } from './use-date-info';
import type { ClockViewProps } from './types';
import { EDITORIAL_SERIF_STACK } from '@/lib/font-registry';

/**
 * Fuzzy clock — warm, conversational time in italic serif typography.
 * "almost half past two", "quarter to three"
 *
 * Literary and cozy, distinct from the formal "word" view.
 */
export default function ClockFuzzyView({ config, format24h, now, time, scaledFontSize, fitToBox, containerRef }: ClockViewProps) {
  const t = useTranslate('modules');
  const { hours, minutes } = parseClockTime(format24h, time);

  const fuzzyText = timeToFuzzy(t, hours, minutes);
  const dateStr = useClockDateLine(config, now);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col px-6"
      style={clockAlignmentStyle(config, 'column')}
    >
      <div
        className="text-center leading-snug"
        style={{
          fontSize: scaledFontSize * 2.2,
          fontFamily: EDITORIAL_SERIF_STACK,
          fontStyle: 'italic',
          fontWeight: 300,
          lineHeight: 1.3,
          // Prose: wraps at its own width in fixed mode, not the box's.
          ...(fitToBox ? { maxWidth: '90%' } : { width: 'max-content', maxWidth: scaledFontSize * 16 }),
        }}
        suppressHydrationWarning
      >
        {fuzzyText}
      </div>

      {dateStr && (
        <div
          className="text-center font-light tracking-wide"
          style={{ ...noWrap(fitToBox),
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
