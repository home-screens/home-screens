import { NextResponse } from 'next/server';
import { fetchCalendarEvents } from '@/lib/google-calendar';
import { readConfig } from '@/lib/config';
import { cachedProxyRoute, errorResponse } from '@/lib/api-utils';
import { compareEventStarts } from '@/lib/calendar-utils';
import { fetchHolidayEvents } from '@/lib/holidays';
import type { CalendarEvent, ICalSource } from '@/types/config';

export const dynamic = 'force-dynamic';

interface CalendarParams {
  calendarIds: string[];
  icalSources: ICalSource[];
  holidayCountry: string | undefined;
  timeMin: string;
  timeMax: string;
  maxEvents: number;
  icalKey: string;
}

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
    const holidayCountry = config.settings.calendar.holidayCountry;
    const daysAhead = config.settings.calendar.daysAhead ?? 7;

    // Round to nearest minute so cache keys are reusable
    const nowMs = Math.floor(Date.now() / 60000) * 60000;
    const timeMin = searchParams.get('timeMin') ?? new Date(nowMs).toISOString();
    const timeMax = searchParams.get('timeMax') ?? new Date(nowMs + daysAhead * 86400000).toISOString();
    const maxEvents = config.settings.calendar.maxEvents ?? 100;

    const icalKey = icalSources.map(s => `${s.id}:${s.color}:${s.url}`).join(',');

    return { calendarIds, icalSources, holidayCountry, timeMin, timeMax, maxEvents, icalKey };
  },
  cacheKey: ({ calendarIds, icalKey, holidayCountry, timeMin, timeMax, maxEvents }) =>
    `g:${[...calendarIds].sort().join(',')};i:${icalKey};h:${holidayCountry ?? ''};${timeMin}:${timeMax}:${maxEvents}`,
  execute: async ({ calendarIds, icalSources, holidayCountry, timeMin, timeMax, maxEvents }) => {
    if (calendarIds.length === 0 && icalSources.length === 0 && !holidayCountry) {
      return NextResponse.json(
        { error: 'No calendars configured. Add a Google account or ICS feed in editor settings.' },
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
        console.error('Google Calendar fetch failed', error);
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
        console.error('ICS calendar fetch failed', error);
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
        console.error('Holiday fetch failed', error);
      }
    }

    // If every attempted source failed, return an error instead of caching empty
    if (!googleOk && !icalOk && !holidayOk) {
      return errorResponse(null, 'Failed to fetch calendar events') as NextResponse;
    }

    // Merge, sort, slice
    return [...googleEvents, ...icalEvents, ...holidayEvents]
      .sort((a, b) => compareEventStarts(a.start, b.start))
      .slice(0, maxEvents);
  },
  errorMessage: 'Failed to fetch calendar events',
});

/** @internal exported for test cleanup */
export { GET, cache };
