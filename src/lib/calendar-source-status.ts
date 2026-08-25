import { startOfDay } from 'date-fns';
import type { CalendarEvent, CalendarSourceStatus } from '@/types/config';
import { compareEventStarts, parseEventWallTime } from '@/lib/calendar-utils';

/**
 * Per-source health for the shared calendar fetch: fetch-outcome folding,
 * last-good bookkeeping (times and saved events), and the upcoming-first
 * event budget. All the process-global state behind "failure does not mean
 * empty" lives in this one file; the route composes these pieces.
 */

/**
 * Per-source outcome of one fetch attempt, before last-success bookkeeping.
 * Produced by the google / iCal / iCloud / holiday fetchers.
 */
export interface SourceFetchResult {
  id: string;
  name?: string;
  ok: boolean;
  /** Plain, family-friendly wording — the fallback when `messageKey` is absent. */
  error?: string;
  /** i18n key under the editor's `settings.calendarPage.health.errors.*`; preferred over `error` at render time. */
  messageKey?: string;
  messageParams?: Record<string, string | number>;
}

/**
 * Fold a per-item `Promise.allSettled` fetch into `{ events, results }`.
 * The `items[i]` ↔ `settled[i]` alignment lives here once — hand-rolled
 * copies of this fold are exactly where a filtered input list silently
 * breaks the correspondence. Items that must fail before fetching (invalid
 * URLs, missing accounts) should be mapped out of `items` first and their
 * results merged by the caller; `onRejected` supplies the results for an
 * item whose promise rejected.
 */
export async function settleSourceFetches<S>(
  items: S[],
  fetchOne: (item: S) => Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }>,
  onRejected: (item: S, reason: unknown) => SourceFetchResult[],
): Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }> {
  const settled = await Promise.allSettled(items.map(fetchOne));
  const events: CalendarEvent[] = [];
  const results: SourceFetchResult[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      events.push(...outcome.value.events);
      results.push(...outcome.value.results);
    } else {
      results.push(...onRejected(items[i], outcome.reason));
    }
  });
  return { events, results };
}

// Last successful fetch time per source id, for "not updating since" wording.
// Per-process, like the display statusMap — resets on server restart, which
// simply means a source's first failure after boot has no since-time yet.
const lastGoodFetch = new Map<string, number>();

// Last successful events per source id. A failing source keeps serving its
// saved events (badged "saved" on the display) instead of silently vanishing.
// Best-effort: saved events come from that source's last successful window,
// which may not fully cover a different requested window. Bounded by
// sources × window size; resets with the process like lastGoodFetch.
const lastGoodEvents = new Map<string, CalendarEvent[]>();

/**
 * Record per-source last-good events, or substitute them for a failing
 * source. Substituted events are re-filtered to the requested window — the
 * saved set may come from a different window, and out-of-window strays would
 * eat the maxEvents budget of healthy sources. Known limitation: entries are
 * keyed by source id alone, so if a source's URL is repointed while the new
 * target is failing, the old target's events serve (badged "saved") until
 * the new one first succeeds.
 */
export function withSavedEvents(
  events: CalendarEvent[],
  results: SourceFetchResult[],
  windowStart: Date,
  windowEnd: Date,
): CalendarEvent[] {
  const out = [...events];
  for (const r of results) {
    if (r.ok) {
      lastGoodEvents.set(r.id, events.filter((ev) => ev.sourceId === r.id));
    } else {
      const saved = lastGoodEvents.get(r.id) ?? [];
      out.push(...saved.filter((ev) => new Date(ev.end) > windowStart && new Date(ev.start) < windowEnd));
    }
  }
  return out;
}

/**
 * Merge one fetch's per-source results with the per-process last-success
 * times. A source that succeeded stamps `now` into the map and reports it as
 * `fetchedAt`; a failing source reports its last success (null if it has
 * never succeeded this session), which is what "not updating since 7:10 AM"
 * renders from.
 */
export function mergeSourceStatus(
  results: SourceFetchResult[],
  now: number,
): CalendarSourceStatus[] {
  return results.map((r) => {
    if (r.ok) {
      lastGoodFetch.set(r.id, now);
      return { ...r, fetchedAt: now };
    }
    return { ...r, fetchedAt: lastGoodFetch.get(r.id) ?? null };
  });
}

/**
 * Upcoming-first budgeting of the merged feed, applied only when even the
 * window-scaled cap is exceeded (a pathologically dense window). A plain
 * ascending slice would spend the whole budget on the earliest events —
 * with a widened timeMin, that's the past — starving upcoming events and
 * emptying later grid weeks and any co-present agenda/daily view sharing
 * this payload. Keep the nearest maxEvents upcoming events (the
 * pre-widening guarantee). Events that already ended today ride alongside
 * that budget rather than inside it: the agenda's agendaShowFinishedToday
 * and the daily / day-timeline dimming exist to show them, nothing
 * client-side could recover them if dropped here, and a single day bounds
 * their count (capped at maxEvents anyway, most recent first, so the
 * payload stays within 2x the budget). Leftover budget backfills the most
 * recent earlier events (nearest today, most likely visible in a grid).
 * "Today" is the display's day, not the server's. With the default
 * timeMin = now, everything is upcoming and this degenerates to the
 * original slice. `nowIso` is injectable for tests only.
 */
export function budgetEvents(
  merged: CalendarEvent[],
  maxEvents: number,
  timezone: string | undefined,
  nowIso: string = new Date().toISOString(),
): CalendarEvent[] {
  if (merged.length <= maxEvents) return merged;
  const nowWall = parseEventWallTime(nowIso, timezone);
  const todayStart = startOfDay(nowWall);
  // Partitioned by else-chain so an unparseable end (NaN compares false)
  // lands in `earlier`, the same "not upcoming" bucket it always had.
  const upcoming: CalendarEvent[] = [];
  const endedToday: CalendarEvent[] = [];
  const earlier: CalendarEvent[] = [];
  for (const ev of merged) {
    const end = parseEventWallTime(ev.end, timezone);
    if (end > nowWall) upcoming.push(ev);
    else if (end > todayStart) endedToday.push(ev);
    else earlier.push(ev);
  }
  const keptUpcoming = upcoming.slice(0, maxEvents);
  const keptEndedToday = endedToday.slice(Math.max(0, endedToday.length - maxEvents));
  const keptEarlier = earlier.slice(Math.max(0, earlier.length - (maxEvents - keptUpcoming.length)));
  return [...keptEarlier, ...keptEndedToday, ...keptUpcoming].sort((a, b) => compareEventStarts(a.start, b.start));
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

/** @internal exported for test isolation */
export function resetCalendarSourceState(): void {
  lastGoodFetch.clear();
  lastGoodEvents.clear();
  latestSourceStatus = [];
}
