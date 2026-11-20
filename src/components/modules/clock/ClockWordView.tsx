'use client';

import { timeToWords } from './word-time';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY, INK } from '@/lib/constants';
import { clockAlignmentStyle } from './alignment';
import { noWrap } from './fixed-size';
import { useClockDateLine } from './use-date-info';
import type { ClockViewProps } from './types';
import { EDITORIAL_SERIF_STACK } from '@/lib/font-registry';

/**
 * The words in the card's own ink, warmed a little. With the default white
 * text this is the cream the view has always been (255, 248, 240 at 92%);
 * with dark text on a light card it is that dark, where a fixed cream was
 * unreadable.
 */
const WARM_INK = `color-mix(in srgb, color-mix(in srgb, ${INK} 94%, rgb(255 138 5)) 92%, transparent)`;

export default function ClockWordView({ config, now, time, scaledFontSize, fitToBox, containerRef }: ClockViewProps) {
  const t = useTranslate('modules');
  const words = timeToWords(t, time.hours, time.minutes);

  const dateStr = useClockDateLine(config, now);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col px-4"
      style={clockAlignmentStyle(config, 'column')}
    >
      <div
        className="text-center"
        style={{
          fontFamily: EDITORIAL_SERIF_STACK,
          fontSize: scaledFontSize * 1.8,
          lineHeight: 1.7,
          color: WARM_INK,
          letterSpacing: '0.01em',
          // Prose: wraps at its own width in fixed mode, not the box's.
          ...(fitToBox ? {} : { width: 'max-content', maxWidth: scaledFontSize * 16 }),
        }}
        suppressHydrationWarning
      >
        {words}
      </div>

      {dateStr && (
        <div
          className="text-center mt-4"
          style={{ ...noWrap(fitToBox),
            fontFamily: EDITORIAL_SERIF_STACK,
            fontSize: scaledFontSize * 0.9,
            lineHeight: 1.6,
            letterSpacing: '0.02em',
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
