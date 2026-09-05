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
// The set is merged by coverage, not overwritten: a success replaces only
// the rows inside the window it fetched and keeps everything saved outside
// it, so a narrow list-view fetch (or the editor's cold-start health probe)
// can never shrink a month grid's fallback to a few days. Bounded by
// sources x the widest window seen, minus rows older than the retention
// below; resets with the process like lastGoodFetch.
const lastGoodEvents = new Map<string, CalendarEvent[]>();

// Saved rows that ended this long before now are dropped on the next
// success for that source. Measured from now, never from the fetch window:
// a narrow list fetch must not evict the month rows a grid fetch saved. The
// widest in-app grid (12-week multi-week plus padding) looks back under 90
// days, so anything older is dead weight.
const SAVED_EVENT_RETENTION_MS = 90 * 86400000;

// Share of an exceeded budget reserved for events that already ended before
// today, so a dense window can never strip a grid's past days entirely.
const EARLIER_BUDGET_SHARE = 0.25;

/** Event overlaps the half-open window (same test the fetchers apply upstream). */
function overlapsWindow(ev: CalendarEvent, windowStart: Date, windowEnd: Date): boolean {
  return new Date(ev.end) > windowStart && new Date(ev.start) < windowEnd;
}

/**
 * Record per-source last-good events, or substitute them for a failing
 * source. On success the source's saved set becomes: previously saved rows
 * outside this request's window (minus stale ones, and minus any row whose
 * id the fresh rows carry) plus the fresh rows, so the fallback always
 * covers the union of every window that has succeeded. The id check is what
 * keeps a moved appointment from living twice: a wide fetch saves it next
 * week, a narrow fetch then sees it moved into today, and without the check
 * the old copy sits outside the narrow window and survives, so the next
 * failed wide fetch would serve it at both times. Google ids are stable
 * across a move; an iCal id embeds the occurrence start, so a moved iCal
 * event is a new id and its old copy lasts until a window covering it next
 * succeeds. Substituted events are re-filtered to the requested window, so
 * out-of-window strays never eat the budget of healthy sources. Known
 * limitation: entries are keyed by source id alone, so if a source's URL is
 * repointed while the new target is failing, the old target's events serve
 * (badged "saved") until the new one first succeeds. `nowMs` is injectable
 * for tests only.
 */
export function withSavedEvents(
  events: CalendarEvent[],
  results: SourceFetchResult[],
  windowStart: Date,
  windowEnd: Date,
  nowMs: number = Date.now(),
): CalendarEvent[] {
  const out = [...events];
  const retainAfter = nowMs - SAVED_EVENT_RETENTION_MS;
  for (const r of results) {
    if (r.ok) {
      const fresh = events.filter((ev) => ev.sourceId === r.id);
      const freshIds = new Set(fresh.map((ev) => ev.id));
      const kept = (lastGoodEvents.get(r.id) ?? []).filter(
        (ev) =>
          !freshIds.has(ev.id)
          && !overlapsWindow(ev, windowStart, windowEnd)
          && new Date(ev.end).getTime() >= retainAfter,
      );
      lastGoodEvents.set(r.id, [...kept, ...fresh]);
    } else {
      const saved = lastGoodEvents.get(r.id) ?? [];
      out.push(...saved.filter((ev) => overlapsWindow(ev, windowStart, windowEnd)));
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
 * payload stays within 2x the budget). Earlier events (most recent first,
 * nearest today, the ones a grid actually draws) take the leftover budget
 * as before, but never less than a reserved share — leftovers alone were
 * nothing at all once upcoming filled the cap on its own.
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
  // Earlier events take whatever upcoming leaves over, but never less than a
  // reserved share. Leftovers alone came to exactly nothing the moment
  // upcoming filled the budget by itself, which renders as every past day of
  // a grid being empty while the future weeks look fine — the one failure
  // this budget exists to prevent. A quarter covers far more than the ~2
  // weeks of past days any grid draws, so upcoming still keeps three
  // quarters of a cap it would otherwise have taken whole.
  const leftover = maxEvents - Math.min(upcoming.length, maxEvents);
  const earlierBudget = Math.max(leftover, Math.floor(maxEvents * EARLIER_BUDGET_SHARE));
  const keptEarlier = earlier.slice(Math.max(0, earlier.length - earlierBudget));
  const keptUpcoming = upcoming.slice(0, maxEvents - keptEarlier.length);
  const keptEndedToday = endedToday.slice(Math.max(0, endedToday.length - maxEvents));
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
