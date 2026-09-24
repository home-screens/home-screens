/** Shared daily-forecast aggregation for providers that expose an hourly/periodic
 * timeseries but no daily endpoint (Yr.no, SMHI). Providers map their response
 * entries to `DailySample`s; the aggregation buckets them by date and derives
 * high/low, the dominant condition symbol, summed precipitation, max
 * precipitation probability, and averaged humidity/wind.
 *
 * All sample values are provider-raw metric (°C, m/s, mm) — unit conversion
 * and rounding policy stay with the caller, since providers deliberately
 * differ there (e.g. Yr rounds precip probability, SMHI reports it raw).
 *
 * `forecastDate` is shared more widely: every provider that dates forecast
 * days from real instants keys them with it.
 */

import { isoDateInTZ } from '../timezone';

/**
 * The calendar day a forecast instant belongs to at the forecast's place, as
 * `YYYY-MM-DD`.
 *
 * Forecast days are days on the location's own calendar: the wall labels
 * `forecast[0]` "Today" and the hub records today's high and low under its
 * date. Keying real instants by `toISOString()` takes the UTC day instead, so
 * in Chicago after 7 pm today's samples landed in tomorrow's bucket, and east
 * of UTC every local-midnight timestamp fell on the day before.
 *
 * `zone` is either an IANA zone or a fixed offset from UTC in seconds (what
 * OpenWeatherMap reports). Without one the UTC day is the only honest answer.
 * An unparseable instant has no day and yields `''`.
 */
export function forecastDate(instant: Date, zone?: string | number): string {
  if (Number.isNaN(instant.getTime())) return '';
  if (typeof zone === 'number') return new Date(instant.getTime() + zone * 1000).toISOString().slice(0, 10);
  if (zone) return isoDateInTZ(instant, zone);
  return instant.toISOString().slice(0, 10);
}

/**
 * The forecast from the household's today on. A forecast fetched before
 * midnight still leads with that day until the next refresh, and a view that
 * features `forecast[0]` would keep showing yesterday for up to ten minutes.
 * Dates are `YYYY-MM-DD`, so they compare as strings.
 */
export function forecastFromToday<T extends { date: string }>(forecast: T[], todayISO: string): T[] {
  return forecast[0] && forecast[0].date < todayISO ? forecast.filter((day) => day.date >= todayISO) : forecast;
}

/** One timeseries entry, reduced to the fields daily aggregation needs. */
export interface DailySample<S> {
  /** ISO date (YYYY-MM-DD) the sample belongs to. */
  date: string;
  tempC?: number;
  humidity?: number;
  windSpeedMs?: number;
  /** Provider condition symbol; the most frequent one per day wins. */
  symbol?: S;
  /** Precipitation amount (mm) for the sample window, summed per day. */
  precipMm?: number;
  /** Precipitation probability (0–100), max per day. */
  precipProb?: number;
}

export interface DailyAggregate<S> {
  date: string;
  /** Day's max/min sampled temperature in °C; 0 when the day had no samples. */
  highC: number;
  lowC: number;
  symbol: S | undefined;
  precipMm: number;
  precipProb: number;
  /** Averaged and rounded; undefined when the day had no humidity samples. */
  humidity: number | undefined;
  /** Averaged, unrounded m/s; undefined when the day had no wind samples. */
  windSpeedMs: number | undefined;
}

interface DailyBucket<S> {
  temps: number[];
  symbols: Map<S, number>;
  precipMm: number;
  precipProb: number;
  humidities: number[];
  windSpeedsMs: number[];
}

/** Most frequent key; ties resolve to the first key to reach the max count. */
export function pickDominant<S>(counts: Map<S, number>): S | undefined {
  let dominant: S | undefined;
  let dominantCount = 0;
  for (const [key, count] of counts) {
    if (count > dominantCount) {
      dominant = key;
      dominantCount = count;
    }
  }
  return dominant;
}

export function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Bucket samples by date (preserving first-seen date order) and aggregate
 * each day. `maxDays` caps the output to the first N dates. Samples dated
 * before `fromDate` (today, `YYYY-MM-DD`) are dropped: a timeseries that opens
 * with the hour just gone would otherwise lead with a one-sample "yesterday"
 * just after midnight, and the wall labels the first day "Today". */
export function aggregateDaily<S>(
  samples: Iterable<DailySample<S>>,
  maxDays: number,
  fromDate?: string,
): DailyAggregate<S>[] {
  const byDate = new Map<string, DailyBucket<S>>();

  for (const sample of samples) {
    if (fromDate && sample.date < fromDate) continue;
    let day = byDate.get(sample.date);
    if (!day) {
      day = { temps: [], symbols: new Map(), precipMm: 0, precipProb: 0, humidities: [], windSpeedsMs: [] };
      byDate.set(sample.date, day);
    }
    if (sample.tempC != null) day.temps.push(sample.tempC);
    if (sample.humidity != null) day.humidities.push(sample.humidity);
    if (sample.windSpeedMs != null) day.windSpeedsMs.push(sample.windSpeedMs);
    if (sample.symbol != null) day.symbols.set(sample.symbol, (day.symbols.get(sample.symbol) ?? 0) + 1);
    if (sample.precipMm != null) day.precipMm += sample.precipMm;
    if (sample.precipProb != null && sample.precipProb > day.precipProb) {
      day.precipProb = sample.precipProb;
    }
  }

  return Array.from(byDate.entries()).slice(0, maxDays).map(([date, day]) => {
    const avgHumidity = average(day.humidities);
    return {
      date,
      highC: day.temps.length ? Math.max(...day.temps) : 0,
      lowC: day.temps.length ? Math.min(...day.temps) : 0,
      symbol: pickDominant(day.symbols),
      precipMm: day.precipMm,
      precipProb: day.precipProb,
      humidity: avgHumidity != null ? Math.round(avgHumidity) : undefined,
      windSpeedMs: average(day.windSpeedsMs),
    };
  });
}
