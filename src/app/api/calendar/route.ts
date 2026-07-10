import { NextResponse } from 'next/server';
import { fetchCalendarEvents } from '@/lib/google-calendar';
import { readConfig } from '@/lib/config';
import { cachedProxyRoute, errorResponse } from '@/lib/api-utils';
import { compareEventStarts, isEventUpcoming } from '@/lib/calendar-utils';
import { DEFAULT_CALENDAR_DAYS_AHEAD } from '@/lib/constants';
import { fetchHolidayEvents } from '@/lib/holidays';
import type { CalendarEvent, ICalSource, ICloudSource } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('calendar');

export const dynamic = 'force-dynamic';

interface CalendarParams {
  calendarIds: string[];
  icalSources: ICalSource[];
  icloudSources: ICloudSource[];
  holidayCountry: string | undefined;
  timeMin: string;
  timeMax: string;
  maxEvents: number;
  icalKey: string;
  icloudKey: string;
}

// Hard ceiling on the requested window span. Bounds two costs that scale with
// span and aren't capped by maxEvents: recurring-event expansion in the ICS
// parser, and the number of distinct cache keys (which embed the window). The
// widest in-app request is a ~6-week month grid, so this only ever clamps a
// hand-crafted LAN request.
const MAX_WINDOW_MS = 400 * 86400000;

const { GET, cache } = cachedProxyRoute<CalendarEvent[], CalendarParams>({
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

    return { calendarIds, icalSources, icloudSources, holidayCountry, timeMin, timeMax, maxEvents, icalKey, icloudKey };
  },
  cacheKey: ({ calendarIds, icalKey, icloudKey, holidayCountry, timeMin, timeMax, maxEvents }) =>
    `g:${[...calendarIds].sort().join(',')};i:${icalKey};ic:${icloudKey};h:${holidayCountry ?? ''};${timeMin}:${timeMax}:${maxEvents}`,
  execute: async ({ calendarIds, icalSources, icloudSources, holidayCountry, timeMin, timeMax, maxEvents }) => {
    if (calendarIds.length === 0 && icalSources.length === 0 && icloudSources.length === 0 && !holidayCountry) {
      return NextResponse.json(
        { error: 'No calendars configured. Add a Google account, iCloud account, or ICS feed in editor settings.' },
        { status: 400 },
      );
    }

    // Fetch all sources independently — track success so we
    // don't cache an empty result when all sources failed transiently.
    let googleEvents: CalendarEvent[] = [];
    let googleOk = false;
    if (calendarIds.length) {
      try {
        googleEvents = await fetchCalendarEvents(calendarIds, timeMin, timeMax);
        googleOk = true;
      } catch (error) {
        log.error('Google Calendar fetch failed', error);
      }
    }

    let icalEvents: CalendarEvent[] = [];
    let icalOk = false;
    if (icalSources.length) {
      try {
        // Lazy-import so the route still works when node-ical isn't installed
        const { fetchICalEvents } = await import('@/lib/ical-calendar');
        icalEvents = await fetchICalEvents(icalSources, timeMin, timeMax);
        icalOk = true;
      } catch (error) {
        log.error('ICS calendar fetch failed', error);
      }
    }

    let icloudEvents: CalendarEvent[] = [];
    let icloudOk = false;
    if (icloudSources.length) {
      try {
        // Lazy-import so the route still works when tsdav isn't installed
        const { fetchICloudEvents } = await import('@/lib/caldav-calendar');
        const { listICloudAccounts } = await import('@/lib/icloud-accounts');
        const accounts = await listICloudAccounts();
        icloudEvents = await fetchICloudEvents(icloudSources, accounts, timeMin, timeMax);
        icloudOk = true;
      } catch (error) {
        log.error('iCloud calendar fetch failed', error);
      }
    }

    // Fetch public holidays if a country is configured
    let holidayEvents: CalendarEvent[] = [];
    let holidayOk = false;
    if (holidayCountry) {
      try {
        holidayEvents = await fetchHolidayEvents(holidayCountry, timeMin, timeMax);
        holidayOk = true;
      } catch (error) {
        log.error('Holiday fetch failed', error);
      }
    }

    // If every attempted source failed, return an error instead of caching empty
    if (!googleOk && !icalOk && !icloudOk && !holidayOk) {
      return errorResponse(null, 'Failed to fetch calendar events') as NextResponse;
    }

    const merged = [...googleEvents, ...icalEvents, ...icloudEvents, ...holidayEvents]
      .sort((a, b) => compareEventStarts(a.start, b.start));
    if (merged.length <= maxEvents) return merged;

    // Upcoming-first budgeting, applied only when even the window-scaled cap
    // is exceeded (a pathologically dense window). A plain ascending slice
    // would spend the whole budget on the earliest events — with a widened
    // timeMin, that's the past — starving upcoming events and emptying later
    // grid weeks and any co-present agenda/daily view sharing this payload.
    // Keep the nearest maxEvents upcoming events (the pre-widening guarantee),
    // then backfill leftover budget with the most recent past events (the ones
    // nearest today, most likely visible in a grid). With the default
    // timeMin = now, everything is upcoming and this degenerates to the
    // original ascending slice.
    const now = new Date();
    const upcoming = merged.filter(ev => isEventUpcoming(ev, now));
    const past = merged.filter(ev => !isEventUpcoming(ev, now));
    const keptUpcoming = upcoming.slice(0, maxEvents);
    const keptPast = past.slice(Math.max(0, past.length - (maxEvents - keptUpcoming.length)));
    return [...keptPast, ...keptUpcoming].sort((a, b) => compareEventStarts(a.start, b.start));
  },
  errorMessage: 'Failed to fetch calendar events',
});

/** @internal exported for test cleanup */
export { GET, cache };
