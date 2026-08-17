'use client';

import { useId } from 'react';
import SunCalc from 'suncalc';
import { formatTimeInTZ } from '@/lib/timezone';
import { useRealClock } from '@/hooks/useTZClock';
import { TEXT_OPACITY } from '@/lib/constants';
import { astroDarkWindow, circleAngle, circleArcPath, circlePoint, hoursInTZ, type AstroDarkWindow } from '@/lib/sun-astro';
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

function formatDurationMs(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function getDayLength(sunrise: Date, sunset: Date): string {
  if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) return '—';
  return formatDurationMs(sunset.getTime() - sunrise.getTime());
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
  dark,
}: {
  times: ReturnType<typeof SunCalc.getTimes>;
  now: Date;
  timezone?: string;
  showDayLength: boolean;
  showGoldenHour: boolean;
  t: TranslateFn;
  dark: AstroDarkWindow | null;
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
  const h = 164;
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
        style={{ width: '100%', flex: '1 1 auto', minHeight: 0 }}
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

        {/* Astrodark horizon ticks (fixed positions: evening right, morning left) */}
        {dark && (() => {
          const evX = 215;
          const moX = 65;
          return (
            <g>
              <circle cx={evX} cy={horizonY} r="2.5" fill="#818cf8" />
              <line x1={evX} y1={horizonY - 4} x2={evX} y2={horizonY + 4} stroke="#818cf8" strokeOpacity="0.8" strokeWidth="1.5" />
              <text x={evX} y={horizonY + 17} textAnchor="end" fill="currentColor" fillOpacity={TEXT_OPACITY.secondary} style={{ fontSize: '7.5px' }}>
                {formatTimeInTZ(dark.begins, timezone)}
              </text>
              <text x={evX} y={horizonY + 26} textAnchor="end" fill="currentColor" fillOpacity={TEXT_OPACITY.tertiary} style={{ fontSize: '6.5px' }}>
                {t('sunrise-sunset.darkBegins')}
              </text>
              <circle cx={moX} cy={horizonY} r="2.5" fill="#818cf8" />
              <line x1={moX} y1={horizonY - 4} x2={moX} y2={horizonY + 4} stroke="#818cf8" strokeOpacity="0.8" strokeWidth="1.5" />
              <text x={moX} y={horizonY + 17} textAnchor="start" fill="currentColor" fillOpacity={TEXT_OPACITY.secondary} style={{ fontSize: '7.5px' }}>
                {formatTimeInTZ(dark.ends, timezone)}
              </text>
              <text x={moX} y={horizonY + 26} textAnchor="start" fill="currentColor" fillOpacity={TEXT_OPACITY.tertiary} style={{ fontSize: '6.5px' }}>
                {t('sunrise-sunset.darkEnds')}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Day length / dark window duration below the SVG */}
      {(showDayLength || dark) && (
        <span style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>
          {showDayLength && dark
            ? t('sunrise-sunset.arcDurations', { day: getDayLength(sunrise, sunset), dark: formatDurationMs(dark.lengthMs) })
            : dark
              ? t('sunrise-sunset.circleDarkLength', { length: formatDurationMs(dark.lengthMs) })
              : getDayLength(sunrise, sunset)}
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
  dark,
}: {
  times: ReturnType<typeof SunCalc.getTimes>;
  timezone?: string;
  showDayLength: boolean;
  showGoldenHour: boolean;
  t: TranslateFn;
  dark: AstroDarkWindow | null;
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

      {dark && (
        <div className="flex items-center justify-center w-full" style={{ gap: '3.5em' }}>
          <div className="flex flex-col items-center" style={{ gap: '0.1em' }}>
            <span className="uppercase tracking-widest" style={{ fontSize: '0.5em', opacity: TEXT_OPACITY.dim }}>
              {t('sunrise-sunset.darkBegins')}
            </span>
            <span className="font-light" style={{ fontSize: '0.95em' }}>
              {formatTimeInTZ(dark.begins, timezone)}
            </span>
          </div>
          <div className="flex flex-col items-center" style={{ gap: '0.1em' }}>
            <span className="uppercase tracking-widest" style={{ fontSize: '0.5em', opacity: TEXT_OPACITY.dim }}>
              {t('sunrise-sunset.darkEnds')}
            </span>
            <span className="font-light" style={{ fontSize: '0.95em' }}>
              {formatTimeInTZ(dark.ends, timezone)}
            </span>
          </div>
        </div>
      )}

      {showDayLength && (
        <span style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>
          {t('sunrise-sunset.dayLength', { length: getDayLength(times.sunrise, times.sunset) })}
        </span>
      )}

      {dark && (
        <span style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>
          {t('sunrise-sunset.darkLength', { length: formatDurationMs(dark.lengthMs) })}
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

const CIRCLE_R = 82;
const CIRCLE_LABEL_R = 96;

/** Outside-label placement: radial at r=96, side-anchored; near 3/9-o'clock slide toward the corners. */
function circleLabelPos(angleDeg: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const rad = (angleDeg * Math.PI) / 180;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  let [x, y] = circlePoint(angleDeg, CIRCLE_LABEL_R);
  const anchor = Math.abs(s) < 0.35 ? 'middle' : s > 0 ? 'start' : 'end';
  if (anchor !== 'middle' && Math.abs(c) < 0.17) {
    // within ~10° of the horizontal: labels would clip; slide away from the equator into the corners
    y = y + (c > 0 ? -12 : 12);
    x = anchor === 'end' ? 36 : 214;
  }
  if (anchor === 'middle' && y > 190) y = 222; // bottom labels clear the ring
  return { x, y, anchor };
}

function CircleView({
  times,
  now,
  timezone,
  showDayLength,
  showGoldenHour,
  t,
  dark,
}: {
  times: ReturnType<typeof SunCalc.getTimes>;
  now: Date;
  timezone?: string;
  showDayLength: boolean;
  showGoldenHour: boolean;
  t: TranslateFn;
  dark: AstroDarkWindow | null;
}) {
  const uid = useId();
  const glowId = `circle-sun-glow-${uid}`;
  const { sunrise, sunset, goldenHour } = times;

  if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
    // polar day/night: same messaging as the arc view
    const isPolarDay = isNaN(sunrise.getTime()) && isNaN(sunset.getTime());
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ fontSize: '0.85em', gap: '0.3em', opacity: TEXT_OPACITY.dim }}>
        <span>{isPolarDay ? t('sunrise-sunset.midnightSun') : isNaN(sunrise.getTime()) ? t('sunrise-sunset.noSunriseToday') : formatTimeInTZ(sunrise, timezone)}</span>
        <span>{isPolarDay ? t('sunrise-sunset.sunDoesNotSet') : isNaN(sunset.getTime()) ? t('sunrise-sunset.noSunsetToday') : formatTimeInTZ(sunset, timezone)}</span>
      </div>
    );
  }

  const sr = hoursInTZ(sunrise, timezone);
  const ss = hoursInTZ(sunset, timezone);
  const db = dark ? hoursInTZ(dark.begins, timezone) : null;
  const de = dark ? hoursInTZ(dark.ends, timezone) : null;

  const nowPt = circlePoint(circleAngle(hoursInTZ(now, timezone)), CIRCLE_R);

  const marks: { angle: number; time: Date; wordKey: string }[] = [
    { angle: circleAngle(sr), time: sunrise, wordKey: 'sunrise-sunset.sunrise' },
    { angle: circleAngle(ss), time: sunset, wordKey: 'sunrise-sunset.sunset' },
  ];
  if (dark && db != null && de != null) {
    marks.push({ angle: circleAngle(db), time: dark.begins, wordKey: 'sunrise-sunset.darkBegins' });
    marks.push({ angle: circleAngle(de), time: dark.ends, wordKey: 'sunrise-sunset.darkEnds' });
  }

  const goldenPt = showGoldenHour ? circlePoint(circleAngle(hoursInTZ(goldenHour, timezone)), CIRCLE_R) : null;

  const dayTimeColor = '#fbbf24';
  const dawnDuskColor = '#aa670e';
  const goldenHourColor = '#ffa200';
  const astroDarkColor = '#0b0c63';

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <svg viewBox="0 0 250 250" style={{ width: '100%', height: '100%' }}>
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0%" stopColor={dayTimeColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={dayTimeColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* base ring keeps the dial shape where no segment covers it */}
        <circle cx="125" cy="125" r={CIRCLE_R} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="8" />

        {/* daylight through noon */}
        <path d={circleArcPath(sr, ss, CIRCLE_R)} fill="none" stroke={dayTimeColor} strokeWidth="8" />

        {/* night: twilight(s) + astrodark */}
        {dark && db != null && de != null ? (
          <>
            <path d={circleArcPath(ss, db, CIRCLE_R)} fill="none" stroke={dawnDuskColor} strokeWidth="8" />
            <path d={circleArcPath(db, de, CIRCLE_R)} fill="none" stroke={astroDarkColor} strokeWidth="8" />
            <path d={circleArcPath(de, sr + 24, CIRCLE_R)} fill="none" stroke={dawnDuskColor} strokeWidth="8" />
          </>
        ) : (
          <path d={circleArcPath(ss, sr + 24, CIRCLE_R)} fill="none" stroke={dawnDuskColor} strokeWidth="8" />
        )}

        {/* noon / midnight notches + inside words */}
        <line x1="125" y1="37" x2="125" y2="49" stroke="#0f172a" strokeWidth="2" />
        <text x="125" y="60" textAnchor="middle" fill="currentColor" fillOpacity={TEXT_OPACITY.dim} style={{ fontSize: '6.5px' }}>
          {t('sunrise-sunset.noon')}
        </text>
        <line x1="125" y1="201" x2="125" y2="213" stroke="#0f172a" strokeWidth="2" />
        <text x="125" y="196" textAnchor="middle" fill="currentColor" fillOpacity={TEXT_OPACITY.dim} style={{ fontSize: '6.5px' }}>
          {t('sunrise-sunset.midnight')}
        </text>

        {/* event markers + outside labels */}
        {marks.map((m) => {
          const pt = circlePoint(m.angle, CIRCLE_R);
          const lp = circleLabelPos(m.angle);
          return (
            <g key={m.wordKey}>
              <circle cx={pt[0]} cy={pt[1]} r="3" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.5" />
              <text x={lp.x} y={lp.y} textAnchor={lp.anchor} fill="currentColor" fillOpacity={TEXT_OPACITY.secondary} style={{ fontSize: '7.5px' }}>
                {formatTimeInTZ(m.time, timezone)}
              </text>
              <text x={lp.x} y={lp.y + 9} textAnchor={lp.anchor} fill="currentColor" fillOpacity={TEXT_OPACITY.tertiary} style={{ fontSize: '6px' }}>
                {t(m.wordKey)}
              </text>
            </g>
          );
        })}

        {/* golden hour: amber dot on the day arc, label tucked inside the ring */}
        {goldenPt && (
          <g>
            <circle cx={goldenPt[0]} cy={goldenPt[1]} r="3.5" fill={goldenHourColor} stroke="#0f172a" strokeWidth="1.5" />
            <text x={goldenPt[0] - 11} y={goldenPt[1] - 2.5} textAnchor="end" fill="currentColor" fillOpacity={TEXT_OPACITY.tertiary} style={{ fontSize: '6px' }}>
              {t('sunrise-sunset.goldenHourLabel')}
            </text>
            <text x={goldenPt[0] - 11} y={goldenPt[1] + 6.5} textAnchor="end" fill="currentColor" fillOpacity={TEXT_OPACITY.secondary} style={{ fontSize: '7.5px' }}>
              {formatTimeInTZ(goldenHour, timezone)}
            </text>
          </g>
        )}

        {/* now: same radial glow as the arc view */}
        <circle cx={nowPt[0]} cy={nowPt[1]} r="32" fill={`url(#${glowId})`} />
        <circle cx={nowPt[0]} cy={nowPt[1]} r="4.5" fill={dayTimeColor} stroke="#0f172a" strokeWidth="1.5" />

        {/* centered durations */}
        {showDayLength && (
          <text x="125" y="122" textAnchor="middle" fill="currentColor" style={{ fontSize: '15px', fontWeight: 300 }}>
            {getDayLength(sunrise, sunset)}
          </text>
        )}
        {dark && showDayLength && (
          <text x="125" y="140" textAnchor="middle" fill="currentColor" fillOpacity={TEXT_OPACITY.dim} style={{ fontSize: '10px' }}>
            {t('sunrise-sunset.circleDarkLength', { length: formatDurationMs(dark.lengthMs) })}
          </text>
        )}
        {dark && !showDayLength && (
          <text x="125" y="131" textAnchor="middle" fill="currentColor" fillOpacity={TEXT_OPACITY.dim} style={{ fontSize: '10px' }}>
            {t('sunrise-sunset.circleDarkLength', { length: formatDurationMs(dark.lengthMs) })}
          </text>
        )}
      </svg>
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
  const nextTimes = config.showAstroDark
    ? SunCalc.getTimes(new Date(now.getTime() + 24 * 3600 * 1000), latitude, longitude)
    : null;
  const dark = nextTimes ? astroDarkWindow(times, nextTimes) : null;
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
          dark={dark}
        />
      ) : view === 'circle' ? (
        <CircleView
          times={times}
          now={now}
          timezone={timezone}
          showDayLength={config.showDayLength !== false}
          showGoldenHour={!!config.showGoldenHour}
          t={t}
          dark={dark}
        />
      ) : (
        <DefaultView
          times={times}
          timezone={timezone}
          showDayLength={config.showDayLength !== false}
          showGoldenHour={!!config.showGoldenHour}
          t={t}
          dark={dark}
        />
      )}
    </ModuleWrapper>
  );
}
