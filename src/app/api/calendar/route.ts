import { NextResponse } from 'next/server';
import { startOfDay } from 'date-fns';
import { fetchCalendarEvents } from '@/lib/google-calendar';
import { readConfig } from '@/lib/config';
import { cachedProxyRoute, errorResponse } from '@/lib/api-utils';
import { compareEventStarts, parseEventWallTime } from '@/lib/calendar-utils';
import { DEFAULT_CALENDAR_DAYS_AHEAD } from '@/lib/constants';
import { fetchHolidayEvents } from '@/lib/holidays';
import { mergeSourceStatus, recordSourceStatus, type SourceFetchResult } from '@/lib/calendar-source-status';
import type { CalendarEvent, CalendarSourceStatus, ICalSource, ICloudSource } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('calendar');

/** The `/api/calendar` payload: merged events plus per-source health. */
export interface CalendarPayload {
  events: CalendarEvent[];
  sourceStatus: CalendarSourceStatus[];
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
function withSavedEvents(
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

export const dynamic = 'force-dynamic';

interface CalendarParams {
  calendarIds: string[];
  icalSources: ICalSource[];
  icloudSources: ICloudSource[];
  holidayCountry: string | undefined;
  hideDeclined: boolean;
  timeMin: string;
  timeMax: string;
  maxEvents: number;
  timezone: string | undefined;
  icalKey: string;
  icloudKey: string;
}

// Hard ceiling on the requested window span. Bounds two costs that scale with
// span and aren't capped by maxEvents: recurring-event expansion in the ICS
// parser, and the number of distinct cache keys (which embed the window). The
// widest in-app request is a ~6-week month grid, so this only ever clamps a
// hand-crafted LAN request.
const MAX_WINDOW_MS = 400 * 86400000;

const { GET, cache } = cachedProxyRoute<CalendarPayload, CalendarParams>({
  auth: 'display',
  ttlMs: 2 * 60 * 1000,
  prepare: async (request) => {
    const searchParams = request.nextUrl.searchParams;
    let config;
    try {
      config = await readConfig();
    } catch (error) {
      throw errorResponse(error, 'Failed to read config');
    }

    const calendarIdsParam = searchParams.get('calendarIds');
    const calendarIds = calendarIdsParam
      ? calendarIdsParam.split(',').filter(Boolean)
      : config.settings.calendar.googleCalendarIds?.length
        ? config.settings.calendar.googleCalendarIds
        : config.settings.calendar.googleCalendarId
          ? [config.settings.calendar.googleCalendarId]
          : [];

    const icalSources = (config.settings.calendar.icalSources ?? []).filter(s => s.enabled);
    const icloudSources = (config.settings.calendar.icloudSources ?? []).filter(s => s.enabled);
    const holidayCountry = config.settings.calendar.holidayCountry;
    const hideDeclined = config.settings.calendar.hideDeclined ?? false;
    const daysAhead = config.settings.calendar.daysAhead ?? DEFAULT_CALENDAR_DAYS_AHEAD;

    // Round to nearest minute so cache keys are reusable
    const nowMs = Math.floor(Date.now() / 60000) * 60000;
    // Optional window overrides (displays widen the window for month/week
    // grid views). Unparseable values fall back to the defaults, and both
    // are re-serialized so cache keys stay canonical.
    const parseTimeParam = (value: string | null): number | null => {
      if (!value) return null;
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? ms : null;
    };
    const defaultWindowMs = daysAhead * 86400000;
    const timeMinMs = parseTimeParam(searchParams.get('timeMin')) ?? nowMs;
    let timeMaxMs = parseTimeParam(searchParams.get('timeMax')) ?? nowMs + defaultWindowMs;
    if (timeMaxMs <= timeMinMs) timeMaxMs = timeMinMs + defaultWindowMs;
    if (timeMaxMs - timeMinMs > MAX_WINDOW_MS) timeMaxMs = timeMinMs + MAX_WINDOW_MS;
    const timeMin = new Date(timeMinMs).toISOString();
    const timeMax = new Date(timeMaxMs).toISOString();

    const configuredMax = config.settings.calendar.maxEvents ?? 100;
    // `maxEvents` bounds the *upcoming* list. When a grid view widens the
    // window into the past (or far into the future), that budget can't cover a
    // whole busy month, so scale it to the window and keep the density
    // (events/day) the default window implies. Never below the configured cap.
    const windowMs = timeMaxMs - timeMinMs;
    const maxEvents = windowMs > defaultWindowMs
      ? Math.max(configuredMax, Math.ceil((configuredMax * windowMs) / defaultWindowMs))
      : configuredMax;

    const icalKey = icalSources.map(s => `${s.id}:${s.color}:${s.url}`).join(',');
    const icloudKey = icloudSources.map(s => `${s.id}:${s.color}:${s.kind}:${s.url}`).join(',');

    const timezone = config.settings.timezone;

    return { calendarIds, icalSources, icloudSources, holidayCountry, hideDeclined, timeMin, timeMax, maxEvents, timezone, icalKey, icloudKey };
  },
  cacheKey: ({ calendarIds, icalKey, icloudKey, holidayCountry, hideDeclined, timeMin, timeMax, maxEvents, timezone }) =>
    `g:${[...calendarIds].sort().join(',')};i:${icalKey};ic:${icloudKey};h:${holidayCountry ?? ''};hd:${hideDeclined};${timeMin}:${timeMax}:${maxEvents};tz:${timezone ?? ''}`,
  execute: async ({ calendarIds, icalSources, icloudSources, holidayCountry, hideDeclined, timeMin, timeMax, maxEvents, timezone }) => {
    if (calendarIds.length === 0 && icalSources.length === 0 && icloudSources.length === 0 && !holidayCountry) {
      return NextResponse.json(
        { error: 'No calendars configured. Add a Google account, iCloud account, or ICS feed in editor settings.' },
        { status: 400 },
      );
    }

    // Fetch the four source families concurrently — each already isolates
    // its own sources internally, so one slow ICS feed must not stall the
    // Google/iCloud round trips. A family is "ok" only when at least one of
    // its sources actually succeeded (the fetchers isolate per-source
    // failures and resolve regardless), so the all-failed guard below still
    // fires when every configured source is down.
    const windowStart = new Date(timeMin);
    const windowEnd = new Date(timeMax);
    interface FamilyOutcome { events: CalendarEvent[]; results: SourceFetchResult[]; ok: boolean }
    const NO_FAMILY: FamilyOutcome = { events: [], results: [], ok: false };
    const someOk = (results: SourceFetchResult[]) => results.some((r) => r.ok);

    const googleFamily = async (): Promise<FamilyOutcome> => {
      if (!calendarIds.length) return NO_FAMILY;
      try {
        const google = await fetchCalendarEvents(calendarIds, timeMin, timeMax, hideDeclined);
        return { events: withSavedEvents(google.events, google.results, windowStart, windowEnd), results: google.results, ok: someOk(google.results) };
      } catch (error) {
        // Family-level failure (auth, network to Google): every id fails.
        // The email local part stands in for the calendar name the API would
        // have supplied, matching the editor's own fallback.
        log.error('Google Calendar fetch failed', error);
        const failed = calendarIds.map((id): SourceFetchResult =>
          ({ id, name: id.includes('@') ? id.split('@')[0] : undefined, ok: false, error: "Couldn't reach Google Calendar" }));
        return { events: withSavedEvents([], failed, windowStart, windowEnd), results: failed, ok: false };
      }
    };

    const icalFamily = async (): Promise<FamilyOutcome> => {
      if (!icalSources.length) return NO_FAMILY;
      try {
        // Lazy-import so the route still works when node-ical isn't installed
        const { fetchICalEvents } = await import('@/lib/ical-calendar');
        const ical = await fetchICalEvents(icalSources, timeMin, timeMax);
        return { events: withSavedEvents(ical.events, ical.results, windowStart, windowEnd), results: ical.results, ok: someOk(ical.results) };
      } catch (error) {
        log.error('ICS calendar fetch failed', error);
        const failed = icalSources.map((s): SourceFetchResult =>
          ({ id: s.id, name: s.name, ok: false, error: 'Could not reach the link' }));
        return { events: withSavedEvents([], failed, windowStart, windowEnd), results: failed, ok: false };
      }
    };

    const icloudFamily = async (): Promise<FamilyOutcome> => {
      if (!icloudSources.length) return NO_FAMILY;
      try {
        // Lazy-import so the route still works when tsdav isn't installed
        const { fetchICloudEvents } = await import('@/lib/caldav-calendar');
        const { listICloudAccounts } = await import('@/lib/icloud-accounts');
        const accounts = await listICloudAccounts();
        const icloud = await fetchICloudEvents(icloudSources, accounts, timeMin, timeMax);
        return { events: withSavedEvents(icloud.events, icloud.results, windowStart, windowEnd), results: icloud.results, ok: someOk(icloud.results) };
      } catch (error) {
        log.error('iCloud calendar fetch failed', error);
        const failed = icloudSources.map((s): SourceFetchResult =>
          ({ id: s.id, name: s.name, ok: false, error: "Couldn't reach iCloud" }));
        return { events: withSavedEvents([], failed, windowStart, windowEnd), results: failed, ok: false };
      }
    };

    const holidayFamily = async (): Promise<FamilyOutcome> => {
      if (!holidayCountry) return NO_FAMILY;
      try {
        const fetched = await fetchHolidayEvents(holidayCountry, timeMin, timeMax);
        const result: SourceFetchResult = { id: 'holidays', name: 'Public Holidays', ok: true };
        return { events: withSavedEvents(fetched, [result], windowStart, windowEnd), results: [result], ok: true };
      } catch (error) {
        log.error('Holiday fetch failed', error);
        const result: SourceFetchResult = { id: 'holidays', name: 'Public Holidays', ok: false, error: "Couldn't load the holiday list" };
        return { events: withSavedEvents([], [result], windowStart, windowEnd), results: [result], ok: false };
      }
    };

    const [google, ical, icloud, holidays] = await Promise.all([
      googleFamily(), icalFamily(), icloudFamily(), holidayFamily(),
    ]);
    const sourceResults: SourceFetchResult[] = [
      ...google.results, ...ical.results, ...icloud.results, ...holidays.results,
    ];

    // If every attempted source failed AND nothing could be substituted from
    // the saved events, return an error instead of caching empty —
    // useFetchData keeps the last-good body on a failed response. When saved
    // events exist, the 200 payload is the richer answer: accurate per-source
    // statuses plus the kept rows the display badges as "saved".
    if (!google.ok && !ical.ok && !icloud.ok && !holidays.ok) {
      const anySaved =
        google.events.length || ical.events.length || icloud.events.length || holidays.events.length;
      if (!anySaved) {
        return errorResponse(null, 'Failed to fetch calendar events') as NextResponse;
      }
    }

    const sourceStatus = mergeSourceStatus(sourceResults, lastGoodFetch, Date.now());
    recordSourceStatus(sourceStatus);

    const merged = [...google.events, ...ical.events, ...icloud.events, ...holidays.events]
      .sort((a, b) => compareEventStarts(a.start, b.start));
    if (merged.length <= maxEvents) return { events: merged, sourceStatus };

    // Upcoming-first budgeting, applied only when even the window-scaled cap
    // is exceeded (a pathologically dense window). A plain ascending slice
    // would spend the whole budget on the earliest events — with a widened
    // timeMin, that's the past — starving upcoming events and emptying later
    // grid weeks and any co-present agenda/daily view sharing this payload.
    // Keep the nearest maxEvents upcoming events (the pre-widening guarantee).
    // Events that already ended today ride alongside that budget rather than
    // inside it: the agenda's agendaShowFinishedToday and the daily /
    // day-timeline dimming exist to show them, nothing client-side could
    // recover them if dropped here, and a single day bounds their count
    // (capped at maxEvents anyway, most recent first, so the payload stays
    // within 2x the budget). Leftover budget backfills the most recent
    // earlier events (nearest today, most likely visible in a grid). "Today"
    // is the display's day, not the server's. With the default timeMin =
    // now, everything is upcoming and this degenerates to the original slice.
    const nowWall = parseEventWallTime(new Date().toISOString(), timezone);
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
    return {
      events: [...keptEarlier, ...keptEndedToday, ...keptUpcoming].sort((a, b) => compareEventStarts(a.start, b.start)),
      sourceStatus,
    };
  },
  errorMessage: 'Failed to fetch calendar events',
});

/** @internal exported for test cleanup */
export { GET, cache };
