'use client';

import { format } from 'date-fns';
import { parseClockTime, buildInfoParts } from '@/lib/date-info';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ClockViewProps } from './types';

export default function ClockNeonView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { hStr, mStr, sStr, period: ampm } = parseClockTime(config.format24h, now);

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}`
    : `${hStr}:${mStr}`;

  const neonColor = config.accentColor || '#ff2d55';

  const dateStr = config.showDate ? format(now, config.dateFormat || 'EEEE, MMMM d') : null;

  const infoParts = buildInfoParts(config, now);
  const infoStr = infoParts.length > 0 ? infoParts.join(' \u00b7 ') : null;

  const neonTextShadow = [
    `0 0 7px #fff`,
    `0 0 10px #fff`,
    `0 0 21px ${neonColor}`,
    `0 0 42px ${neonColor}`,
    `0 0 82px ${neonColor}`,
    `0 0 92px ${neonColor}`,
  ].join(', ');

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
        className="tabular-nums"
        style={{
          fontSize: scaledFontSize * 3.2,
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
            style={{
              fontSize: '0.35em',
              marginLeft: '0.2em',
              verticalAlign: 'top',
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
            fontSize: scaledFontSize * 1,
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
            fontSize: scaledFontSize * 0.75,
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
