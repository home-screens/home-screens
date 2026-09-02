import { google, type calendar_v3 } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google-auth';
import { SetupError } from '@/lib/api-utils';
import { compareEventStarts } from '@/lib/calendar-utils';
import { settleSourceFetches, type SourceFetchResult } from '@/lib/calendar-source-status';
import { CALENDAR_FETCH_MAX_EVENTS } from '@/lib/constants';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import type { CalendarEvent } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('google-calendar');

/** Google's built-in read-only calendar of contact birthdays — a fixed, well-known id. */
const GOOGLE_BIRTHDAYS_CALENDAR_ID = 'addressbook#contacts@group.v.calendar.google.com';

/** Google's per-page maximum. Fewer round trips for the same events. */
const GOOGLE_EVENTS_PAGE_SIZE = 2500;

export async function fetchCalendarEvents(
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
  hideDeclined = false,
): Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    // A missing, expired, or revoked sign-in is something the household fixes
    // in the editor, not an outage: typed so the calendar route can tell the
    // display to show its sign-in card instead of aging saved events.
    throw new SetupError('Not authenticated with Google. Sign in from the editor settings.', 'connection', 'Google Calendar');
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
      calendarColorMap.set(cal.id, cal.backgroundColor ?? DEFAULT_EVENT_COLOR);
      calendarNameMap.set(cal.id, cal.summary ?? cal.id);
    }
  }

  // Map event colorId values to their actual hex colors
  const eventColorMap = new Map<string, string>();
  for (const [id, color] of Object.entries(colorsRes.data.event ?? {})) {
    eventColorMap.set(id, color.background ?? DEFAULT_EVENT_COLOR);
  }

  // Fetch events from all selected calendars in parallel; one broken
  // calendar becomes a failing `results` entry, not a whole-fetch rejection.
  const { events, results } = await settleSourceFetches(
    calendarIds,
    async (calendarId) => {
      // Google returns one *page* of events: 250 by default, 2500 at most,
      // with `nextPageToken` set whenever more remain — and it may return a
      // short page even under the limit, so the token is the only reliable
      // "that's all" signal. Without this loop the tail of the window is
      // silently dropped: `orderBy: 'startTime'` is ascending, so a busy
      // calendar over a wide grid window loses its last weeks and those day
      // cells render empty. Bounded by the same safety cap the route applies
      // to the merged feed, so one pathological calendar can't page forever.
      const raw: calendar_v3.Schema$Event[] = [];
      let pageToken: string | undefined;
      do {
        const response = await calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: GOOGLE_EVENTS_PAGE_SIZE,
          pageToken,
        });
        raw.push(...(response.data.items ?? []));
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken && raw.length < CALENDAR_FETCH_MAX_EVENTS);

      const calColor = calendarColorMap.get(calendarId) ?? DEFAULT_EVENT_COLOR;
      const calName = calendarNameMap.get(calendarId) ?? calendarId;
      const items = hideDeclined
        ? raw.filter((event) => event.attendees?.find((a) => a.self)?.responseStatus !== 'declined')
        : raw;
      // Calendar-id prefix keeps ids unique when the same event appears on
      // two selected calendars; the fallback covers the (rare) missing id so
      // no event ever renders with an empty, untappable identity.
      const calEvents: CalendarEvent[] = items.map((event) => ({
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
        ...(calendarId === GOOGLE_BIRTHDAYS_CALENDAR_ID ? { kind: 'birthday' as const } : {}),
      }));
      return { events: calEvents, results: [{ id: calendarId, name: calName, ok: true }] };
    },
    (calendarId, reason) => {
      log.warn(`Google calendar fetch failed for ${calendarId}`, reason);
      const calName = calendarNameMap.get(calendarId) ?? calendarId;
      return [{ id: calendarId, name: calName, ok: false, error: "Couldn't load this calendar from Google", messageKey: 'googleCalendarFailed' }];
    },
  );

  events.sort((a, b) => compareEventStarts(a.start, b.start));
  return { events, results };
}
