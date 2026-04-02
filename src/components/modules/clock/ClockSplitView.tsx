'use client';

import { format } from 'date-fns';
import { parseClockTime, getDateInfoValues } from '@/lib/date-info';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ClockViewProps } from './types';

/**
 * Split clock — time on the left, date and info on the right,
 * separated by a hairline vertical divider.
 */
export default function ClockSplitView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { hStr, mStr, sStr, period } = parseClockTime(config.format24h, now);
  const ampm = period.trimStart();

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}`
    : `${hStr}:${mStr}`;

  const dateStr = config.showDate
    ? format(now, config.dateFormat || 'EEEE, MMMM d')
    : null;

  const { weekNumber, dayOfYear } = getDateInfoValues(now);

  const infoParts: { label: string; value: string }[] = [];
  if (config.showWeekNumber) infoParts.push({ label: 'Week', value: String(weekNumber) });
  if (config.showDayOfYear) infoParts.push({ label: 'Day', value: String(dayOfYear) });

  const timeFontSize = scaledFontSize * 2.8;
  const dateFontSize = scaledFontSize * 1.0;
  const infoFontSize = scaledFontSize * 0.8;
  const dividerHeight = timeFontSize * 1.1;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center"
    >
      <div className="flex items-center" style={{ gap: scaledFontSize * 1.4 }}>
        {/* Left: Time */}
        <div className="flex flex-col items-end">
          <div
            className="tabular-nums font-light tracking-wide"
            style={{ fontSize: timeFontSize, lineHeight: 1 }}
            suppressHydrationWarning
          >
            {timeStr}
          </div>
          {ampm && (
            <div
              className="uppercase tracking-widest font-light"
              style={{ fontSize: scaledFontSize * 0.7, marginTop: 2, opacity: TEXT_OPACITY.tertiary }}
              suppressHydrationWarning
            >
              {ampm}
            </div>
          )}
        </div>

        {/* Divider */}
        <div
          className="opacity-15"
          style={{
            width: 1,
            height: dividerHeight,
            backgroundColor: 'currentColor',
          }}
        />

        {/* Right: Date and info */}
        <div className="flex flex-col justify-center" style={{ gap: scaledFontSize * 0.35 }}>
          {dateStr && (
            <div
              className="font-light"
              style={{ fontSize: dateFontSize, lineHeight: 1.3, opacity: TEXT_OPACITY.secondary }}
              suppressHydrationWarning
            >
              {dateStr}
            </div>
          )}

          {infoParts.length > 0 && (
            <div className="flex flex-col" style={{ gap: scaledFontSize * 0.15 }}>
              {infoParts.map((part) => (
                <div
                  key={part.label}
                  className="tabular-nums font-light tracking-wide uppercase"
                  style={{ fontSize: infoFontSize, lineHeight: 1.3, opacity: TEXT_OPACITY.tertiary }}
                  suppressHydrationWarning
                >
                  {part.label} {part.value}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
