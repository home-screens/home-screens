'use client';

import { parseClockTime } from '@/lib/date-info';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { clockAlignmentStyle } from './alignment';
import type { ClockViewProps } from './types';

/**
 * Progress clock — SVG ring showing how far through the day we are,
 * with time and percentage centered inside the ring.
 */
export default function ClockProgressView({ config, now, scaledFontSize, fitToBox, containerRef }: ClockViewProps) {
  const t = useTranslate('modules');
  const { hours, minutes, seconds, hStr, mStr, sStr } = parseClockTime(config.format24h, now);
  const period = config.format24h ? '' : hours >= 12 ? t('clock.pm') : t('clock.am');

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}`
    : `${hStr}:${mStr}`;

  // Day progress: fraction of 24h elapsed (include seconds for smooth movement)
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const percentage = (totalSeconds / 86400) * 100;

  const accentColor = config.accentColor || '#ffffff';

  // SVG dimensions — fit within container
  const svgSize = 200;
  const center = svgSize / 2;
  const strokeWidth = 8;
  const radius = (svgSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percentage / 100);

  const timeFontSize = scaledFontSize * 1.8;
  const percentFontSize = scaledFontSize * 0.85;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex"
      style={clockAlignmentStyle(config, 'row')}
    >
      {/* Fit: a share of the box, capped. Fixed: what that cap gives in the
          registry box, in ems of the text size, and never shrunk to the box. */}
      <div
        className="relative"
        style={fitToBox
          ? { width: '70%', maxWidth: 280, aspectRatio: '1' }
          : { width: scaledFontSize * 17.5, aspectRatio: '1', flexShrink: 0 }}
      >
        {/* SVG Ring */}
        <svg
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="w-full h-full"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            opacity={0.1}
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              transition: 'stroke-dashoffset 1s ease',
              filter: `drop-shadow(0 0 4px ${accentColor}40)`,
            }}
          />
        </svg>

        {/* Center content */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <div
            className="tabular-nums font-light tracking-wide"
            style={{ fontSize: timeFontSize, lineHeight: 1 }}
            suppressHydrationWarning
          >
            {timeStr}
          </div>
          {period && (
            <div
              className="uppercase tracking-widest font-light"
              style={{ fontSize: scaledFontSize * 0.55, marginTop: 2, opacity: TEXT_OPACITY.tertiary }}
              suppressHydrationWarning
            >
              {period}
            </div>
          )}
          <div
            className="tabular-nums font-light"
            style={{
              fontSize: percentFontSize,
              marginTop: scaledFontSize * 0.3,
              color: accentColor,
              opacity: TEXT_OPACITY.dim,
            }}
            suppressHydrationWarning
          >
            {percentage.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
