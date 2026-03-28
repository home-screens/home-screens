'use client';

import { parseClockTime } from '@/lib/date-info';
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
        className="uppercase tracking-widest opacity-40 font-light shrink-0"
        style={{
          fontSize: fontSize * 0.75,
          width: fontSize * 1.2,
          textAlign: 'right',
          color: accentColor,
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
        className="tabular-nums font-light opacity-60 shrink-0"
        style={{
          fontSize: fontSize * 0.8,
          width: fontSize * 1.4,
          textAlign: 'left',
          color: accentColor,
        }}
        suppressHydrationWarning
      >
        {valueStr}
      </span>
    </div>
  );
}

export default function ClockBarView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { hours, minutes, seconds, hStr, mStr, sStr, period } = parseClockTime(config.format24h, now);
  const h12 = hours % 12;
  const hoursMax = config.format24h ? 24 : 12;

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}${period}`
    : `${hStr}:${mStr}${period}`;

  const accentColor = config.accentColor || '#ffffff';
  const barFontSize = Math.max(12, scaledFontSize);
  const barGap = Math.max(10, scaledFontSize * 0.8);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center px-6"
    >
      {/* Digital time above bars */}
      <div
        className="tabular-nums font-light tracking-wide mb-6"
        style={{
          fontSize: scaledFontSize * 2,
          lineHeight: 1.1,
          opacity: 0.7,
        }}
        suppressHydrationWarning
      >
        {timeStr}
      </div>

      {/* Progress bars */}
      <div className="w-full flex flex-col" style={{ gap: barGap, maxWidth: scaledFontSize * 18 }}>
        <BarRow
          label="H"
          value={config.format24h ? hours : h12}
          max={hoursMax}
          accentColor={accentColor}
          fontSize={barFontSize}
        />
        <BarRow
          label="M"
          value={minutes}
          max={60}
          accentColor={accentColor}
          fontSize={barFontSize}
        />
        {config.showSeconds && (
          <BarRow
            label="S"
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
