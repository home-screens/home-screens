'use client';

import { parseClockTime, getDateInfoValues } from '@/lib/date-info';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ClockViewProps } from './types';

export default function ClockClassicView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { hStr, mStr, sStr, hours } = parseClockTime(config.format24h, now);
  const ampm = config.format24h ? '' : hours >= 12 ? t('clock.pm') : t('clock.am');

  const dateStr = config.showDate
    ? formatDateSync(now, config.dateFormat || 'EEEE, MMMM d', { locale })
    : null;

  // Inline localized version of `buildInfoParts` — the helper in
  // `src/lib/date-info.ts` is out of scope for Task 2 and still hard-codes
  // English labels. The views in scope build their own translated label here.
  const { weekNumber, dayOfYear } = getDateInfoValues(now);
  const infoParts: string[] = [];
  if (config.showWeekNumber) infoParts.push(`${t('clock.weekShort')} ${weekNumber}`);
  if (config.showDayOfYear) infoParts.push(`${t('clock.dayShort')} ${dayOfYear}`);
  const infoStr = infoParts.length > 0 ? infoParts.join(' · ') : null;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <style>{`
        @keyframes clock-colon-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .clock-colon-pulse {
          animation: clock-colon-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <div
        className="font-light tracking-wide tabular-nums"
        style={{ fontSize: scaledFontSize * 3, lineHeight: 1.1 }}
        suppressHydrationWarning
      >
        {config.showSeconds ? (
          <>
            {hStr}
            <span className="clock-colon-pulse">:</span>
            {mStr}
            <span className="clock-colon-pulse">:</span>
            {sStr}
            {ampm && <span style={{ fontSize: '0.4em', marginLeft: '0.15em', opacity: TEXT_OPACITY.dim }}> {ampm}</span>}
          </>
        ) : (
          <>
            {hStr}
            <span className="clock-colon-pulse">:</span>
            {mStr}
            {ampm && <span style={{ fontSize: '0.4em', marginLeft: '0.15em', opacity: TEXT_OPACITY.dim }}> {ampm}</span>}
          </>
        )}
      </div>

      {dateStr && (
        <div
          className="mt-2 tracking-wide"
          style={{ fontSize: scaledFontSize * 1.125, opacity: TEXT_OPACITY.secondary }}
          suppressHydrationWarning
        >
          {dateStr}
        </div>
      )}

      {infoStr && (
        <div
          className="mt-1 tracking-wider uppercase"
          style={{ fontSize: scaledFontSize * 0.85, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoStr}
        </div>
      )}
    </div>
  );
}
