'use client';

import { format } from 'date-fns';
import { parseClockTime, buildInfoParts } from '@/lib/date-info';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ClockViewProps } from './types';

export default function ClockClassicView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { hStr, mStr, sStr, period: ampm } = parseClockTime(config.format24h, now);

  const dateStr = config.showDate ? format(now, config.dateFormat || 'EEEE, MMMM d') : null;

  const infoParts = buildInfoParts(config, now);
  const infoStr = infoParts.length > 0 ? infoParts.join(' \u00b7 ') : null;

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
            {ampm && <span style={{ fontSize: '0.4em', marginLeft: '0.15em', opacity: TEXT_OPACITY.dim }}>{ampm}</span>}
          </>
        ) : (
          <>
            {hStr}
            <span className="clock-colon-pulse">:</span>
            {mStr}
            {ampm && <span style={{ fontSize: '0.4em', marginLeft: '0.15em', opacity: TEXT_OPACITY.dim }}>{ampm}</span>}
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
