'use client';

import { buildInfoParts, parseDateParts } from '@/lib/date-info';
import { TEXT_OPACITY } from '@/lib/constants';
import type { DateViewProps } from './types';

export default function DateFullView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const { dayNumber, monthName, dayName, year } = parseDateParts(now);

  const infoParts = buildInfoParts(config, now);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      {config.showDayName && (
        <div
          className="uppercase tracking-[0.2em] font-medium"
          style={{ fontSize: scaledFontSize * 0.9, opacity: TEXT_OPACITY.dim }}
          suppressHydrationWarning
        >
          {dayName}
        </div>
      )}
      <div
        className="font-light leading-none"
        style={{ fontSize: scaledFontSize * 4.5, color: config.accentColor }}
        suppressHydrationWarning
      >
        {dayNumber}
      </div>
      <div
        className="uppercase tracking-[0.15em] font-medium"
        style={{ fontSize: scaledFontSize * 1.1, opacity: TEXT_OPACITY.secondary }}
        suppressHydrationWarning
      >
        {monthName}{config.showYear ? ` ${year}` : ''}
      </div>

      {infoParts.length > 0 && (
        <div
          className="mt-2 tracking-wider uppercase"
          style={{ fontSize: scaledFontSize * 0.75, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoParts.join(' \u00b7 ')}
        </div>
      )}
    </div>
  );
}
