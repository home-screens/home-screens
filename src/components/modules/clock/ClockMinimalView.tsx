'use client';

import { parseClockTime } from '@/lib/date-info';
import type { ClockViewProps } from './types';

export default function ClockMinimalView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { hStr, mStr } = parseClockTime(config.format24h, now);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center"
    >
      <span
        className="tabular-nums"
        style={{
          fontSize: scaledFontSize * 3.5,
          fontWeight: 100,
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}
        suppressHydrationWarning
      >
        {hStr}:{mStr}
      </span>
    </div>
  );
}
