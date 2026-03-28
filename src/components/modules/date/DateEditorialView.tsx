'use client';

import { buildInfoParts, parseDateParts } from '@/lib/date-info';
import type { DateViewProps } from './types';

export default function DateEditorialView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const { dayNumber, monthName, dayName, year } = parseDateParts(now);

  const infoParts = buildInfoParts(config, now);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center"
    >
      <div className="flex items-center gap-3">
        {/* Large day number */}
        <div
          className="font-extralight leading-none"
          style={{ fontSize: scaledFontSize * 5, color: config.accentColor }}
          suppressHydrationWarning
        >
          {dayNumber}
        </div>

        {/* Divider */}
        <div
          className="self-stretch w-px opacity-30"
          style={{ backgroundColor: config.accentColor }}
        />

        {/* Month, day name, year stacked */}
        <div className="flex flex-col justify-center gap-0.5">
          <div
            className="uppercase tracking-[0.15em] font-medium leading-tight"
            style={{ fontSize: scaledFontSize * 1.1 }}
            suppressHydrationWarning
          >
            {monthName}
          </div>
          {config.showDayName && (
            <div
              className="opacity-50 leading-tight"
              style={{ fontSize: scaledFontSize * 0.85 }}
              suppressHydrationWarning
            >
              {dayName}
            </div>
          )}
          {config.showYear && (
            <div
              className="opacity-40 leading-tight"
              style={{ fontSize: scaledFontSize * 0.8 }}
              suppressHydrationWarning
            >
              {year}
            </div>
          )}
          {infoParts.length > 0 && (
            <div
              className="opacity-35 tracking-wider uppercase leading-tight mt-0.5"
              style={{ fontSize: scaledFontSize * 0.65 }}
              suppressHydrationWarning
            >
              {infoParts.join(' \u00b7 ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
