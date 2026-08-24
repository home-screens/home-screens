import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert } from '@/lib/weather';
import type { FullscreenWeatherConfig } from '@/types/config';
import type { SkyCondition } from './sky-layer';

/**
 * Scale system shared by every view.
 *
 * Two units, deliberately separate:
 *
 * `s` sizes **type** — font sizes and the icons sitting beside them.
 * `u` sizes **structure** — padding, gaps, chart heights, corner radii.
 *
 * Collapsing them into one unit (the first cut of this module) made
 * `typographySize` inflate the whole layout rather than just the text: at
 * 2x-large and beyond the stack outgrew the canvas, `useFitScale` shrank
 * everything back, and the rendered hero came out *smaller* than at `large`.
 * Measured 184 / 216 / 248 / 246 / 240px across small..4x-large — the control
 * did nothing above `large`.
 *
 * Keeping them apart also gives `density` real work: it now drives every gap,
 * pad, and chart height instead of a single row-gap nobody could see.
 */
export interface WeatherScale {
  /** Base unit: 1% of the shorter viewport edge. */
  bu: number;
  /** Type unit: `bu * typographySize multiplier`. Fonts and inline icons. */
  s: number;
  /** Structure unit: `bu * density multiplier`. Padding, gaps, chart heights. */
  u: number;
  width: number;
  height: number;
  typoMul: number;
  densityMul: number;
  isDark: boolean;
}

export interface WeatherViewProps {
  config: FullscreenWeatherConfig;
  timeFormat: '12h' | '24h';
  scale: WeatherScale;
  hourly: HourlyWeather[];
  forecast: ForecastDay[];
  minutely: MinutelyPrecip[];
  alerts: WeatherAlert[];
  units: 'metric' | 'imperial';
  now: Date;
  timezone?: string;
  locationLabel: string;
  sky: SkyCondition;
  accent: string;
  sun: SunTimes;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  /** Fractional hours in the display timezone, for placing markers on a 24h axis. */
  sunriseHour: number;
  sunsetHour: number;
  isNight: boolean;
  dayLengthMs: number;
}

export const degree = (units: 'metric' | 'imperial') => (units === 'metric' ? '°C' : '°F');

/** Short hour label: 0 -> "12a", 13 -> "1p". */
export function hourLabel(hour: number, timeFormat: '12h' | '24h' = '12h'): string {
  if (timeFormat === '24h') return `${String(hour).padStart(2, '0')}`;
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

/**
 * Catmull-Rom spline through the points, emitted as cubic beziers.
 * Used for the temperature ribbon and the pressure sparkline.
 */
export function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Wall-clock hour (fractional) for an instant in the display timezone.
 * Every axis in this module is a local-time axis, so parsing must not fall
 * back to browser-local time on a display configured for another zone.
 */
export function tzHour(date: Date, timezone?: string): number {
  if (!timezone) return date.getHours() + date.getMinutes() / 60;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (h % 24) + m / 60;
}

/**
 * The instant an hourly entry refers to.
 *
 * WeatherAPI's `time` is a zone-less location-local wall time — safe to
 * format, unsafe to parse — so `timeEpoch` wins whenever the provider set it.
 */
export function hourlyInstant(h: HourlyWeather): Date {
  return h.timeEpoch != null ? new Date(h.timeEpoch * 1000) : new Date(h.time);
}

/** Alert severities that earn the red treatment rather than amber. */
export function alertTone(severity: WeatherAlert['severity']): { fg: string; isSevere: boolean } {
  const isSevere = severity === 'Extreme' || severity === 'Severe';
  return { fg: isSevere ? '#ef4444' : '#f59e0b', isSevere };
}

/**
 * Plain-language summary of the next hour of precipitation.
 * Returns null when there is nothing worth saying, which also hides the strip.
 */
export function nowcastVerdict(
  minutely: MinutelyPrecip[],
  t: WeatherViewProps['t'],
): { text: string; series: number[] } | null {
  if (!minutely || minutely.length === 0) return null;

  const series = minutely.slice(0, 60).map((m) => {
    const byIntensity = Math.min(1, (m.intensity ?? 0) / 0.4);
    const byProb = (m.probability ?? 0) / 100;
    // Providers vary in which field carries the signal; take the stronger.
    return Math.max(0, Math.min(1, Math.max(byIntensity, byProb * byIntensity > 0 ? byIntensity : 0)));
  });
  if (series.every((v) => v <= 0.02)) {
    return { text: t('fullscreen-weather.nowcast.dry'), series };
  }

  const WET = 0.05;
  const startsAt = series.findIndex((v) => v > WET);
  const wetNow = series[0] > WET;

  if (wetNow) {
    const stopsAt = series.findIndex((v, i) => i > 0 && v <= WET);
    if (stopsAt === -1) return { text: t('fullscreen-weather.nowcast.continues'), series };
    return { text: t('fullscreen-weather.nowcast.stopsIn', { minutes: stopsAt }), series };
  }
  if (startsAt > 0) {
    return { text: t('fullscreen-weather.nowcast.startsIn', { minutes: startsAt }), series };
  }
  return { text: t('fullscreen-weather.nowcast.dry'), series };
}
