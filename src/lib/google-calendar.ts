import { createHash } from 'crypto';
import { calendar as googleCalendar, type calendar_v3 } from '@googleapis/calendar';
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

/** Only the event fields read below, so Google sends nothing else. */
const EVENT_FIELDS =
  'items(id,etag,recurringEventId,summary,start,end,location,description,colorId,eventLabelId,attendees(self,responseStatus)),nextPageToken';

/** The calendar access roles that may add, change and remove events. */
const WRITABLE_ROLES = new Set(['owner', 'writer']);

/** Whether a Google access role lets the account write events on that calendar. */
export function isWritableRole(role: string | null | undefined): boolean {
  return WRITABLE_ROLES.has(role ?? '');
}

// Calendar names and colors, the event color palette and each calendar's
// label colors change rarely, and asking for them costs two calls plus one
// per calendar ahead of the events themselves. They are kept for an hour per
// sign-in. The key is the access token, so a new sign-in, possibly to
// another account, never sees the last one's names and colors.
const METADATA_TTL_MS = 60 * 60 * 1000;

interface CalendarMetadata {
  colors: Map<string, string>;
  names: Map<string, string>;
  /** Calendars this account may write events on (access role owner or writer). */
  writable: Set<string>;
  /** Legacy event `colorId` values to their hex colors. */
  eventColors: Map<string, string>;
}

interface MetadataEntry {
  account: string;
  at: number;
  /** The calendar ids this list was fetched for. */
  asked: Set<string>;
  value: Promise<CalendarMetadata>;
}

let metadataCache: MetadataEntry | null = null;
const labelColorCache = new Map<string, { account: string; at: number; colors: Map<string, string> }>();

/** @internal exported for test isolation */
export function clearGoogleCalendarCache(): void {
  metadataCache = null;
  labelColorCache.clear();
}

type GoogleAuthClient = NonNullable<Awaited<ReturnType<typeof getAuthenticatedClient>>>;

/**
 * The Calendar API client. `HS_GOOGLE_CALENDAR_API_URL` points it at a
 * stand-in Google for E2E and sandbox hubs (e2e/helpers/fake-google-calendar.ts),
 * the way `HS_GOOGLE_*_TOKEN_URL` points sign-ins at a local helper.
 */
export function calendarApi(auth: GoogleAuthClient): calendar_v3.Calendar {
  const rootUrl = process.env.HS_GOOGLE_CALENDAR_API_URL?.trim();
  return googleCalendar({ version: 'v3', auth, ...(rootUrl ? { rootUrl } : {}) });
}

function accountKey(auth: GoogleAuthClient): string {
  return createHash('sha256').update(auth.credentials.access_token ?? '').digest('hex');
}

/**
 * Names and colors of the account's calendars and the legacy event palette,
 * from cache when this sign-in fetched them within the hour. A selected
 * calendar the cached list has never been checked for was just picked, so
 * the list is asked for again rather than showing it nameless for an hour.
 */
async function calendarMetadata(
  calendar: calendar_v3.Calendar,
  account: string,
  calendarIds: string[],
): Promise<CalendarMetadata> {
  const cached = metadataCache;
  if (cached && cached.account === account && Date.now() - cached.at < METADATA_TTL_MS) {
    const meta = await cached.value;
    if (calendarIds.every((id) => meta.names.has(id) || cached.asked.has(id))) return meta;
  }
  return refreshMetadata(calendar, account, calendarIds);
}

function refreshMetadata(calendar: calendar_v3.Calendar, account: string, calendarIds: string[]): Promise<CalendarMetadata> {
  const value = (async () => {
    const [calListRes, colorsRes] = await Promise.all([
      calendar.calendarList.list(),
      calendar.colors.get(),
    ]);
    const colors = new Map<string, string>();
    const names = new Map<string, string>();
    const writable = new Set<string>();
    for (const cal of calListRes.data.items ?? []) {
      if (cal.id) {
        colors.set(cal.id, cal.backgroundColor ?? DEFAULT_EVENT_COLOR);
        names.set(cal.id, cal.summary ?? cal.id);
        if (isWritableRole(cal.accessRole)) writable.add(cal.id);
      }
    }
    // Only the original 11 colors still carry a colorId; see
    // `fetchEventLabelColors` for the rest.
    const eventColors = new Map<string, string>();
    for (const [id, color] of Object.entries(colorsRes.data.event ?? {})) {
      eventColors.set(id, color.background ?? DEFAULT_EVENT_COLOR);
    }
    return { colors, names, writable, eventColors };
  })();
  const entry: MetadataEntry = { account, at: Date.now(), asked: new Set(calendarIds), value };
  metadataCache = entry;
  // A failed lookup is not kept: the next fetch asks again.
  value.catch(() => {
    if (metadataCache === entry) metadataCache = null;
  });
  return value;
}

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

  const calendar = calendarApi(auth);
  const account = accountKey(auth);
  const { colors: calendarColorMap, names: calendarNameMap, writable: writableCalendars, eventColors: eventColorMap } =
    await calendarMetadata(calendar, account, calendarIds);

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
      const labelColorsPromise = fetchEventLabelColors(calendar, account, calendarId);
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
          fields: EVENT_FIELDS,
        });
        raw.push(...(response.data.items ?? []));
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken && raw.length < CALENDAR_FETCH_MAX_EVENTS);

      const labelColors = await labelColorsPromise;
      const calColor = calendarColorMap.get(calendarId) ?? DEFAULT_EVENT_COLOR;
      const calName = calendarNameMap.get(calendarId) ?? calendarId;
      // Birthdays come from Contacts and can never be changed here.
      const writable = writableCalendars.has(calendarId) && calendarId !== GOOGLE_BIRTHDAYS_CALENDAR_ID;
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
        // Only a real event id can be written back; the made-up fallback id above cannot.
        ...(writable && event.id ? { writable: true } : {}),
        ...(event.recurringEventId ? { repeats: true, seriesId: event.recurringEventId } : {}),
        ...(event.etag ? { etag: event.etag } : {}),
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
 * colors: those events fall back to `colorId` or the calendar's color, and
 * the next fetch asks again.
 */
async function fetchEventLabelColors(
  calendar: calendar_v3.Calendar,
  account: string,
  calendarId: string,
): Promise<Map<string, string>> {
  const cached = labelColorCache.get(calendarId);
  if (cached && cached.account === account && Date.now() - cached.at < METADATA_TTL_MS) return cached.colors;
  const colors = new Map<string, string>();
  try {
    const res = await calendar.calendars.get({ calendarId });
    for (const label of res.data.labelProperties?.eventLabels ?? []) {
      if (label.id && label.backgroundColor) colors.set(label.id, label.backgroundColor);
    }
  } catch (err) {
    log.warn(`Google event label colors unavailable for ${calendarId}`, err);
    return colors;
  }
  labelColorCache.set(calendarId, { account, at: Date.now(), colors });
  return colors;
}

/**
 * Names, colors and whether this account may write, for the given calendars,
 * from the same hourly cache the event fetch uses. Empty when Google is not
 * signed in.
 */
export async function googleCalendarLabels(
  calendarIds: string[],
): Promise<Map<string, { name: string; color: string; writable: boolean }>> {
  const auth = await getAuthenticatedClient();
  if (!auth || calendarIds.length === 0) return new Map();
  const calendar = calendarApi(auth);
  const meta = await calendarMetadata(calendar, accountKey(auth), calendarIds);
  return new Map(calendarIds.map((id) => [id, {
    name: meta.names.get(id) ?? id,
    color: meta.colors.get(id) ?? DEFAULT_EVENT_COLOR,
    writable: meta.writable.has(id),
  }]));
}
