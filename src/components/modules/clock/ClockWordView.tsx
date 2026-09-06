'use client';

import { timeToWords } from './word-time';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { clockAlignmentStyle } from './alignment';
import { noWrap } from './fixed-size';
import type { ClockViewProps } from './types';
import { EDITORIAL_SERIF_STACK } from '@/lib/font-registry';

export default function ClockWordView({ config, now, scaledFontSize, fitToBox, containerRef }: ClockViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const words = timeToWords(t, hours, minutes);

  const dateStr = config.showDate
    ? formatDateSync(now, config.dateFormat || 'EEEE, MMMM d', { locale })
    : null;

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
          color: 'rgba(255, 248, 240, 0.92)',
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
