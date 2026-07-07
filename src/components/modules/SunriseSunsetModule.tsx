'use client';

import { useId } from 'react';
import SunCalc from 'suncalc';
import { formatTimeInTZ } from '@/lib/timezone';
import { useRealClock } from '@/hooks/useTZClock';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { SunriseSunsetConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { LocationRequired } from './LocationRequired';

interface SunriseSunsetModuleProps {
  config: SunriseSunsetConfig;
  style: ModuleStyle;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

function getDayLength(sunrise: Date, sunset: Date): string {
  if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) return '—';
  const diffMs = sunset.getTime() - sunrise.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

/** Map a time to a 0–1 progress fraction between sunrise and sunset. <0 = before sunrise, >1 = after sunset. */
function sunProgress(now: Date, sunrise: Date, sunset: Date): number {
  const total = sunset.getTime() - sunrise.getTime();
  if (total <= 0) return 0;
  return (now.getTime() - sunrise.getTime()) / total;
}

/** Get (x, y) on the arc for a progress value 0–1. Arc spans from left to right as a semicircle above the horizon. */
function arcPoint(progress: number, cx: number, cy: number, rx: number, ry: number): { x: number; y: number } {
  // progress 0 = left (sunrise), 1 = right (sunset)
  // Angle goes from π (left) to 0 (right) — standard semicircle
  const angle = Math.PI * (1 - progress);
  return {
    x: cx + rx * Math.cos(angle),
    y: cy - ry * Math.sin(angle),
  };
}

function SunArcView({
  times,
  now,
  timezone,
  showDayLength,
  showGoldenHour,
  t,
}: {
  times: ReturnType<typeof SunCalc.getTimes>;
  now: Date;
  timezone?: string;
  showDayLength: boolean;
  showGoldenHour: boolean;
  t: TranslateFn;
}) {
  const uid = useId();
  const sunGlowId = `sun-glow-${uid}`;
  const { sunrise, sunset, solarNoon } = times;

  // Polar day/night: SunCalc returns Invalid Date when there's no sunrise or sunset
  if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
    const isPolarDay = isNaN(sunrise.getTime()) && isNaN(sunset.getTime());
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ fontSize: '0.85em', gap: '0.3em', opacity: TEXT_OPACITY.dim }}>
        <span>{isPolarDay ? t('sunrise-sunset.midnightSun') : isNaN(sunrise.getTime()) ? t('sunrise-sunset.noSunriseToday') : formatTimeInTZ(sunrise, timezone)}</span>
        <span>{isPolarDay ? t('sunrise-sunset.sunDoesNotSet') : isNaN(sunset.getTime()) ? t('sunrise-sunset.noSunsetToday') : formatTimeInTZ(sunset, timezone)}</span>
        {showDayLength && <span>{getDayLength(sunrise, sunset)}</span>}
      </div>
    );
  }

  const progress = sunProgress(now, sunrise, sunset);
  const isDaytime = progress >= 0 && progress <= 1;

  // SVG dimensions
  const w = 280;
  const h = 160;
  const cx = w / 2;
  const horizonY = h - 30; // horizon line Y
  const rx = 120; // arc horizontal radius
  const ry = 100; // arc vertical radius

  // Build the dashed arc path (semicircle from left to right)
  const arcStartX = cx - rx;
  const arcEndX = cx + rx;

  // Sun position on the arc (clamped for display but we'll also show below-horizon state)
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const sunPos = arcPoint(clampedProgress, cx, horizonY, rx, ry);

  // Solar noon position (peak of arc)
  const noonProgress = sunProgress(solarNoon, sunrise, sunset);
  const noonPos = arcPoint(Math.max(0, Math.min(1, noonProgress)), cx, horizonY, rx, ry);

  // Golden hour position
  const goldenProgress = sunProgress(times.goldenHour, sunrise, sunset);

  // Sun glow radius and opacity based on altitude
  const glowRadius = isDaytime ? 32 : 18;
  const sunRadius = 12;

  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ gap: '0.3em' }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: '100%', maxWidth: `${w}px`, height: 'auto' }}
      >
        {/* Glow gradient for the sun */}
        <defs>
          <radialGradient id={sunGlowId}>
            <stop offset="0%" stopColor={isDaytime ? '#fbbf24' : '#f97316'} stopOpacity="0.6" />
            <stop offset="100%" stopColor={isDaytime ? '#fbbf24' : '#f97316'} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Horizon line */}
        <line
          x1={cx - rx - 10}
          y1={horizonY}
          x2={cx + rx + 10}
          y2={horizonY}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1"
        />

        {/* Arc path (dashed) */}
        <path
          d={`M ${arcStartX} ${horizonY} A ${rx} ${ry} 0 0 1 ${arcEndX} ${horizonY}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="3"
          strokeDasharray="4 4"
        />

        {/* Traversed arc segment (solid, up to current sun position) */}
        {isDaytime && (
          <path
            d={`M ${arcStartX} ${horizonY} A ${rx} ${ry} 0 0 1 ${sunPos.x} ${sunPos.y}`}
            fill="none"
            stroke={isDaytime ? '#fbbf24' : '#f97316'}
            strokeOpacity="0.4"
            strokeWidth="4"
          />
        )}

        {/* Golden hour marker */}
        {showGoldenHour && goldenProgress >= 0 && goldenProgress <= 1 && (() => {
          const gp = arcPoint(goldenProgress, cx, horizonY, rx, ry);
          return (
            <g>
              <circle cx={gp.x} cy={gp.y} r="2.5" fill="#f59e0b" fillOpacity="0.7" />
              <text
                x={gp.x}
                y={gp.y - 8}
                textAnchor="middle"
                fill="currentColor"
                fillOpacity={TEXT_OPACITY.dim}
                style={{ fontSize: '8px' }}
              >
                {formatTimeInTZ(times.goldenHour, timezone)}
              </text>
            </g>
          );
        })()}

        {/* Noon tick at peak */}
        <line
          x1={noonPos.x}
          y1={noonPos.y - 4}
          x2={noonPos.x}
          y2={noonPos.y + 4}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        <text
          x={noonPos.x}
          y={noonPos.y - 8}
          textAnchor="middle"
          fill="currentColor"
          fillOpacity={TEXT_OPACITY.tertiary}
          style={{ fontSize: '8px' }}
        >
          {t('sunrise-sunset.noon')}
        </text>

        {/* Sun glow */}
        {isDaytime && (
          <circle cx={sunPos.x} cy={sunPos.y} r={glowRadius} fill={`url(#${sunGlowId})`} />
        )}

        {/* Sun circle */}
        <circle
          cx={isDaytime ? sunPos.x : cx}
          cy={isDaytime ? sunPos.y : horizonY + 14}
          r={sunRadius}
          fill={isDaytime ? '#fbbf24' : '#64748b'}
          fillOpacity={isDaytime ? 1 : 0.4}
        />

        {/* Sunrise label (left) */}
        <text
          x={arcStartX}
          y={horizonY + 14}
          textAnchor="middle"
          fill="currentColor"
          fillOpacity={TEXT_OPACITY.secondary}
          style={{ fontSize: '9px' }}
        >
          {formatTimeInTZ(sunrise, timezone)}
        </text>
        <text
          x={arcStartX}
          y={horizonY + 24}
          textAnchor="middle"
          fill="currentColor"
          fillOpacity={TEXT_OPACITY.tertiary}
          style={{ fontSize: '7px' }}
        >
          {t('sunrise-sunset.riseShort')}
        </text>

        {/* Sunset label (right) */}
        <text
          x={arcEndX}
          y={horizonY + 14}
          textAnchor="middle"
          fill="currentColor"
          fillOpacity={TEXT_OPACITY.secondary}
          style={{ fontSize: '9px' }}
        >
          {formatTimeInTZ(sunset, timezone)}
        </text>
        <text
          x={arcEndX}
          y={horizonY + 24}
          textAnchor="middle"
          fill="currentColor"
          fillOpacity={TEXT_OPACITY.tertiary}
          style={{ fontSize: '7px' }}
        >
          {t('sunrise-sunset.setShort')}
        </text>
      </svg>

      {/* Day length below the SVG */}
      {showDayLength && (
        <span style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>
          {getDayLength(sunrise, sunset)}
        </span>
      )}
    </div>
  );
}

function DefaultView({
  times,
  timezone,
  showDayLength,
  showGoldenHour,
  t,
}: {
  times: ReturnType<typeof SunCalc.getTimes>;
  timezone?: string;
  showDayLength: boolean;
  showGoldenHour: boolean;
  t: TranslateFn;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ gap: '0.6em' }}>
      <div className="flex items-center justify-center w-full" style={{ gap: '1.5em' }}>
        {/* Sunrise */}
        <div className="flex flex-col items-center" style={{ gap: '0.15em' }}>
          <span style={{ fontSize: '1.4em' }}>↑</span>
          <span className="uppercase tracking-widest" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.dim }}>
            {t('sunrise-sunset.sunrise')}
          </span>
          <span className="font-light" style={{ fontSize: '1.3em' }}>
            {formatTimeInTZ(times.sunrise, timezone)}
          </span>
        </div>

        {/* Sunset */}
        <div className="flex flex-col items-center" style={{ gap: '0.15em' }}>
          <span style={{ fontSize: '1.4em' }}>↓</span>
          <span className="uppercase tracking-widest" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.dim }}>
            {t('sunrise-sunset.sunset')}
          </span>
          <span className="font-light" style={{ fontSize: '1.3em' }}>
            {formatTimeInTZ(times.sunset, timezone)}
          </span>
        </div>
      </div>

      {showDayLength && (
        <span style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>
          {t('sunrise-sunset.dayLength', { length: getDayLength(times.sunrise, times.sunset) })}
        </span>
      )}

      {showGoldenHour && (
        <span style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>
          {t('sunrise-sunset.goldenHour', { time: formatTimeInTZ(times.goldenHour, timezone) })}
        </span>
      )}
    </div>
  );
}

export default function SunriseSunsetModule({ config, style, latitude, longitude, timezone }: SunriseSunsetModuleProps) {
  // Real instant, NOT the shifted TZ clock: SunCalc returns true UTC instants,
  // so the arc position / isDaytime comparison and the solar-day selection
  // must use a true epoch too. `timezone` is only for formatting the labels.
  const now = useRealClock();
  const t = useTranslate('modules');

  if (latitude == null || longitude == null) {
    return <LocationRequired style={style} />;
  }

  const times = SunCalc.getTimes(now, latitude, longitude);
  const view = config.view ?? 'default';

  return (
    <ModuleWrapper style={style}>
      {view === 'arc' ? (
        <SunArcView
          times={times}
          now={now}
          timezone={timezone}
          showDayLength={config.showDayLength !== false}
          showGoldenHour={!!config.showGoldenHour}
          t={t}
        />
      ) : (
        <DefaultView
          times={times}
          timezone={timezone}
          showDayLength={config.showDayLength !== false}
          showGoldenHour={!!config.showGoldenHour}
          t={t}
        />
      )}
    </ModuleWrapper>
  );
}
