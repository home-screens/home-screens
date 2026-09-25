import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { cachedProxyRoute, errorResponse, SetupError } from '@/lib/api-utils';
import { compareEventStarts, householdDayStart } from '@/lib/calendar-utils';
import { CALENDAR_FETCH_MAX_EVENTS, CALENDAR_MAX_WINDOW_MS, CALENDAR_REFRESH_MS, DEFAULT_CALENDAR_DAYS_AHEAD } from '@/lib/constants';
import { fetchHolidayEvents } from '@/lib/holidays';
import { budgetEvents, mergeSourceStatus, recordSourceStatus, withSavedEvents, type SourceFetchResult } from '@/lib/calendar-source-status';
import type { CalendarEvent, CalendarSourceStatus, ICalSource, ICloudSource } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('calendar');

/** Per-source `messageKey` for a Google calendar whose sign-in is missing or expired. */
const GOOGLE_NOT_SIGNED_IN = 'googleNotSignedIn';

/** The `/api/calendar` payload: merged events plus per-source health. */
interface CalendarPayload {
  events: CalendarEvent[];
  sourceStatus: CalendarSourceStatus[];
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
  timezone: string | undefined;
  icalKey: string;
  icloudKey: string;
}

const { GET, cache } = cachedProxyRoute<CalendarPayload, CalendarParams>({
  auth: 'display',
  // Just under the walls' poll, so each wall still gets fresh events every
  // poll while walls and the editor asking within the same few minutes share
  // one fetch. Any longer and a lone wall would get the previous poll's
  // answer every other time. Anyone asking while a refresh is already
  // running gets the previous copy rather than waiting behind it.
  ttlMs: CALENDAR_REFRESH_MS - 30_000,
  staleWhileRefreshMs: CALENDAR_REFRESH_MS,
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

    const timezone = config.settings.timezone;

    const now = new Date();
    // The default window opens at the start of the household's today, not
    // at now: the sources test all-day rows against it, and a start of "now"
    // ends today's all-day events, birthdays and holidays early wherever the
    // hub's clock and the household's day disagree (a UTC Pi dropped them
    // from 7 pm in Chicago). List views hide finished rows themselves, and
    // budgetEvents keeps what ended today apart from the upcoming budget.
    const todayStartMs = householdDayStart(now, 0, timezone).getTime();
    // It closes at the end of the household's day `daysAhead` days out. Both
    // bounds are midnights, so the cache key holds all day: walls leave
    // timeMax off exactly so it does (getCalendarFetchWindow), and assume
    // this default reaches at least startOfDay(now) + daysAhead.
    const defaultEndMs = householdDayStart(now, daysAhead + 1, timezone).getTime();
    // Optional window overrides (displays widen the window for month/week
    // grid views). Unparseable values fall back to the defaults, and both
    // are re-serialized so cache keys stay canonical.
    const parseTimeParam = (value: string | null): number | null => {
      if (!value) return null;
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? ms : null;
    };
    const defaultWindowMs = daysAhead * 86400000;
    const timeMinMs = parseTimeParam(searchParams.get('timeMin')) ?? todayStartMs;
    let timeMaxMs = parseTimeParam(searchParams.get('timeMax')) ?? defaultEndMs;
    if (timeMaxMs <= timeMinMs) timeMaxMs = timeMinMs + defaultWindowMs;
    if (timeMaxMs - timeMinMs > CALENDAR_MAX_WINDOW_MS) timeMaxMs = timeMinMs + CALENDAR_MAX_WINDOW_MS;
    const timeMin = new Date(timeMinMs).toISOString();
    const timeMax = new Date(timeMaxMs).toISOString();

    const icalKey = icalSources.map(s => `${s.id}:${s.color}:${s.url}`).join(',');
    const icloudKey = icloudSources.map(s => `${s.id}:${s.color}:${s.kind}:${s.url}`).join(',');

    return { calendarIds, icalSources, icloudSources, holidayCountry, hideDeclined, timeMin, timeMax, timezone, icalKey, icloudKey };
  },
  cacheKey: ({ calendarIds, icalKey, icloudKey, holidayCountry, hideDeclined, timeMin, timeMax, timezone }) =>
    `g:${[...calendarIds].sort().join(',')};i:${icalKey};ic:${icloudKey};h:${holidayCountry ?? ''};hd:${hideDeclined};${timeMin}:${timeMax};tz:${timezone ?? ''}`,
  execute: async ({ calendarIds, icalSources, icloudSources, holidayCountry, hideDeclined, timeMin, timeMax, timezone }) => {
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

    // One shape for every family: fetch, substitute saved events on BOTH the
    // success and failure paths (withSavedEvents must run on both — that
    // invariant lives here rather than in four hand-written copies), and on
    // a family-level throw (auth, network) fail every source in it. The
    // thrown error reaches `failAll` so a family can classify it.
    const runFamily = async (
      fetchFamily: () => Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }>,
      failAll: (error: unknown) => SourceFetchResult[],
      logMessage: string,
    ): Promise<FamilyOutcome> => {
      try {
        const { events, results } = await fetchFamily();
        return { events: withSavedEvents(events, results, windowStart, windowEnd, timezone), results, ok: results.some((r) => r.ok) };
      } catch (error) {
        log.error(logMessage, error);
        const failed = failAll(error);
        return { events: withSavedEvents([], failed, windowStart, windowEnd, timezone), results: failed, ok: false };
      }
    };

    const [google, ical, icloud, holidays] = await Promise.all([
      !calendarIds.length ? NO_FAMILY : runFamily(
        // Lazy, like the other families: a household without Google Calendar
        // never loads the Google client library.
        async () => (await import('@/lib/google-calendar')).fetchCalendarEvents(calendarIds, timeMin, timeMax, hideDeclined),
        // The email local part stands in for the calendar name the API would
        // have supplied, matching the editor's own fallback. A missing or
        // expired sign-in (SetupError) gets its own key so the display can
        // show the sign-in card instead of an outage badge.
        (error) => calendarIds.map((id): SourceFetchResult => ({
          id,
          name: id.includes('@') ? id.split('@')[0] : undefined,
          ok: false,
          ...(error instanceof SetupError
            ? { error: 'Google Calendar needs to sign in again', messageKey: GOOGLE_NOT_SIGNED_IN }
            : { error: "Couldn't reach Google Calendar", messageKey: 'googleUnreachable' }),
        })),
        'Google Calendar fetch failed',
      ),
      !icalSources.length ? NO_FAMILY : runFamily(
        // Lazy-import so the route still works when node-ical isn't installed
        async () => (await import('@/lib/ical-calendar')).fetchICalEvents(icalSources, timeMin, timeMax, timezone),
        () => icalSources.map((s): SourceFetchResult =>
          ({ id: s.id, name: s.name, ok: false, error: 'Could not reach the link', messageKey: 'linkUnreachable' })),
        'ICS calendar fetch failed',
      ),
      !icloudSources.length ? NO_FAMILY : runFamily(
        // Lazy-import so the route still works when tsdav isn't installed
        async () => {
          const { fetchICloudEvents } = await import('@/lib/caldav-calendar');
          const { listICloudAccounts } = await import('@/lib/icloud-accounts');
          return fetchICloudEvents(icloudSources, await listICloudAccounts(), timeMin, timeMax, timezone);
        },
        () => icloudSources.map((s): SourceFetchResult =>
          ({ id: s.id, name: s.name, ok: false, error: "Couldn't reach iCloud", messageKey: 'icloudUnreachable' })),
        'iCloud calendar fetch failed',
      ),
      !holidayCountry ? NO_FAMILY : runFamily(
        async () => ({
          events: await fetchHolidayEvents(holidayCountry, timeMin, timeMax, timezone),
          results: [{ id: 'holidays', name: 'Public Holidays', ok: true }],
        }),
        () => [{ id: 'holidays', name: 'Public Holidays', ok: false, error: "Couldn't load the holiday list", messageKey: 'holidaysFailed' }],
        'Holiday fetch failed',
      ),
    ]);
    const sourceResults: SourceFetchResult[] = [
      ...google.results, ...ical.results, ...icloud.results, ...holidays.results,
    ];

    // If every attempted source failed AND nothing could be substituted from
    // the saved events, return an error instead of caching empty —
    // useFetchData keeps the last-good body on a failed response. When saved
    // events exist, the 200 payload is the richer answer: accurate per-source
    // statuses plus the kept rows the display badges as not updating. A
    // sign-in problem is the other exception: the display needs the
    // per-source statuses to show its sign-in card, and a kept last-good
    // body would hide the problem behind aging events.
    if (!google.ok && !ical.ok && !icloud.ok && !holidays.ok) {
      const anySaved =
        google.events.length || ical.events.length || icloud.events.length || holidays.events.length;
      const needsSignIn = sourceResults.length > 0 && sourceResults.every((r) => r.messageKey === GOOGLE_NOT_SIGNED_IN);
      if (!anySaved && !needsSignIn) {
        return errorResponse(null, 'Failed to fetch calendar events') as NextResponse;
      }
    }

    const sourceStatus = mergeSourceStatus(sourceResults, Date.now());
    recordSourceStatus(sourceStatus);

    const merged = [...google.events, ...ical.events, ...icloud.events, ...holidays.events]
      .sort((a, b) => compareEventStarts(a.start, b.start, timezone));
    // The safety cap is deliberately not a user setting: a small "max
    // events" once scaled into the grid fetch and silently truncated month
    // grids to the nearest few days. Upcoming-first budgeting only when the
    // cap is exceeded — see budgetEvents for the three-bucket policy.
    return { events: budgetEvents(merged, CALENDAR_FETCH_MAX_EVENTS, timezone), sourceStatus };
  },
  errorMessage: 'Failed to fetch calendar events',
});

/** @internal exported for test cleanup */
export { GET, cache };
