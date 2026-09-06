'use client';

import { parseClockTime } from '@/lib/date-info';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { fitBaseSize, fitFactor, timeLineWidth } from './fit-width';
import { clockAlignmentStyle } from './alignment';
import type { ClockViewProps } from './types';

interface BarRowProps {
  label: string;
  value: number;
  max: number;
  accentColor: string;
  fontSize: number;
}

function BarRow({ label, value, max, accentColor, fontSize }: BarRowProps) {
  const progress = value / max;
  const barHeight = Math.max(6, fontSize * 0.5);
  const valueStr = String(value).padStart(2, '0');

  return (
    <div className="w-full flex items-center" style={{ gap: fontSize * 0.6 }}>
      <span
        className="uppercase tracking-widest font-light shrink-0"
        style={{
          fontSize: fontSize * 0.75,
          width: fontSize * 1.2,
          textAlign: 'right',
          color: accentColor,
          opacity: TEXT_OPACITY.tertiary,
        }}
      >
        {label}
      </span>

      <div
        className="flex-1 relative rounded-full overflow-hidden"
        style={{
          height: barHeight,
          backgroundColor: `${accentColor}1a`,
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: accentColor,
            transition: 'width 1s linear',
          }}
        />
      </div>

      <span
        className="tabular-nums font-light shrink-0"
        style={{
          fontSize: fontSize * 0.8,
          width: fontSize * 1.4,
          textAlign: 'left',
          color: accentColor,
          opacity: TEXT_OPACITY.secondary,
        }}
        suppressHydrationWarning
      >
        {valueStr}
      </span>
    </div>
  );
}

export default function ClockBarView({ config, now, scaledFontSize, autoFontSize, fitToBox, containerRef, boxWidth }: ClockViewProps) {
  const t = useTranslate('modules');
  const { hours, minutes, seconds, hStr, mStr, sStr } = parseClockTime(config.format24h, now);
  const period = config.format24h ? '' : hours >= 12 ? ` ${t('clock.pm')}` : ` ${t('clock.am')}`;
  const h12 = hours % 12;
  const hoursMax = config.format24h ? 24 : 12;

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}${period}`
    : `${hStr}:${mStr}${period}`;

  // The bars stretch to any width; only the time line above them can clip,
  // so it alone shrinks. The container's px-6 is the inset. Measured at the
  // auto size, so a Text size above 100% is applied on top (fitBaseSize).
  const fitTimeSize = fitBaseSize(scaledFontSize, autoFontSize) * 2;
  const timeFontSize = scaledFontSize * 2 * (fitToBox ? fitFactor(timeLineWidth(timeStr, fitTimeSize, 0.025), boxWidth, 48) : 1);

  const accentColor = config.accentColor || '#ffffff';
  const barFontSize = Math.max(12, scaledFontSize);
  const barGap = Math.max(10, scaledFontSize * 0.8);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col px-6"
      style={clockAlignmentStyle(config, 'column')}
    >
      {/* Digital time above bars */}
      <div
        className="tabular-nums font-light tracking-wide whitespace-nowrap mb-6"
        style={{
          fontSize: timeFontSize,
          lineHeight: 1.1,
          opacity: TEXT_OPACITY.secondary,
        }}
        suppressHydrationWarning
      >
        {timeStr}
      </div>

      {/* Progress bars */}
      <div className="flex flex-col" style={{ width: fitToBox ? '100%' : scaledFontSize * 18, maxWidth: scaledFontSize * 18, gap: barGap }}>
        <BarRow
          label={t('clock.barHoursLabel')}
          value={config.format24h ? hours : h12}
          max={hoursMax}
          accentColor={accentColor}
          fontSize={barFontSize}
        />
        <BarRow
          label={t('clock.barMinutesLabel')}
          value={minutes}
          max={60}
          accentColor={accentColor}
          fontSize={barFontSize}
        />
        {config.showSeconds && (
          <BarRow
            label={t('clock.barSecondsLabel')}
            value={seconds}
            max={60}
            accentColor={accentColor}
            fontSize={barFontSize}
          />
        )}
      </div>
    </div>
  );
}
