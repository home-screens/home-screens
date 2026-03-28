'use client';

import { useId, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { parseClockTime } from '@/lib/date-info';
import type { ClockViewProps } from './types';

export default function ClockArcView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const id = useId();
  const arcGradientId = `arc-gradient-${id}`;
  const sunGlowId = `sun-glow-${id}`;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { hours, minutes, hStr, mStr, sStr, period } = parseClockTime(config.format24h, now);

  const totalMinutes = hours * 60 + minutes;
  const dayStart = 6 * 60;  // 6:00 AM
  const dayEnd = 18 * 60;   // 6:00 PM
  const daySpan = dayEnd - dayStart;

  const rawProgress = (totalMinutes - dayStart) / daySpan;
  const isDaytime = rawProgress >= 0 && rawProgress <= 1;
  const progress = Math.max(0, Math.min(1, rawProgress));

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}${period}`
    : `${hStr}:${mStr}${period}`;

  const dateStr = config.showDate ? format(now, config.dateFormat || 'EEEE, MMMM d') : null;

  const svgWidth = Math.max(200, scaledFontSize * 16);
  const svgHeight = svgWidth * 0.55;
  const padding = svgWidth * 0.06;
  const arcCenterX = svgWidth / 2;
  const arcCenterY = svgHeight - padding * 0.5;
  const arcRadius = svgWidth / 2 - padding;

  // Arc from left (pi) to right (0) — semicircle
  const startAngle = Math.PI;
  const endAngle = 0;
  const sunAngle = startAngle + (endAngle - startAngle) * progress;
  const sunX = arcCenterX + arcRadius * Math.cos(sunAngle);
  const sunY = arcCenterY - arcRadius * Math.abs(Math.sin(sunAngle));

  const arcStartX = arcCenterX + arcRadius * Math.cos(startAngle);
  const arcStartY = arcCenterY - arcRadius * Math.abs(Math.sin(startAngle));
  const arcEndX = arcCenterX + arcRadius * Math.cos(endAngle);
  const arcEndY = arcCenterY - arcRadius * Math.abs(Math.sin(endAngle));

  const accentColor = config.accentColor || '#ffffff';
  const sunColor = '#f59e0b';
  const sunRadius = Math.max(6, scaledFontSize * 0.45);
  const labelSize = Math.max(10, scaledFontSize * 0.65);

  // Night indicator: sun sits at the nearest edge
  const isBeforeDawn = totalMinutes < dayStart;
  const isAfterDusk = totalMinutes > dayEnd;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div style={{ width: svgWidth }}>
        {mounted && <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id={arcGradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fb923c" stopOpacity="0.6" />
              <stop offset="30%" stopColor={accentColor} stopOpacity="0.25" />
              <stop offset="70%" stopColor={accentColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor="#fb923c" stopOpacity="0.6" />
            </linearGradient>
            <radialGradient id={sunGlowId}>
              <stop offset="0%" stopColor={sunColor} stopOpacity="0.8" />
              <stop offset="50%" stopColor={sunColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={sunColor} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Arc track */}
          <path
            d={`M ${arcStartX} ${arcStartY} A ${arcRadius} ${arcRadius} 0 0 1 ${arcEndX} ${arcEndY}`}
            fill="none"
            stroke={`url(#${arcGradientId})`}
            strokeWidth={2.5}
            strokeLinecap="round"
          />

          {/* Horizon line */}
          <line
            x1={arcStartX}
            y1={arcCenterY}
            x2={arcEndX}
            y2={arcCenterY}
            stroke={accentColor}
            strokeOpacity={0.1}
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {/* Dawn endpoint */}
          <circle cx={arcStartX} cy={arcStartY} r={3} fill="#fb923c" opacity={0.7} />
          {/* Dusk endpoint */}
          <circle cx={arcEndX} cy={arcEndY} r={3} fill="#fb923c" opacity={0.7} />

          {/* Sun glow */}
          {isDaytime && (
            <circle
              cx={sunX}
              cy={sunY}
              r={sunRadius * 3}
              fill={`url(#${sunGlowId})`}
            />
          )}

          {/* Sun dot */}
          <circle
            cx={isDaytime ? sunX : isBeforeDawn ? arcStartX : arcEndX}
            cy={isDaytime ? sunY : arcCenterY}
            r={sunRadius}
            fill={sunColor}
            opacity={isDaytime ? 1 : 0.35}
          >
            {isDaytime && (
              <animate
                attributeName="r"
                values={`${sunRadius};${sunRadius * 1.15};${sunRadius}`}
                dur="3s"
                repeatCount="indefinite"
              />
            )}
          </circle>

          {/* Labels */}
          <text
            x={arcStartX}
            y={arcCenterY + labelSize + 6}
            textAnchor="middle"
            fill={accentColor}
            opacity={0.4}
            fontSize={labelSize}
            fontFamily="system-ui, sans-serif"
          >
            6 AM
          </text>
          <text
            x={arcEndX}
            y={arcCenterY + labelSize + 6}
            textAnchor="middle"
            fill={accentColor}
            opacity={0.4}
            fontSize={labelSize}
            fontFamily="system-ui, sans-serif"
          >
            6 PM
          </text>

          {/* Night indicator */}
          {!isDaytime && (
            <text
              x={arcCenterX}
              y={arcCenterY - arcRadius * 0.35}
              textAnchor="middle"
              fill={accentColor}
              opacity={0.25}
              fontSize={labelSize * 0.9}
              fontFamily="system-ui, sans-serif"
            >
              {isBeforeDawn ? 'before dawn' : isAfterDusk ? 'after dusk' : ''}
            </text>
          )}
        </svg>}

        {/* Digital time */}
        <div
          className="text-center mt-3 tabular-nums font-light tracking-wide"
          style={{ fontSize: scaledFontSize * 2.2, lineHeight: 1.1 }}
          suppressHydrationWarning
        >
          {timeStr}
        </div>

        {dateStr && (
          <div
            className="text-center opacity-50 mt-1 tracking-wide"
            style={{ fontSize: scaledFontSize * 0.9 }}
            suppressHydrationWarning
          >
            {dateStr}
          </div>
        )}
      </div>
    </div>
  );
}
