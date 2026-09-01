'use client';

import { parseClockTime } from '@/lib/date-info';
import type { ClockViewProps } from './types';

// Seven-segment digit map: [top, topRight, bottomRight, bottom, bottomLeft, topLeft, middle]
const SEGMENT_MAP: Record<string, boolean[]> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
};

function Segment({ active, color, style }: { active: boolean; color: string; style: React.CSSProperties }) {
  return (
    <div
      style={{
        ...style,
        background: active ? color : 'rgba(255, 255, 255, 0.05)',
        boxShadow: active
          ? `0 0 8px ${color}80, 0 0 20px ${color}40`
          : 'none',
        borderRadius: 2,
        transition: 'opacity 0.15s ease',
      }}
    />
  );
}

function SevenSegmentDigit({ digit, size, color }: { digit: string; size: number; color: string }) {
  const segments = SEGMENT_MAP[digit] || SEGMENT_MAP['0'];

  const w = size * 0.6;
  const h = size;
  const t = Math.max(size * 0.08, 3); // segment thickness
  const gap = t * 0.4;
  const segLen = w - gap * 2 - t;
  const vSegLen = (h - t * 3) / 2 - gap;

  // Segment positions: [top, topRight, bottomRight, bottom, bottomLeft, topLeft, middle]
  const segmentStyles: React.CSSProperties[] = [
    // top (horizontal)
    { position: 'absolute', left: gap + t / 2, top: 0, width: segLen, height: t },
    // top-right (vertical)
    { position: 'absolute', right: 0, top: gap + t / 2, width: t, height: vSegLen },
    // bottom-right (vertical)
    { position: 'absolute', right: 0, top: h / 2 + gap / 2, width: t, height: vSegLen },
    // bottom (horizontal)
    { position: 'absolute', left: gap + t / 2, bottom: 0, width: segLen, height: t },
    // bottom-left (vertical)
    { position: 'absolute', left: 0, top: h / 2 + gap / 2, width: t, height: vSegLen },
    // top-left (vertical)
    { position: 'absolute', left: 0, top: gap + t / 2, width: t, height: vSegLen },
    // middle (horizontal)
    { position: 'absolute', left: gap + t / 2, top: (h - t) / 2, width: segLen, height: t },
  ];

  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      {segments.map((active, i) => (
        <Segment key={i} active={active} color={color} style={segmentStyles[i]} />
      ))}
    </div>
  );
}

function Colon({ size, color }: { size: number; color: string }) {
  const dotSize = Math.max(size * 0.1, 4);

  return (
    <div
      className="clock-digital-colon flex flex-col items-center justify-center gap-1"
      style={{ width: size * 0.25, height: size }}
    >
      <style>{`
        @keyframes digital-colon-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .clock-digital-colon {
          animation: digital-colon-pulse 2s ease-in-out infinite;
        }
      `}</style>
      <div
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: 1,
          background: color,
          boxShadow: `0 0 8px ${color}80`,
          marginTop: size * 0.2,
        }}
      />
      <div
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: 1,
          background: color,
          boxShadow: `0 0 8px ${color}80`,
          marginBottom: size * 0.2,
        }}
      />
    </div>
  );
}

export default function ClockDigitalView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { h, mStr, sStr } = parseClockTime(config.format24h, now);
  // Seven-segment display always needs 2-digit hours
  const hStr = String(h).padStart(2, '0');

  const color = config.accentColor || '#22d3ee';
  const digitSize = scaledFontSize * 3.2;

  const digits = config.showSeconds
    ? [hStr[0], hStr[1], ':', mStr[0], mStr[1], ':', sStr[0], sStr[1]]
    : [hStr[0], hStr[1], ':', mStr[0], mStr[1]];

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
    >
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px)',
          zIndex: 1,
        }}
      />

      <div className="flex items-center gap-1" style={{ position: 'relative', zIndex: 2 }}>
        {digits.map((char, i) =>
          char === ':' ? (
            <Colon key={`colon-${i}`} size={digitSize} color={color} />
          ) : (
            <div key={`digit-${i}`} suppressHydrationWarning>
              <SevenSegmentDigit digit={char} size={digitSize} color={color} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
