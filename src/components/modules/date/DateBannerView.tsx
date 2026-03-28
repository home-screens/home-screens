'use client';

import { getDateInfoValues, parseDateParts } from '@/lib/date-info';
import type { DateViewProps } from './types';

export default function DateBannerView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const { dayNumber, monthName, dayName, year } = parseDateParts(now);

  const parts: string[] = [];
  if (config.showDayName) parts.push(dayName.toUpperCase());
  parts.push(`${monthName.toUpperCase()} ${dayNumber}`);
  if (config.showYear) parts.push(year);

  const { weekNumber, dayOfYear } = getDateInfoValues(now);
  const infoParts: string[] = [];
  if (config.showWeekNumber) infoParts.push(`WK ${weekNumber}`);
  if (config.showDayOfYear) infoParts.push(`DAY ${dayOfYear}`);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div
        className="tracking-[0.15em] font-light text-center"
        style={{ fontSize: scaledFontSize * 1.4 }}
        suppressHydrationWarning
      >
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && (
              <span className="mx-2 opacity-30" style={{ color: config.accentColor }}>&bull;</span>
            )}
            {part}
          </span>
        ))}
      </div>

      {infoParts.length > 0 && (
        <div
          className="opacity-40 mt-1.5 tracking-[0.2em] uppercase"
          style={{ fontSize: scaledFontSize * 0.7 }}
          suppressHydrationWarning
        >
          {infoParts.join('  \u00b7  ')}
        </div>
      )}
    </div>
  );
}
