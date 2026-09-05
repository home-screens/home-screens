import { createJsonStore } from '../json-store';

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
 * Its own file, like the todo state: it is runtime data the editor must never
 * write back, and it changes every poll.
 */
export interface DayRange {
  /** The local calendar day the readings belong to, `YYYY-MM-DD`. */
  date: string;
  high: number;
  low: number;
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
 * `date` is the forecast's own day-0 date, which every provider reports in
 * the location's local calendar, so the record and the range it later widens
 * are bucketed the same way with no timezone in between. A reading on a new
 * day starts the day over. Other places' entries are kept while they are
 * within a day of this one (a place in another zone can be a day behind or
 * ahead) and dropped once they are older, so the file never holds more than
 * the current day or two. Nothing is written when the range did not move.
 */
export async function recordReading(key: string, date: string, temp: number): Promise<DayRange> {
  const record = await store.updateAtomic((current) => {
    const existing = current.readings[key];
    const next: DayRange = existing && existing.date === date
      ? { date, high: Math.max(existing.high, temp), low: Math.min(existing.low, temp) }
      : { date, high: temp, low: temp };
    const unchanged = existing && existing.date === next.date && existing.high === next.high && existing.low === next.low;
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
