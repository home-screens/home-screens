'use client';

import { format } from 'date-fns';
import { buildInfoParts } from '@/lib/date-info';
import { TEXT_OPACITY } from '@/lib/constants';
import type { DateViewProps } from './types';

export default function DateMinimalView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const dateFormat = config.dateFormat || 'MMMM d';
  let dateStr: string;
  try {
    dateStr = format(now, dateFormat);
  } catch {
    dateStr = format(now, 'MMMM d');
  }

  const infoParts = buildInfoParts(config, now);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div
        className="tracking-wide"
        style={{ fontSize: scaledFontSize * 2 }}
        suppressHydrationWarning
      >
        {dateStr}
      </div>

      {infoParts.length > 0 && (
        <div
          className="mt-2 tracking-wider uppercase"
          style={{ fontSize: scaledFontSize * 0.8, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoParts.join(' \u00b7 ')}
        </div>
      )}
    </div>
  );
}
