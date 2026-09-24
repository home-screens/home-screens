import { createJsonStore } from '../json-store';
import type { ForecastDay } from './types';

/**
 * What the hub has seen of today's temperature.
 *
 * By evening no provider still carries the afternoon's true high: NOAA and
 * Environment Canada have only "tonight" left, and OpenWeatherMap, Yr.no and
 * SMHI derive the day from the hours still ahead. The route fetches every few
 * minutes while a display polls, so the hub has watched the day go by; this
 * is where it writes that down. One entry per provider and location, holding
 * the warmest and coldest reading of the current local day, so today's range
 * can be widened to what actually happened (see `reconcileTodayRange`).
 *
 * It also keeps today's forecast row as the provider last reported it. Late
 * in the evening OpenWeatherMap has no slot left for today and its forecast
 * starts tomorrow; the route rebuilds a Today row from this copy so the wall
 * does not lose the day three hours early (see `rebuildTodayRow`).
 *
 * Its own file, like the todo state: it is runtime data the editor must never
 * write back, and it changes every poll.
 */
export interface DayRange {
  /** The local calendar day the readings belong to, `YYYY-MM-DD`. */
  date: string;
  high: number;
  low: number;
  /** The provider's row for this day, from the last poll whose forecast still started with it. */
  forecast?: ForecastDay;
}

interface TodayRecord {
  readings: Record<string, DayRange>;
}

const store = createJsonStore<TodayRecord>({
  path: 'data/weather-today.json',
  defaultValue: { readings: {} },
  errorHandling: 'default',
});

/** One record per provider and place; the units matter because the readings are in them. */
export function readingKey(provider: string, lat: string | number, lon: string | number, units: string): string {
  return `${provider}:${lat}:${lon}:${units}`;
}

/**
 * Fold a reading into its day and return the day's range so far.
 *
 * `date` is the household's today. The reading is taken now, so it belongs to
 * today whatever day the provider's forecast happens to start on. `todayRow`
 * is the provider's row for that day, passed while its forecast still starts
 * with today; the last one passed is kept for the rest of the day. A reading
 * on a new day starts the day over. Other places' entries are kept while they
 * are within a day of this one (a place in another zone can be a day behind
 * or ahead) and dropped once they are older, so the file never holds more
 * than the current day or two. Nothing is written when nothing moved.
 */
export async function recordReading(key: string, date: string, temp: number, todayRow?: ForecastDay): Promise<DayRange> {
  const record = await store.updateAtomic((current) => {
    const existing = current.readings[key];
    const sameDay = existing && existing.date === date ? existing : undefined;
    const row = todayRow ?? sameDay?.forecast;
    const next: DayRange = {
      date,
      high: Math.max(sameDay?.high ?? temp, temp),
      low: Math.min(sameDay?.low ?? temp, temp),
      ...(row ? { forecast: row } : {}),
    };
    const unchanged = sameDay !== undefined && sameDay.high === next.high && sameDay.low === next.low
      && JSON.stringify(sameDay.forecast) === JSON.stringify(next.forecast);
    const keep = (k: string, r: DayRange) => k === key || !isOlderThanADay(r.date, date);
    const stale = Object.entries(current.readings).some(([k, r]) => !keep(k, r));
    if (unchanged && !stale) return current;

    const readings: Record<string, DayRange> = {};
    for (const [k, r] of Object.entries(current.readings)) {
      if (k !== key && keep(k, r)) readings[k] = r;
    }
    readings[key] = next;
    return { readings };
  });
  return record.readings[key];
}

/** Whether `date` is more than one calendar day before `than` (both `YYYY-MM-DD`). */
function isOlderThanADay(date: string, than: string): boolean {
  const ms = Date.parse(`${than}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) ? ms > 86_400_000 : date < than;
}

/** The day's range so far for a key, if the hub has one for that day. */
export async function readDayRange(key: string, date: string): Promise<DayRange | undefined> {
  const { readings } = await store.read();
  const r = readings[key];
  return r && r.date === date ? r : undefined;
}
