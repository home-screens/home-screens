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

/**
 * Canvas and card padding, in `u`.
 *
 * Single-sourced because two consumers have to reconstruct a rendered width
 * *without measuring* (measuring inside the fit loop would re-render it): the
 * Panorama ribbon's viewBox aspect and the Hourly meteogram's label stride.
 * Both used to carry the literal `u * 8.8` / `u * 4.6` and a comment naming
 * the padding they were copied from, which is exactly the kind of note that
 * goes stale the first time the padding changes.
 */
export const CANVAS_PAD_X_U = 4.4;
export const CANVAS_PAD_Y_U = 4;
export const CARD_PAD_X_U = 2.3;
export const CARD_PAD_Y_U = 2.1;

/** Rain chance below which a forecast day shows no percentage, so a dry week is not a column of "0%". */
export const DAILY_RAIN_SHOWN_PCT = 8;
/** Rain chance below which an hourly entry draws no bar. */
export const HOURLY_RAIN_SHOWN_PCT = 5;

/** `daysToShow` is 3..7; anything else (unset, NaN, out of range) is 7. */
export function clampDaysToShow(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 7;
  return Math.max(3, Math.min(7, value));
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
  const parts = cachedFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (h % 24) + m / 60;
}

/**
 * `Intl.DateTimeFormat` construction is the expensive half of formatting
 * (about 25us each in Node, far more on a Pi). The Hourly view formats every
 * entry on every fit-loop probe and every clock tick, so the formatters are
 * cached by their options rather than rebuilt per call. `useMemo` in the
 * views would not help: `scale` changes on every probe.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();
export function cachedFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, f);
  }
  return f;
}

/** The local calendar day an instant falls on, as a sortable `YYYY-MM-DD`-like key. */
export function tzDayKey(date: Date, timezone?: string): string {
  if (!timezone) return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  return cachedFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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

/**
 * The entries the Hour-by-hour view draws.
 *
 * The next 24 hours, widened to 48 when the provider steps every 3 hours
 * (OpenWeatherMap): eight rows on a 1920px-tall canvas is a list swimming in
 * slack, sixteen is a list. A source that simply runs out inside 24 hours is
 * left alone — there is nothing further out to widen into.
 */
export function timelineHours(hourly: HourlyWeather[]): HourlyWeather[] {
  const day = hoursWithin(hourly, 24);
  if (day.length >= 12 || day.length === hourly.length) return day;
  return hoursWithin(hourly, 48);
}

/**
 * Hours a run of entries covers, counting the last entry's own step: 24
 * hourly readings are "Next 24 hours", not 23, and 16 three-hourly ones are
 * 48. Last-minus-first alone is one step short.
 *
 * Measured on the provider's grid. OpenWeatherMap's first entry is the live
 * observation, which sits anywhere from a minute to three hours before the
 * first slot, so a span that counted that partial step wobbled between "45"
 * and "51" as the clock ticked. The step is taken from the last two entries
 * (always on the grid) and the span is rounded *down* to whole steps, so the
 * observation's fraction of a step never counts.
 */
export function spanHours(hrs: HourlyWeather[]): number {
  if (hrs.length < 2) return hrs.length;
  const first = hourlyInstant(hrs[0]).getTime();
  const last = hourlyInstant(hrs[hrs.length - 1]).getTime();
  const step = last - hourlyInstant(hrs[hrs.length - 2]).getTime();
  if (step <= 0) return hrs.length;
  const steps = Math.floor((last - first) / step + 1 + 1e-9);
  return Math.round((steps * step) / 3600_000);
}

export interface TimelineMark {
  /** Wall-clock hour (fractional) in the display timezone. */
  hour: number;
  /** First entry of a new local calendar day (never the first entry, which is "Now"). */
  midnight: boolean;
}

/**
 * Where each entry sits on the local clock, and which entries open a new day.
 *
 * A day boundary is a *change of local calendar day* between neighbours, not
 * "this entry's hour is 0". OpenWeatherMap's slots sit on the UTC grid
 * (00/03/06Z...), so a local 00:xx entry only exists where the UTC offset is
 * a multiple of three hours: US Central in summer and all of continental
 * Europe had no midnight row at all, and the list ran 48 hours with no day
 * label anywhere. Comparing day keys finds the boundary wherever it falls.
 */
export function timelineMarks(hrs: HourlyWeather[], timezone?: string): TimelineMark[] {
  let prevDay: string | null = null;
  return hrs.map((h, i) => {
    const at = hourlyInstant(h);
    const day = tzDayKey(at, timezone);
    const midnight = i > 0 && prevDay !== null && day !== prevDay;
    prevDay = day;
    return { hour: tzHour(at, timezone), midnight };
  });
}

/**
 * A shared temperature axis: `k(t)` is the 0-1 position of a temperature
 * between the run's coldest and warmest. A flat run (every value equal) puts
 * everything at 0 rather than dividing by zero.
 */
export function temperatureAxis(temps: number[]): { min: number; max: number; k: (t: number) => number } {
  const min = temps.length ? Math.min(...temps) : 0;
  const max = temps.length ? Math.max(...temps) : 1;
  const range = max - min || 1;
  return { min, max, k: (t) => (t - min) / range };
}

export interface WeekRange {
  days: ForecastDay[];
  weekMin: number;
  weekMax: number;
  /** 0-100 position of a temperature on the week's shared scale, clamped. */
  pct: (t: number) => number;
  /** Today's live temperature, for the "now" ring. */
  nowTemp: number | undefined;
}

/**
 * The days a forecast list shows and the shared scale their range bars sit
 * on. One implementation for Panorama's 7-day strip and the Week view, which
 * used to carry line-for-line copies of each other's arithmetic.
 */
export function weekRange(p: { forecast: ForecastDay[]; hourly: HourlyWeather[]; config: { daysToShow?: number } }): WeekRange {
  const days = p.forecast.slice(0, clampDaysToShow(p.config.daysToShow));
  const weekMin = days.length ? Math.min(...days.map((d) => d.low)) : 0;
  const weekMax = days.length ? Math.max(...days.map((d) => d.high)) : 1;
  const span = weekMax - weekMin || 1;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - weekMin) / span) * 100));
  return { days, weekMin, weekMax, pct, nowTemp: p.hourly[0]?.temp };
}

/** Minimum share of the track a range bar occupies, so a flat day still draws a bar. */
export const MIN_BAR_PCT = 3;

/**
 * How many columns apart labels must sit to avoid touching, given the column
 * pitch and the widest label. 1 means every column is labelled. Used by the
 * landscape meteogram, whose 24 columns are ~72px wide on a 1920 canvas —
 * fine at medium type, but a 4x-large "84°" is wider than that.
 */
export function labelStride(columnPx: number, labelPx: number): number {
  if (columnPx <= 0) return 1;
  return Math.max(1, Math.ceil((labelPx * 1.15) / columnPx));
}

/**
 * Pixel pitch of one meteogram column, from the canvas width: the canvas and
 * card padding come off, then the gutter, and the rest is shared by `n`
 * columns. Computed rather than measured so the fit loop is not re-entered.
 */
export function meteogramColumnPx(canvasWidth: number, u: number, gutterPx: number, n: number): number {
  if (n <= 0) return 0;
  return (canvasWidth - u * CANVAS_PAD_X_U * 2 - u * CARD_PAD_X_U * 2 - gutterPx) / n;
}

/** Whether column `i` carries a value label (temperature, rain, wind) at this stride. */
export function valueLabelled(i: number, stride: number): boolean {
  return i % stride === 0;
}

/**
 * Whether column `i` carries an hour label. "Now" and a day name always show;
 * when columns are thinned, the neighbours of a forced label step aside for it.
 */
export function hourLabelled(i: number, stride: number, midnight: boolean[]): boolean {
  if (i === 0 || midnight[i]) return true;
  if (!valueLabelled(i, stride)) return false;
  return stride === 1 || !(midnight[i - 1] || midnight[i + 1]);
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
