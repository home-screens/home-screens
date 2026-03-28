'use client';

import { parseClockTime } from '@/lib/date-info';
import type { ClockViewProps } from './types';

export default function ClockAnalogView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const { hours, minutes, seconds } = parseClockTime(config.format24h, now);

  const hourAngle = ((hours % 12) + minutes / 60) * 30;
  const minuteAngle = (minutes + seconds / 60) * 6;
  const secondAngle = seconds * 6;

  const accent = config.accentColor || '#ef4444';
  const size = scaledFontSize * 12;
  const cx = 100;
  const cy = 100;
  const radius = 90;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center"
    >
      <svg
        viewBox="0 0 200 200"
        style={{ width: size, height: size }}
        suppressHydrationWarning
      >
        {/* Face */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {/* Minute markers (every 5 minutes) */}
        {Array.from({ length: 60 }).map((_, i) => {
          if (i % 5 === 0) return null;
          const angle = (i * 6 - 90) * (Math.PI / 180);
          const mx = cx + Math.cos(angle) * (radius - 4);
          const my = cy + Math.sin(angle) * (radius - 4);
          return (
            <circle
              key={`min-${i}`}
              cx={mx}
              cy={my}
              r={0.5}
              fill="rgba(255,255,255,0.15)"
            />
          );
        })}

        {/* Hour markers */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const outerR = radius - 2;
          const innerR = radius - 10;

          if (config.showNumerals) {
            const textR = radius - 16;
            const tx = cx + Math.cos(angle) * textR;
            const ty = cy + Math.sin(angle) * textR;
            return (
              <text
                key={`hour-${i}`}
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="central"
                fill="rgba(255,255,255,0.6)"
                fontSize="8"
                fontWeight="300"
                fontFamily="system-ui, sans-serif"
              >
                {i === 0 ? 12 : i}
              </text>
            );
          }

          const x1 = cx + Math.cos(angle) * innerR;
          const y1 = cy + Math.sin(angle) * innerR;
          const x2 = cx + Math.cos(angle) * outerR;
          const y2 = cy + Math.sin(angle) * outerR;
          return (
            <line
              key={`hour-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={i % 3 === 0 ? 1.5 : 0.8}
              strokeLinecap="round"
            />
          );
        })}

        {/* Hour hand - shorter, wider, tapered */}
        <g transform={`rotate(${hourAngle} ${cx} ${cy})`} suppressHydrationWarning>
          <polygon
            points={`${cx - 3},${cy + 8} ${cx + 3},${cy + 8} ${cx + 1},${cy - 50} ${cx - 1},${cy - 50}`}
            fill="rgba(255,255,255,0.9)"
          />
        </g>

        {/* Minute hand - longer, thinner, tapered */}
        <g transform={`rotate(${minuteAngle} ${cx} ${cy})`} suppressHydrationWarning>
          <polygon
            points={`${cx - 2},${cy + 10} ${cx + 2},${cy + 10} ${cx + 0.6},${cy - 72} ${cx - 0.6},${cy - 72}`}
            fill="rgba(255,255,255,0.85)"
          />
        </g>

        {/* Second hand */}
        {config.showSeconds && (
          <g
            transform={`rotate(${secondAngle} ${cx} ${cy})`}
            suppressHydrationWarning
          >
            <line
              x1={cx}
              y1={cy + 14}
              x2={cx}
              y2={cy - 78}
              stroke={accent}
              strokeWidth="1"
              strokeLinecap="round"
            />
            {/* Counterweight */}
            <circle cx={cx} cy={cy + 10} r={2} fill={accent} />
          </g>
        )}

        {/* Center cap */}
        <circle cx={cx} cy={cy} r={3.5} fill={accent} />
        <circle cx={cx} cy={cy} r={1.5} fill="rgba(0,0,0,0.5)" />
      </svg>
    </div>
  );
}
