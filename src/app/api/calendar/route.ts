import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents } from '@/lib/google-calendar';
import { readConfig } from '@/lib/config';
import { errorResponse, createTTLCache, withDisplayAuth } from '@/lib/api-utils';
import { compareEventStarts } from '@/lib/calendar-utils';
import { fetchHolidayEvents } from '@/lib/holidays';
import type { CalendarEvent } from '@/types/config';

export const dynamic = 'force-dynamic';

/** @internal exported for test cleanup */
export const cache = createTTLCache<unknown>(2 * 60 * 1000); // 2 minutes

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  let config;
  try {
    config = await readConfig();
  } catch (error) {
    return errorResponse(error, 'Failed to read config');
  }

  // Use query params or fall back to config
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

  if (calendarIds.length === 0 && icalSources.length === 0 && !holidayCountry) {
    return NextResponse.json(
      { error: 'No calendars configured. Add a Google account or ICS feed in editor settings.' },
      { status: 400 },
    );
  }

  const daysAhead = config.settings.calendar.daysAhead ?? 7;
  // Round to nearest minute so cache keys are reusable
  const nowMs = Math.floor(Date.now() / 60000) * 60000;
  const timeMin = searchParams.get('timeMin') ?? new Date(nowMs).toISOString();
  const timeMax = searchParams.get('timeMax') ?? new Date(nowMs + daysAhead * 86400000).toISOString();
  const maxEvents = config.settings.calendar.maxEvents ?? 100;

  const icalKey = icalSources.map(s => `${s.id}:${s.color}:${s.url}`).join(',');
  const cacheKey = `g:${[...calendarIds].sort().join(',')};i:${icalKey};h:${holidayCountry ?? ''};${timeMin}:${timeMax}:${maxEvents}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

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
      // (e.g. git-based upgrade that skipped npm install)
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
    return errorResponse(null, 'Failed to fetch calendar events');
  }

  // Merge, sort, slice
  const allEvents = [...googleEvents, ...icalEvents, ...holidayEvents]
    .sort((a, b) => compareEventStarts(a.start, b.start))
    .slice(0, maxEvents);

  cache.set(cacheKey, allEvents);
  return NextResponse.json(allEvents);
}, 'Failed to fetch calendar events');
