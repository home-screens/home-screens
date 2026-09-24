import { google, type calendar_v3 } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google-auth';
import { SetupError } from '@/lib/api-utils';
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

  // Map legacy event colorId values to their hex colors. Only the original
  // 11 colors still carry a colorId; see `fetchEventLabelColors` for the rest.
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
      const labelColorsPromise = fetchEventLabelColors(calendar, calendarId);
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

      const labelColors = await labelColorsPromise;
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
        // Label first: it is the color Google's own apps show, and the legacy
        // palette still answers with older shades for the same 11 colors.
        calendarColor:
          (event.eventLabelId ? labelColors.get(event.eventLabelId) : undefined)
          ?? (event.colorId ? eventColorMap.get(event.colorId) : undefined)
          ?? calColor,
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

  // Not sorted here: the calendar route sorts the merged feed of every
  // source on the household's clock, which this module does not know.
  return { events, results };
}

/**
 * Event label colors for one calendar, keyed by `eventLabelId`. Since June
 * 2026 Google colors events with labels: 24 default colors plus custom ones.
 * The original 11 still set `colorId` as well, but every other color arrives
 * with only an `eventLabelId`, whose color is defined on the calendar itself
 * (`calendars.get`, not `calendarList`). A failed lookup costs only the label
 * colors: those events fall back to `colorId` or the calendar's color.
 */
async function fetchEventLabelColors(
  calendar: calendar_v3.Calendar,
  calendarId: string,
): Promise<Map<string, string>> {
  const colors = new Map<string, string>();
  try {
    const res = await calendar.calendars.get({ calendarId });
    for (const label of res.data.labelProperties?.eventLabels ?? []) {
      if (label.id && label.backgroundColor) colors.set(label.id, label.backgroundColor);
    }
  } catch (err) {
    log.warn(`Google event label colors unavailable for ${calendarId}`, err);
  }
  return colors;
}
