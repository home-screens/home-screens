'use client';

import { parseClockTime } from '@/lib/date-info';
import type { ClockViewProps } from './types';

/**
 * BCD (Binary-Coded Decimal) clock — each decimal digit of hours, minutes,
 * and seconds is rendered as a column of binary dots.
 *
 * Column bit counts are optimised for the value range of each digit:
 *   - Hours tens: 2 bits (0-2)
 *   - Hours ones: 4 bits (0-9)
 *   - Minutes/seconds tens: 3 bits (0-5)
 *   - Minutes/seconds ones: 4 bits (0-9)
 */

function digitToBits(value: number, bitCount: number): boolean[] {
  const bits: boolean[] = [];
  for (let i = bitCount - 1; i >= 0; i--) {
    bits.push((value & (1 << i)) !== 0);
  }
  return bits;
}

interface DotColumnProps {
  bits: boolean[];
  accentColor: string;
  dotSize: number;
  gap: number;
  maxBits: number;
}

function DotColumn({ bits, accentColor, dotSize, gap, maxBits }: DotColumnProps) {
  // Top-align within the max column height by padding with empty space
  const topPadding = (maxBits - bits.length) * (dotSize + gap);

  return (
    <div
      className="flex flex-col items-center"
      style={{ gap, paddingTop: topPadding }}
    >
      {bits.map((active, i) => (
        <div
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            backgroundColor: accentColor,
            opacity: active ? 1 : 0.15,
            boxShadow: active ? `0 0 ${dotSize * 0.6}px ${accentColor}` : 'none',
            transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

export default function ClockBinaryView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { minutes, seconds, h } = parseClockTime(config.format24h, now);

  const dotSize = Math.max(12, scaledFontSize * 0.85);
  const gap = dotSize * 0.45;
  const columnGap = dotSize * 0.5;
  const groupGap = dotSize * 1.6;
  const maxBits = 4;
  const labelSize = Math.max(10, scaledFontSize * 0.7);

  const groups: { label: string; columns: { bits: boolean[]; bitCount: number }[] }[] = [
    {
      label: 'H',
      columns: [
        { bits: digitToBits(Math.floor(h / 10), 2), bitCount: 2 },
        { bits: digitToBits(h % 10, 4), bitCount: 4 },
      ],
    },
    {
      label: 'M',
      columns: [
        { bits: digitToBits(Math.floor(minutes / 10), 3), bitCount: 3 },
        { bits: digitToBits(minutes % 10, 4), bitCount: 4 },
      ],
    },
  ];

  if (config.showSeconds) {
    groups.push({
      label: 'S',
      columns: [
        { bits: digitToBits(Math.floor(seconds / 10), 3), bitCount: 3 },
        { bits: digitToBits(seconds % 10, 4), bitCount: 4 },
      ],
    });
  }

  const accentColor = config.accentColor || '#ffffff';

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div className="flex items-end" style={{ gap: groupGap }}>
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col items-center">
            <div className="flex" style={{ gap: columnGap }}>
              {group.columns.map((col, ci) => (
                <DotColumn
                  key={ci}
                  bits={col.bits}
                  accentColor={accentColor}
                  dotSize={dotSize}
                  gap={gap}
                  maxBits={maxBits}
                />
              ))}
            </div>
            <span
              className="uppercase tracking-widest opacity-40 font-light"
              style={{
                fontSize: labelSize,
                marginTop: gap * 1.5,
                color: accentColor,
              }}
              suppressHydrationWarning
            >
              {group.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
