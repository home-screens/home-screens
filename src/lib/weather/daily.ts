/** Shared daily-forecast aggregation for providers that expose an hourly/periodic
 * timeseries but no daily endpoint (Yr.no, SMHI). Providers map their response
 * entries to `DailySample`s; the aggregation buckets them by date and derives
 * high/low, the dominant condition symbol, summed precipitation, max
 * precipitation probability, and averaged humidity/wind.
 *
 * All sample values are provider-raw metric (°C, m/s, mm) — unit conversion
 * and rounding policy stay with the caller, since providers deliberately
 * differ there (e.g. Yr rounds precip probability, SMHI reports it raw).
 */

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
 * each day. `maxDays` caps the output to the first N dates. */
export function aggregateDaily<S>(
  samples: Iterable<DailySample<S>>,
  maxDays: number,
): DailyAggregate<S>[] {
  const byDate = new Map<string, DailyBucket<S>>();

  for (const sample of samples) {
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
