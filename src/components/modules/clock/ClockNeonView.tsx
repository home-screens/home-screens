'use client';

import { parseClockTime, getDateInfoValues } from '@/lib/date-info';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { fitFactor, timeLineWidth } from './fit-width';
import type { ClockViewProps } from './types';

export default function ClockNeonView({ config, now, scaledFontSize, containerRef, boxWidth }: ClockViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { hStr, mStr, sStr, hours } = parseClockTime(config.format24h, now);
  const ampm = config.format24h ? '' : hours >= 12 ? t('clock.pm') : t('clock.am');

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}`
    : `${hStr}:${mStr}`;

  const neonColor = config.accentColor || '#ff2d55';

  const dateStr = config.showDate
    ? formatDateSync(now, config.dateFormat || 'EEEE, MMMM d', { locale })
    : null;

  const { weekNumber, dayOfYear } = getDateInfoValues(now);
  const infoParts: string[] = [];
  if (config.showWeekNumber) infoParts.push(`${t('clock.weekShort')} ${weekNumber}`);
  if (config.showDayOfYear) infoParts.push(`${t('clock.dayShort')} ${dayOfYear}`);
  const infoStr = infoParts.length > 0 ? infoParts.join(' · ') : null;

  const neonTextShadow = [
    `0 0 7px #fff`,
    `0 0 10px #fff`,
    `0 0 21px ${neonColor}`,
    `0 0 42px ${neonColor}`,
    `0 0 82px ${neonColor}`,
    `0 0 92px ${neonColor}`,
  ].join(', ');

  // Shrink everything together when the box is narrower than the time line;
  // the height-derived size stays the ceiling.
  const factor = fitFactor(
    timeLineWidth(timeStr, scaledFontSize * 3.2, 0.08, ampm ? { text: ampm, scale: 0.35, marginEm: 0.2 } : null),
    boxWidth,
  );
  const s = scaledFontSize * factor;

  const neonDateShadow = [
    `0 0 4px #fff`,
    `0 0 10px ${neonColor}`,
    `0 0 30px ${neonColor}`,
  ].join(', ');

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div
        className="tabular-nums whitespace-nowrap"
        style={{
          fontSize: s * 3.2,
          fontWeight: 300,
          lineHeight: 1.1,
          letterSpacing: '0.08em',
          color: '#fff',
          textShadow: neonTextShadow,
        }}
        suppressHydrationWarning
      >
        {timeStr}
        {ampm && (
          <span
            suppressHydrationWarning
            style={{
              fontSize: '0.35em',
              marginLeft: '0.2em',
              opacity: TEXT_OPACITY.secondary,
            }}
          >
            {ampm}
          </span>
        )}
      </div>

      {dateStr && (
        <div
          className="mt-4 tracking-wide"
          style={{
            fontSize: s * 1,
            color: neonColor,
            textShadow: neonDateShadow,
            opacity: TEXT_OPACITY.heading,
            letterSpacing: '0.05em',
          }}
          suppressHydrationWarning
        >
          {dateStr}
        </div>
      )}

      {infoStr && (
        <div
          className="mt-1 uppercase tracking-widest"
          style={{
            fontSize: s * 0.75,
            color: neonColor,
            textShadow: `0 0 6px ${neonColor}`,
            opacity: TEXT_OPACITY.dim,
          }}
          suppressHydrationWarning
        >
          {infoStr}
        </div>
      )}
    </div>
  );
}
