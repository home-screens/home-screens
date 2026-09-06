'use client';

import { parseClockTime } from '@/lib/date-info';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { clockAlignmentStyle } from './alignment';
import type { ClockViewProps } from './types';

/**
 * Vertical clock — each digit of the time stacked on its own line.
 * Tall, narrow, architectural feel. Works beautifully in sidebar layouts.
 *
 * Sizes itself to fit the container rather than scaling with scaledFontSize,
 * since the content is inherently vertical and needs to fill available height.
 */
export default function ClockVerticalView({ config, now, scaledFontSize, fitToBox, containerRef, boxHeight }: ClockViewProps) {
  const t = useTranslate('modules');
  const { h, mStr, sStr, hours } = parseClockTime(config.format24h, now);
  // Vertical digits always need 2-digit hours
  const hStr = String(h).padStart(2, '0');
  const period = config.format24h ? '' : hours >= 12 ? t('clock.pm') : t('clock.am');

  const showSeconds = config.showSeconds ?? true;
  const digitCount = showSeconds ? 6 : 4;
  const separatorCount = showSeconds ? 2 : 1;
  // Each separator is roughly 0.4 digit-heights
  const totalSlots = digitCount + separatorCount * 0.4;

  // The module measures the root for us; 300 stands in until it has.
  const containerHeight = boxHeight > 0 ? boxHeight : 300;

  // Size digits to fit container with some breathing room; a fixed-size
  // clock sizes them off Text size instead (about what the fit gives in the
  // registry box) and ignores the height.
  const digitSize = fitToBox
    ? Math.floor((containerHeight * 0.85) / (totalSlots * 1.0))
    : scaledFontSize * 2.1;
  const dotSize = Math.max(3, digitSize * 0.08);
  const dotGap = dotSize * 1.2;

  const groups: string[][] = [
    [hStr[0], hStr[1]],
    [mStr[0], mStr[1]],
  ];
  if (showSeconds) {
    groups.push([sStr[0], sStr[1]]);
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col"
      style={clockAlignmentStyle(config, 'column')}
    >
      <div className="flex flex-col items-center" style={{ gap: 0 }}>
        {groups.map((digits, gi) => (
          <div key={gi} className="flex flex-col items-center">
            {gi > 0 && (
              <div
                className="flex flex-col items-center"
                style={{
                  gap: dotGap,
                  paddingTop: dotGap * 1.5,
                  paddingBottom: dotGap * 1.5,
                }}
              >
                <div
                  className="rounded-full opacity-30"
                  style={{ width: dotSize, height: dotSize, backgroundColor: 'currentColor' }}
                />
                <div
                  className="rounded-full opacity-30"
                  style={{ width: dotSize, height: dotSize, backgroundColor: 'currentColor' }}
                />
              </div>
            )}

            {digits.map((digit, di) => (
              <div
                key={di}
                className="tabular-nums font-extralight text-center"
                style={{
                  fontSize: digitSize,
                  lineHeight: 0.95,
                  letterSpacing: '0.02em',
                }}
                suppressHydrationWarning
              >
                {digit}
              </div>
            ))}
          </div>
        ))}
      </div>

      {period && (
        <div
          className="uppercase tracking-widest font-light"
          style={{
            fontSize: digitSize * 0.22,
            marginTop: digitSize * 0.15,
            opacity: TEXT_OPACITY.tertiary,
          }}
          suppressHydrationWarning
        >
          {period}
        </div>
      )}
    </div>
  );
}
