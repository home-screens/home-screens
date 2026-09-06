'use client';

import { parseClockTime, getDateInfoValues } from '@/lib/date-info';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { fitBaseSize, fitFactor, splitRowWidth } from './fit-width';
import { clockAlignmentStyle } from './alignment';
import { noWrap, noShrink } from './fixed-size';
import type { ClockViewProps } from './types';

/**
 * Split clock — time on the left, date and info on the right,
 * separated by a hairline vertical divider.
 */
export default function ClockSplitView({ config, now, scaledFontSize, autoFontSize, fitToBox, containerRef, boxWidth }: ClockViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { hStr, mStr, sStr, hours } = parseClockTime(config.format24h, now);
  const ampm = config.format24h ? '' : hours >= 12 ? t('clock.pm') : t('clock.am');

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}`
    : `${hStr}:${mStr}`;

  const dateStr = config.showDate
    ? formatDateSync(now, config.dateFormat || 'EEEE, MMMM d', { locale })
    : null;

  const { weekNumber, dayOfYear } = getDateInfoValues(now);

  const infoParts: { label: string; value: string }[] = [];
  if (config.showWeekNumber) infoParts.push({ label: t('clock.weekShort'), value: String(weekNumber) });
  if (config.showDayOfYear) infoParts.push({ label: t('clock.dayShort'), value: String(dayOfYear) });

  // Shrink the whole row together when the box is narrower than time,
  // divider and date side by side; the height-derived size stays the ceiling.
  // Measured at the auto size, so a Text size above 100% is applied on top
  // and may overflow (fitBaseSize).
  const fitBase = fitBaseSize(scaledFontSize, autoFontSize);
  const factor = !fitToBox ? 1 : fitFactor(
    splitRowWidth(
      { text: timeStr, fontSize: fitBase * 2.8, letterSpacingEm: 0.025 },
      fitBase * 1.4,
      [
        ...(dateStr ? [{ text: dateStr, fontSize: fitBase * 1.0 }] : []),
        ...infoParts.map((part) => ({
          text: `${part.label} ${part.value}`.toUpperCase(),
          fontSize: fitBase * 0.8,
          letterSpacingEm: 0.025,
        })),
      ],
    ),
    boxWidth,
  );
  const s = scaledFontSize * factor;

  const timeFontSize = s * 2.8;
  const dateFontSize = s * 1.0;
  const infoFontSize = s * 0.8;
  const dividerHeight = timeFontSize * 1.1;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex"
      style={clockAlignmentStyle(config, 'row')}
    >
      <div className="flex items-center" style={{ gap: s * 1.4, ...noShrink(fitToBox) }}>
        {/* Left: Time */}
        <div className="flex flex-col items-end">
          <div
            className="tabular-nums font-light tracking-wide whitespace-nowrap"
            style={{ fontSize: timeFontSize, lineHeight: 1 }}
            suppressHydrationWarning
          >
            {timeStr}
          </div>
          {ampm && (
            <div
              className="uppercase tracking-widest font-light"
              style={{ fontSize: s * 0.7, marginTop: 2, opacity: TEXT_OPACITY.tertiary }}
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
        <div className="flex flex-col justify-center" style={{ gap: s * 0.35 }}>
          {dateStr && (
            <div
              className="font-light"
              style={{ ...noWrap(fitToBox), fontSize: dateFontSize, lineHeight: 1.3, opacity: TEXT_OPACITY.secondary }}
              suppressHydrationWarning
            >
              {dateStr}
            </div>
          )}

          {infoParts.length > 0 && (
            <div className="flex flex-col" style={{ gap: s * 0.15 }}>
              {infoParts.map((part) => (
                <div
                  key={part.label}
                  className="tabular-nums font-light tracking-wide uppercase"
                  style={{ ...noWrap(fitToBox), fontSize: infoFontSize, lineHeight: 1.3, opacity: TEXT_OPACITY.tertiary }}
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
