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
  /** Type unit: `bu * typographySize multiplier`, fit-corrected. Fonts and inline icons. */
  s: number;
  /** Structure unit: `bu * density multiplier`, fit-corrected. Padding, gaps, chart heights. */
  u: number;
  width: number;
  height: number;
  isDark: boolean;
  /**
   * Canvas shape. Landscape is a different **arrangement** of the same parts,
   * not a rescaling of the portrait one — see `getOrientation`.
   */
  orientation: Orientation;
}

export type Orientation = 'portrait' | 'landscape';

/**
 * Canvas shape, from the rendered box.
 *
 * Ties go to portrait: a square canvas reads correctly as a vertical stack,
 * and splitting it into two columns leaves both too narrow for the charts.
 * Mirrors `getOrientation` in fullscreen-chore-chart.
 */
export function getOrientation(width: number, height: number): Orientation {
  return width > height ? 'landscape' : 'portrait';
}

/**
 * Share of the landscape canvas the left rail takes.
 *
 * Exported because the temperature ribbon has to reconstruct its own rendered
 * width to keep its viewBox aspect honest (see the `preserveAspectRatio` note
 * in PanoramaView), and it cannot measure itself without re-rendering inside
 * the fit loop.
 */
export const LANDSCAPE_LEFT_FRACTION = 0.34;

export interface WeatherViewProps {
  config: FullscreenWeatherConfig;
  timeFormat: '12h' | '24h';
  scale: WeatherScale;
  hourly: HourlyWeather[];
  forecast: ForecastDay[];
  minutely: MinutelyPrecip[];
  alerts: WeatherAlert[];
  units: 'metric' | 'imperial';
  /** The real current instant (see `useRealClock`); format it with `timezone`. */
  now: Date;
  timezone?: string;
  locationLabel: string;
  sky: SkyCondition;
  accent: string;
  sun: SunTimes;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}

/**
 * Today's daylight model.
 *
 * `sunrise` / `sunset` are null when the sun never crosses the horizon today
 * (polar day or night) or when there are no coordinates. In that case
 * `isNight` is constant for the whole day and `isNightHour` returns it for
 * every hour, rather than pretending there was a sunrise at midnight.
 */
export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  /** Fractional hours in the display timezone, for placing markers on a 24h axis. */
  sunriseHour: number;
  sunsetHour: number;
  isNight: boolean;
  dayLengthMs: number;
}

/**
 * Whether a wall-clock hour falls outside today's daylight window.
 *
 * One implementation for the sky layer, the ribbon's night shading, and the
 * hero: the ribbon applies today's window to every hour it draws, which is a
 * fair approximation over 48 hours and avoids a SunCalc call per point.
 */
export function isNightHour(hour: number, sun: SunTimes): boolean {
  if (!sun.sunrise || !sun.sunset) return sun.isNight;
  const { sunriseHour, sunsetHour } = sun;
  if (sunriseHour === sunsetHour) return sun.isNight;
  return sunriseHour < sunsetHour
    ? hour < sunriseHour || hour >= sunsetHour
    : hour < sunriseHour && hour >= sunsetHour;
}

/** Short hour label: 0 -> "12a", 13 -> "1p"; "00", "13" in 24-hour mode. */
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

/**
 * The entries that fall inside the next `hours` hours, by timestamp.
 *
 * Providers disagree on step size (OpenWeatherMap is 3-hourly), so slicing a
 * fixed count would put 36 hours under a "Next 12 hours" heading. The window
 * is half-open from the first entry, so a 3-hour source yields 0h..9h (four
 * entries) and an hourly source yields 0h..11h (twelve).
 */
export function hoursWithin(hourly: HourlyWeather[], hours: number): HourlyWeather[] {
  if (hourly.length === 0) return [];
  const start = hourlyInstant(hourly[0]).getTime();
  const end = start + hours * 3600_000;
  const out: HourlyWeather[] = [];
  for (const h of hourly) {
    const at = hourlyInstant(h).getTime();
    if (Number.isNaN(at) || at >= end) break;
    out.push(h);
  }
  return out;
}

/** Alert severities that earn the red treatment rather than amber. */
export function alertTone(severity: WeatherAlert['severity']): { fg: string; isSevere: boolean } {
  const isSevere = severity === 'Extreme' || severity === 'Severe';
  return { fg: isSevere ? '#ef4444' : '#f59e0b', isSevere };
}

/**
 * Rain rate that fills the nowcast bar. Pirate Weather (the only minutely
 * source) reports `precipIntensity` in inches/hour for imperial and mm/hour
 * for metric (`units=ca`), and 0.4 in/h is roughly 10 mm/h: a hard downpour.
 * A single threshold in one unit made every metric drizzle read as a storm.
 */
const FULL_BAR_INTENSITY = { imperial: 0.4, metric: 10 } as const;

/**
 * Plain-language summary of the next hour of precipitation.
 * Returns null when there is nothing worth saying, which also hides the strip.
 *
 * Bar height is intensity alone. Pirate Weather's intensity is already the
 * expected rate for that minute, so the probability field carries no extra
 * signal for the chart and only the intensity is normalised.
 */
export function nowcastVerdict(
  minutely: MinutelyPrecip[],
  units: 'metric' | 'imperial',
  t: WeatherViewProps['t'],
): { text: string; series: number[] } | null {
  if (!minutely || minutely.length === 0) return null;

  const full = FULL_BAR_INTENSITY[units];
  const series = minutely.slice(0, 60).map((m) => Math.max(0, Math.min(1, (m.intensity ?? 0) / full)));
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
