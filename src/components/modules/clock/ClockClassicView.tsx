'use client';

import { parseClockTime, getDateInfoValues } from '@/lib/date-info';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { fitBaseSize, fitFactor, timeLineWidth } from './fit-width';
import { clockAlignmentStyle } from './alignment';
import { noWrap } from './fixed-size';
import { clockDatePattern } from './date-pattern';
import { COLON_PULSE_ANIMATION, COLON_PULSE_KEYFRAMES } from './colon-pulse';
import type { ClockViewProps } from './types';

export default function ClockClassicView({ config, now, time, scaledFontSize, autoFontSize, fitToBox, containerRef, boxWidth }: ClockViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { hStr, mStr, sStr, hours } = parseClockTime(config.format24h, time);
  const ampm = config.format24h ? '' : hours >= 12 ? t('clock.pm') : t('clock.am');

  const dateStr = config.showDate
    ? formatDateSync(now, clockDatePattern(config.dateFormat, locale), { locale })
    : null;

  // Inline localized version of buildInfoParts: date-info.ts still hard-codes
  // English labels, so this view builds its own translated label.
  const { weekNumber, dayOfYear } = getDateInfoValues(now);
  const infoParts: string[] = [];
  if (config.showWeekNumber) infoParts.push(`${t('clock.weekShort')} ${weekNumber}`);
  if (config.showDayOfYear) infoParts.push(`${t('clock.dayShort')} ${dayOfYear}`);
  const infoStr = infoParts.length > 0 ? infoParts.join(' · ') : null;

  // Shrink everything together when the box is narrower than the time line;
  // the height-derived size stays the ceiling. Measured at the auto size, so
  // a Text size above 100% is applied on top and may overflow (fitBaseSize).
  const timeStr = config.showSeconds ? `${hStr}:${mStr}:${sStr}` : `${hStr}:${mStr}`;
  const fitBase = fitBaseSize(scaledFontSize, autoFontSize);
  const factor = !fitToBox ? 1 : fitFactor(
    timeLineWidth(timeStr, fitBase * 3, 0.025, ampm ? { text: ampm, scale: 0.4, marginEm: 0.15 } : null),
    boxWidth,
  );
  const s = scaledFontSize * factor;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col"
      style={clockAlignmentStyle(config, 'column')}
    >
      <style>{`
        ${COLON_PULSE_KEYFRAMES}
        .clock-colon-pulse {
          animation: ${COLON_PULSE_ANIMATION};
        }
      `}</style>

      <div
        className="font-light tracking-wide tabular-nums whitespace-nowrap"
        style={{ fontSize: s * 3, lineHeight: 1.1 }}
        suppressHydrationWarning
      >
        {config.showSeconds ? (
          <>
            {hStr}
            <span className="clock-colon-pulse">:</span>
            {mStr}
            <span className="clock-colon-pulse">:</span>
            {sStr}
            {ampm && <span suppressHydrationWarning style={{ fontSize: '0.4em', marginLeft: '0.15em', opacity: TEXT_OPACITY.dim }}> {ampm}</span>}
          </>
        ) : (
          <>
            {hStr}
            <span className="clock-colon-pulse">:</span>
            {mStr}
            {ampm && <span suppressHydrationWarning style={{ fontSize: '0.4em', marginLeft: '0.15em', opacity: TEXT_OPACITY.dim }}> {ampm}</span>}
          </>
        )}
      </div>

      {dateStr && (
        <div
          className="mt-2 tracking-wide"
          style={{ ...noWrap(fitToBox), fontSize: s * 1.125, opacity: TEXT_OPACITY.secondary }}
          suppressHydrationWarning
        >
          {dateStr}
        </div>
      )}

      {infoStr && (
        <div
          className="mt-1 tracking-wider uppercase"
          style={{ ...noWrap(fitToBox), fontSize: s * 0.85, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoStr}
        </div>
      )}
    </div>
  );
}
