'use client';

import { useMemo } from 'react';
import { useRealClock } from '@/hooks/useTZClock';
import { useElementBox } from '@/hooks/useElementBox';
import { useTranslate } from '@/i18n';
import { tempColor } from '@/lib/weather/temp-ramp';
import { sunTimesFor, type SunTimes } from '@/lib/weather/sun-times';
import type { ForecastDay } from '@/lib/weather';
import type { WeekRange } from '../fullscreen-weather/weather-view-utils';
import { DAILY_RAIN_SHOWN_PCT, MIN_BAR_PCT, RAIN_COLOR } from '../fullscreen-weather/weather-view-utils';

/**
 * The pieces the regular weather module's chart views share: the full-screen
 * module's range bars, now ring and rain legend, drawn in em so they follow
 * the module's fitted text size rather than the full-screen scale.
 */

// The full-screen module's own numbers and colour, not copies of them.
export { DAILY_RAIN_SHOWN_PCT as RAIN_SHOWN_PCT, RAIN_COLOR };

/** Today's daylight window at the module's coordinates, ticking by the minute. */
export function useSunTimes(latitude?: number, longitude?: number, timezone?: string): SunTimes {
  const now = useRealClock(60_000);
  return useMemo(() => sunTimesFor(now, latitude, longitude, timezone), [now, latitude, longitude, timezone]);
}

/**
 * The view's measured box and which way it is longer. Views that lay out
 * differently across and down (week columns vs bands, the hour timeline as
 * columns vs rows) choose by this rather than by the wall's orientation,
 * because a module box can be any shape on either wall.
 */
export function useViewBox(): [(el: HTMLDivElement | null) => void, { width: number; height: number; landscape: boolean }] {
  const [attach, box] = useElementBox<HTMLDivElement>();
  return [attach, { width: box.width, height: box.height, landscape: box.width > box.height }];
}

/** "chance of rain" with its swatch, for the charts that draw rain bars. */
export function RainLegend() {
  const t = useTranslate('modules');
  return (
    <span className="inline-flex items-center gap-[0.4em]">
      <span className="inline-block rounded-[2px]" style={{ width: '0.6em', height: '0.6em', background: RAIN_COLOR }} aria-hidden="true" />
      {t('fullscreen-weather.sections.chanceOfPrecip')}
    </span>
  );
}

/** The ring marking the current temperature inside today's range. */
export function NowRing({ style }: { style: React.CSSProperties }) {
  return (
    <span
      data-testid="weather-now-ring"
      className="absolute rounded-full"
      style={{
        width: '0.8em', height: '0.8em',
        background: 'rgba(0,0,0,.55)', border: '2px solid currentColor',
        boxShadow: '0 0 0 2px rgba(0,0,0,.35)',
        ...style,
      }}
    />
  );
}

/**
 * A day's low..high drawn against the week's shared scale, across or down.
 * `today` adds the now ring at the live temperature.
 */
export function RangeBar({ day, range, today, units, vertical = false }: {
  day: ForecastDay; range: WeekRange; today: boolean; units: 'metric' | 'imperial'; vertical?: boolean;
}) {
  const lo = range.pct(day.low);
  const hi = range.pct(day.high);
  const span = Math.max(MIN_BAR_PCT, hi - lo);
  const gradient = `linear-gradient(${vertical ? '0deg' : '90deg'}, ${tempColor(day.low, units)}, ${tempColor(day.high, units)})`;
  const ring = today && range.nowTemp != null;
  return (
    <div
      className="relative rounded-full"
      style={{
        background: 'color-mix(in srgb, currentColor 12%, transparent)',
        ...(vertical ? { width: '0.45em', flex: 1, minHeight: '3em' } : { height: '0.4em', flex: 1 }),
      }}
    >
      <div
        className="absolute rounded-full"
        style={vertical
          ? { left: 0, right: 0, bottom: `${lo}%`, height: `${span}%`, background: gradient }
          : { top: 0, bottom: 0, left: `${lo}%`, width: `${span}%`, background: gradient }}
      />
      {ring && (
        <NowRing style={vertical
          ? { left: '50%', top: `${100 - range.pct(range.nowTemp as number)}%`, transform: 'translate(-50%,-50%)' }
          : { top: '50%', left: `${range.pct(range.nowTemp as number)}%`, transform: 'translate(-50%,-50%)' }} />
      )}
    </div>
  );
}
