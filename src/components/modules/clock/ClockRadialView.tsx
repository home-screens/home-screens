'use client';

import { parseClockTime } from '@/lib/date-info';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { clockAlignmentStyle } from './alignment';
import type { ClockViewProps } from './types';

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function accentShade(accentColor: string, lightnessOffset: number): string {
  const hsl = hexToHsl(accentColor);
  if (!hsl) return accentColor;
  const l = Math.min(100, Math.max(0, hsl.l + lightnessOffset));
  return `hsl(${hsl.h}, ${hsl.s}%, ${l}%)`;
}

interface ArcProps {
  radius: number;
  strokeWidth: number;
  progress: number;
  color: string;
  trackColor: string;
  size: number;
}

function Arc({ radius, strokeWidth, progress, color, trackColor, size }: ArcProps) {
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const center = size / 2;

  return (
    <>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </>
  );
}

export default function ClockRadialView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const t = useTranslate('modules');
  const { hours, minutes, seconds, hStr, mStr, sStr } = parseClockTime(config.format24h, now);
  const period = config.format24h ? '' : hours >= 12 ? t('clock.pm') : t('clock.am');

  const hoursProgress = (hours % 12) / 12;
  const minutesProgress = minutes / 60;
  const secondsProgress = seconds / 60;

  const accentColor = config.accentColor || '#ffffff';

  const svgSize = Math.max(120, scaledFontSize * 10);
  const outerStroke = 8;
  const midStroke = 6;
  const innerStroke = 4;
  const ringGap = Math.max(8, svgSize * 0.05);

  const outerRadius = svgSize / 2 - outerStroke / 2 - 2;
  const midRadius = outerRadius - outerStroke / 2 - ringGap - midStroke / 2;
  const innerRadius = midRadius - midStroke / 2 - ringGap - innerStroke / 2;

  const outerColor = accentColor;
  const midColor = accentShade(accentColor, 10);
  const innerColor = accentShade(accentColor, 20);
  const trackColor = `${accentColor}1a`;

  const timeStr = config.showSeconds
    ? `${hStr}:${mStr}:${sStr}`
    : `${hStr}:${mStr}`;

  const centerFontSize = Math.max(14, svgSize * 0.14);
  const ampmFontSize = centerFontSize * 0.45;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col"
      style={clockAlignmentStyle(config, 'column')}
    >
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
        >
          <Arc
            radius={outerRadius}
            strokeWidth={outerStroke}
            progress={hoursProgress}
            color={outerColor}
            trackColor={trackColor}
            size={svgSize}
          />
          <Arc
            radius={midRadius}
            strokeWidth={midStroke}
            progress={minutesProgress}
            color={midColor}
            trackColor={trackColor}
            size={svgSize}
          />
          {config.showSeconds && (
            <Arc
              radius={innerRadius}
              strokeWidth={innerStroke}
              progress={secondsProgress}
              color={innerColor}
              trackColor={trackColor}
              size={svgSize}
            />
          )}
        </svg>

        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span
            className="tabular-nums font-light tracking-wide"
            style={{ fontSize: centerFontSize, lineHeight: 1.1 }}
            suppressHydrationWarning
          >
            {timeStr}
          </span>
          {period && (
            <span
              className="uppercase tracking-widest font-light"
              style={{ fontSize: ampmFontSize, marginTop: 2, opacity: TEXT_OPACITY.dim }}
              suppressHydrationWarning
            >
              {period}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
