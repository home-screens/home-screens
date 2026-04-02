'use client';

import { memo } from 'react';
import { format } from 'date-fns';
import { isDotActive, DOT_COLS, DOT_ROWS } from './dot-matrix-font';
import { parseClockTime, buildInfoParts } from '@/lib/date-info';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ClockViewProps } from './types';

const DotCharacter = memo(function DotCharacter({
  char,
  dotSize,
  dotGap,
  accentColor,
}: {
  char: string;
  dotSize: number;
  dotGap: number;
  accentColor: string;
}) {
  return (
    <div
      className="inline-grid"
      style={{
        gridTemplateColumns: `repeat(${DOT_COLS}, ${dotSize}px)`,
        gridTemplateRows: `repeat(${DOT_ROWS}, ${dotSize}px)`,
        gap: dotGap,
      }}
    >
      {Array.from({ length: DOT_ROWS }, (_, row) =>
        Array.from({ length: DOT_COLS }, (_, col) => {
          const active = isDotActive(char, row, col);
          return (
            <div
              key={`${row}-${col}`}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: '50%',
                backgroundColor: active ? accentColor : 'rgba(255,255,255,0.08)',
                boxShadow: active
                  ? `0 0 ${dotSize * 0.5}px ${accentColor}, 0 0 ${dotSize * 1.2}px ${accentColor}40`
                  : 'none',
                transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
              }}
            />
          );
        })
      )}
    </div>
  );
});

export default function ClockDotMatrixView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { h, mStr, sStr } = parseClockTime(config.format24h, now);
  // Dot-matrix needs space-padded hours in 12h mode for consistent grid layout
  const hStr = config.format24h ? String(h).padStart(2, '0') : String(h).padStart(2, ' ');

  const timeChars = config.showSeconds
    ? [...hStr, ':', ...mStr, ':', ...sStr]
    : [...hStr, ':', ...mStr];

  const accentColor = config.accentColor || '#ffffff';
  const dotSize = Math.max(3, scaledFontSize * 0.28);
  const dotGap = Math.max(1, dotSize * 0.3);
  const charGap = dotGap * 3;
  const colonGap = dotGap * 1.5;

  const dateStr = config.showDate ? format(now, config.dateFormat || 'EEEE, MMMM d') : null;

  const infoParts = buildInfoParts(config, now);
  const infoStr = infoParts.length > 0 ? infoParts.join(' \u00b7 ') : null;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div
        className="flex items-center"
        style={{ gap: 0 }}
        suppressHydrationWarning
      >
        {timeChars.map((char, i) => (
          <div
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : char === ':' || timeChars[i - 1] === ':' ? colonGap : charGap,
            }}
          >
            <DotCharacter
              char={char}
              dotSize={dotSize}
              dotGap={dotGap}
              accentColor={accentColor}
            />
          </div>
        ))}
      </div>

      {dateStr && (
        <div
          className="tracking-wide mt-4"
          style={{ fontSize: scaledFontSize * 0.9, color: accentColor, opacity: TEXT_OPACITY.dim }}
          suppressHydrationWarning
        >
          {dateStr}
        </div>
      )}

      {infoStr && (
        <div
          className="tracking-wider uppercase mt-1"
          style={{ fontSize: scaledFontSize * 0.7, color: accentColor, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoStr}
        </div>
      )}
    </div>
  );
}
