import type { CalendarSourceStatus } from '@/types/config';

/**
 * Per-source outcome of one fetch attempt, before last-success bookkeeping.
 * Produced by the google / iCal / iCloud / holiday fetchers.
 */
export interface SourceFetchResult {
  id: string;
  name?: string;
  ok: boolean;
  /** Plain, family-friendly wording — shown verbatim in editor settings. */
  error?: string;
}

/**
 * Merge one fetch's per-source results with the per-process last-success
 * times. A source that succeeded stamps `now` into the map and reports it as
 * `fetchedAt`; a failing source reports its last success (null if it has
 * never succeeded this session), which is what "not updating since 7:10 AM"
 * renders from. The map is mutated in place — the route owns one for the
 * process lifetime.
 */
export function mergeSourceStatus(
  results: SourceFetchResult[],
  lastGood: Map<string, number>,
  now: number,
): CalendarSourceStatus[] {
  return results.map((r) => {
    if (r.ok) {
      lastGood.set(r.id, now);
      return { ...r, fetchedAt: now };
    }
    return { ...r, fetchedAt: lastGood.get(r.id) ?? null };
  });
}

// Most recent sourceStatus computed by any /api/calendar fetch, for the
// read-only /api/calendar/status endpoint. The editor's health panel reads
// this instead of triggering its own calendar fetch — a fetch with the
// editor's default window would miss every display's cache entry AND
// overwrite the per-source saved events with a narrower slice.
let latestSourceStatus: CalendarSourceStatus[] = [];

export function recordSourceStatus(status: CalendarSourceStatus[]): void {
  latestSourceStatus = status;
}

export function getLatestSourceStatus(): CalendarSourceStatus[] {
  return latestSourceStatus;
}
