import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google-auth';
import { compareEventStarts } from '@/lib/calendar-utils';
import type { SourceFetchResult } from '@/lib/calendar-source-status';
import type { CalendarEvent } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('google-calendar');

export async function fetchCalendarEvents(
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
  hideDeclined = false,
): Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    throw new Error('Not authenticated with Google. Sign in from the editor settings.');
  }

  const calendar = google.calendar({ version: 'v3', auth });

  // Fetch calendar colors and event color definitions in parallel
  const [calListRes, colorsRes] = await Promise.all([
    calendar.calendarList.list(),
    calendar.colors.get(),
  ]);

  const calendarColorMap = new Map<string, string>();
  const calendarNameMap = new Map<string, string>();
  for (const cal of calListRes.data.items ?? []) {
    if (cal.id) {
      calendarColorMap.set(cal.id, cal.backgroundColor ?? '#3b82f6');
      calendarNameMap.set(cal.id, cal.summary ?? cal.id);
    }
  }

  // Map event colorId values to their actual hex colors
  const eventColorMap = new Map<string, string>();
  for (const [id, color] of Object.entries(colorsRes.data.event ?? {})) {
    eventColorMap.set(id, color.background ?? '#3b82f6');
  }

  // Fetch events from all selected calendars in parallel; one broken
  // calendar becomes a failing `results` entry, not a whole-fetch rejection.
  const settled = await Promise.allSettled(
    calendarIds.map(async (calendarId) => {
      const response = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const calColor = calendarColorMap.get(calendarId) ?? '#3b82f6';
      const calName = calendarNameMap.get(calendarId) ?? calendarId;
      const items = hideDeclined
        ? (response.data.items ?? []).filter((event) => event.attendees?.find((a) => a.self)?.responseStatus !== 'declined')
        : (response.data.items ?? []);
      // Calendar-id prefix keeps ids unique when the same event appears on
      // two selected calendars; the fallback covers the (rare) missing id so
      // no event ever renders with an empty, untappable identity.
      return items.map((event) => ({
        id: `${calendarId}:${event.id ?? `${event.start?.dateTime ?? event.start?.date ?? ''}-${event.summary ?? ''}`}`,
        title: event.summary ?? '(No title)',
        start: event.start?.dateTime ?? event.start?.date ?? '',
        end: event.end?.dateTime ?? event.end?.date ?? '',
        location: event.location ?? undefined,
        description: event.description ?? undefined,
        allDay: !event.start?.dateTime,
        calendarColor: event.colorId
          ? eventColorMap.get(event.colorId) ?? calColor
          : calColor,
        sourceId: calendarId,
        sourceName: calName,
      }));
    }),
  );

  const events: CalendarEvent[] = [];
  const results: SourceFetchResult[] = [];
  settled.forEach((outcome, i) => {
    const calendarId = calendarIds[i];
    const calName = calendarNameMap.get(calendarId) ?? calendarId;
    if (outcome.status === 'fulfilled') {
      events.push(...outcome.value);
      results.push({ id: calendarId, name: calName, ok: true });
    } else {
      log.warn(`Google calendar fetch failed for ${calendarId}`, outcome.reason);
      results.push({ id: calendarId, name: calName, ok: false, error: "Couldn't load this calendar from Google" });
    }
  });

  events.sort((a, b) => compareEventStarts(a.start, b.start));
  return { events, results };
}
