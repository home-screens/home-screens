'use client';

import { useId } from 'react';
import SunCalc from 'suncalc';
import { Sunrise, Sunset } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useRealClock } from '@/hooks/useTZClock';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { formatTimeInTZ } from '@/lib/timezone';
import { decompose, formatDuration } from '@/lib/duration-format';
import { hoursInTZ } from '@/lib/sun-astro';
import { daysToFullMoon, moonPhaseKey } from '@/lib/weather/moon-phase-name';
import { smoothPath } from '../fullscreen-weather/weather-view-utils';
import { useSunTimes, useViewBox } from './chart-parts';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherViewProps } from './types';

/**
 * The Almanac's Sun and Moon cards as one module view: the day's length with
 * the sun's position on today's arc and the sunrise and sunset times, and the
 * moon's phase name, lit fraction and disc. Side by side in a box wider than
 * tall, stacked in a taller one.
 */
const ARC_W = 460;
const ARC_H = 230;

export default function WeatherSunView({ config, timezone, timeFormat, scaledFontSize, latitude, longitude }: WeatherViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const now = useRealClock(60_000);
  const sun = useSunTimes(latitude, longitude, timezone);
  const [outerRef, box] = useViewBox();
  const uid = useId();
  const landscape = box.landscape;
  // What a small box keeps: the arc and the times are the view, so the moon
  // goes first (a side-by-side box under 420 px wide, a stacked one under
  // 320 px tall) and the daylight headline next (under 160 px tall). Design
  // canvas pixels, as the Week view's column rule: the starting text size
  // grows with the box, so a rule in em would read the same for every size.
  const dropMoon = box.width > 0 && (landscape ? box.width < 420 : box.height < 320);
  const dropHeadline = box.height > 0 && box.height < 160;
  const fullMoonCaption = box.width >= 480;
  // Stacked, the sun card keeps the height its own content needs (headline,
  // the arc at its floor, the times row), so a box too short for both cards
  // pushes the moon past the bottom edge, where the fit loop measures it and
  // shrinks the type. Left free to shrink, the card was squeezed to make
  // room for the moon and its times row printed across the moon's name in
  // any square box, with nothing overflowing the wrapper for the loop to see.
  const sunCardMinHeight = landscape ? undefined : dropHeadline ? '4em' : '7em';

  const { boxRef, contentRef, fontSize } = useFitFontSize(scaledFontSize, [landscape, dropMoon, dropHeadline, fullMoonCaption, config.showTitle !== false].join('|'));

  if (latitude == null || longitude == null) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ fontSize: `${scaledFontSize}px` }}>
        <WeatherEmptyState message={t('common.locationNotSet')} />
      </div>
    );
  }

  const clock = { timezone, locale, hour12: timeFormat !== '24h' };
  const { days, hours, minutes } = decompose(sun.dayLengthMs);
  const dayLength = formatDuration([{ unit: 'hours', value: days * 24 + hours }, { unit: 'minutes', value: minutes }], 'units', locale);

  // Where the sun sits on the arc, 0 at sunrise and 1 at sunset, clamped so
  // the night parks it at the horizon it last crossed.
  const dayLen = sun.sunsetHour - sun.sunriseHour;
  const prog = dayLen <= 0 ? 0 : Math.max(0, Math.min(1, (hoursInTZ(now, timezone) - sun.sunriseHour) / dayLen));
  const ax = (k: number) => 34 + k * (ARC_W - 68);
  const ay = (k: number) => ARC_H - 24 - Math.sin(k * Math.PI) * (ARC_H - 60);
  const arc = smoothPath(Array.from({ length: 41 }, (_, i) => [ax(i / 40), ay(i / 40)] as [number, number]));
  const hasArc = sun.sunrise != null && sun.sunset != null;

  const illum = SunCalc.getMoonIllumination(now);
  const phaseKey = moonPhaseKey(illum.phase);
  const litPct = Math.round(illum.fraction * 100);
  const fullIn = daysToFullMoon(illum.phase);
  const showFullIn = fullMoonCaption && phaseKey !== 'full' && fullIn > 0;

  return (
    <div ref={outerRef} className="w-full h-full">
      <div ref={boxRef} className="w-full h-full overflow-hidden" style={{ fontSize: `${fontSize}px` }} data-weather-sun-mode={landscape ? 'side' : 'stacked'}>
        <div ref={contentRef} className={`w-full h-full flex ${landscape ? 'flex-row gap-[1.5em]' : 'flex-col gap-[0.6em]'}`}>
          <div className="flex-1 min-w-0 min-h-0 flex flex-col" style={{ minHeight: sunCardMinHeight }} data-testid="weather-sun-card">
            {!dropHeadline && (
              <>
                <div className="font-light tabular-nums leading-none" style={{ fontSize: '1.8em' }}>
                  {hasArc ? (
                    <>{days * 24 + hours}<small style={{ fontSize: '0.5em', opacity: TEXT_OPACITY.dim }}>h</small> {minutes}<small style={{ fontSize: '0.5em', opacity: TEXT_OPACITY.dim }}>m</small></>
                  ) : (
                    <span style={{ fontSize: '0.7em' }}>{sun.isNight ? t('sunrise-sunset.polarNight') : t('sunrise-sunset.midnightSun')}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim, marginTop: '0.25em' }} aria-label={dayLength}>{t('fullscreen-weather.cards.daylight')}</div>
              </>
            )}
            {/* The arc keeps a floor: squeezed below it the box overflows and
                the fit loop shrinks the type, rather than the arc thinning
                to a line while the text stays large. */}
            <div className="flex-1 min-h-0 grid overflow-hidden" style={{ placeItems: 'end center', minHeight: '3em' }}>
              <svg viewBox={`0 0 ${ARC_W} ${ARC_H}`} preserveAspectRatio="xMidYMid meet" className="w-full max-h-full" aria-hidden="true">
                <defs>
                  <linearGradient id={`${uid}-sun`} x1="0" x2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity=".22" />
                    <stop offset="50%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity=".22" />
                  </linearGradient>
                </defs>
                <line x1={18} y1={ARC_H - 24} x2={ARC_W - 18} y2={ARC_H - 24} stroke="currentColor" strokeOpacity=".2" strokeWidth={1.5} strokeDasharray="4 6" />
                <path d={arc} fill="none" stroke={`url(#${uid}-sun)`} strokeWidth={4} strokeLinecap="round" />
                {/* After sunset the sun is gone, not parked on the horizon;
                    the times below and the moon beside say it is night. */}
                {hasArc && !sun.isNight && (
                  <>
                    <circle cx={ax(prog)} cy={ay(prog)} r={22} fill="#fbbf24" opacity=".2" />
                    <circle cx={ax(prog)} cy={ay(prog)} r={11} fill="#fbbf24" />
                  </>
                )}
              </svg>
            </div>
            <div className="flex justify-between tabular-nums" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary }}>
              <span className="inline-flex items-center gap-[0.3em]"><Sunrise size="1.2em" strokeWidth={1.6} aria-hidden="true" />{sun.sunrise ? formatTimeInTZ(sun.sunrise, clock) : '—'}</span>
              <span className="inline-flex items-center gap-[0.3em]"><Sunset size="1.2em" strokeWidth={1.6} aria-hidden="true" />{sun.sunset ? formatTimeInTZ(sun.sunset, clock) : '—'}</span>
            </div>
          </div>

          {!dropMoon && (
          <div className={landscape ? 'flex-[0.8] min-w-0 min-h-0 flex flex-col' : 'shrink-0 flex items-center gap-[1em]'} data-testid="weather-moon-card">
            {!landscape && <MoonDisc phase={illum.phase} uid={uid} style={{ width: '4.5em', flex: 'none' }} />}
            <div className="min-w-0">
              <div className="font-light leading-tight" style={{ fontSize: '1.3em' }}>{t(`fullscreen-weather.moon.${phaseKey}`)}</div>
              <div style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim, marginTop: '0.25em' }}>{t('fullscreen-weather.moon.illuminated', { percent: litPct })}</div>
              {showFullIn && (
                <div style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim, marginTop: '0.1em' }} data-testid="weather-full-moon">{t('fullscreen-weather.moon.fullMoonIn', { count: fullIn })}</div>
              )}
            </div>
            {landscape && (
              <div className="flex-1 min-h-0 grid place-items-center overflow-hidden">
                <MoonDisc phase={illum.phase} uid={uid} style={{ width: '7em', maxWidth: '100%', maxHeight: '100%' }} />
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The lit part of the disc. `c` runs +1 (new) -> 0 (quarter) -> -1 (full):
 * a lit disc, then the unlit half covered (a rectangle: a circle shifted by
 * one radius only meets the middle at the equator and leaves lit slivers at
 * the poles), then an ellipse of width |c|*R that is dark for a crescent
 * (c > 0) and lit for a gibbous (c < 0). Same geometry as the full-screen
 * Almanac's moon card.
 */
function MoonDisc({ phase, uid, style }: { phase: number; uid: string; style: React.CSSProperties }) {
  const c = Math.cos(2 * Math.PI * phase);
  const waxing = phase < 0.5;
  const R = 62;
  const DARK = '#39404e';
  const LIT = `url(#${uid}-moon-grad)`;
  return (
    <svg viewBox="0 0 150 150" style={style} aria-hidden="true">
      <defs>
        <clipPath id={`${uid}-moon-clip`}><circle cx="75" cy="75" r={R} /></clipPath>
        <radialGradient id={`${uid}-moon-grad`} gradientUnits="userSpaceOnUse" cx="52" cy="48" r="96">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#cbd5e1" />
        </radialGradient>
      </defs>
      <circle cx="75" cy="75" r={R} fill={DARK} />
      <g clipPath={`url(#${uid}-moon-clip)`}>
        <circle cx="75" cy="75" r={R} fill={LIT} />
        <rect x={waxing ? 75 - R : 75} y={75 - R} width={R} height={R * 2} fill={DARK} />
        <ellipse cx="75" cy="75" rx={Math.abs(c) * R} ry={R} fill={c > 0 ? DARK : LIT} />
      </g>
      <circle cx="75" cy="75" r={R} fill="none" stroke="currentColor" strokeOpacity=".12" />
    </svg>
  );
}
