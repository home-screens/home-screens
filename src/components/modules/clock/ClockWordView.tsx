'use client';

import { format } from 'date-fns';
import { timeToWords } from './word-time';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ClockViewProps } from './types';

export default function ClockWordView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const words = timeToWords(hours, minutes);

  const dateStr = config.showDate ? format(now, config.dateFormat || 'EEEE, MMMM d') : null;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center px-4"
    >
      <div
        className="text-center"
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: scaledFontSize * 1.8,
          lineHeight: 1.7,
          color: 'rgba(255, 248, 240, 0.92)',
          letterSpacing: '0.01em',
        }}
        suppressHydrationWarning
      >
        {words}
      </div>

      {dateStr && (
        <div
          className="text-center mt-4"
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
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
