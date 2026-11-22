import type { calendar_v3 } from '@googleapis/calendar';
import { getAuthenticatedClient } from '@/lib/google-auth';
import { calendarApi } from '@/lib/google-calendar';
import {
  CalendarWriteError,
  repeatFromRecurrence,
  repeatToRRule,
  type ChangeScope,
  type EventDraft,
  type NormalizedEvent,
  type RepeatReading,
} from '@/lib/calendar-write';
import { addIsoDays, isoDaysBetween } from '@/lib/iso-date';
import { parseDateInTZ, wallClockParts } from '@/lib/timezone';
import { logger } from '@/lib/logger';

/**
 * Adding, changing and removing Google Calendar events. The rules for what a
 * valid event is live in calendar-write.ts; this module only speaks Google.
 * Changes carry the version the form loaded (`If-Match`), so a change made
 * elsewhere in the meantime is refused and shown, never overwritten. No queue
 * and no retries: a write that does not go through says so and keeps what
 * was typed.
 */

const log = logger('google-calendar-write');

/** Marks events made here, so a stricter "only change what Home Screens made" rule can come later without guessing. */
export const HOME_SCREENS_MARKER = { homeScreens: '1' };

/** What the phone and the wall need to open Change on one event. */
export interface EditableGoogleEvent {
  calendarId: string;
  /** The event, or the one day of a repeating series. */
  eventId: string;
  etag: string;
  /** The series and its version, when this is one day of a repeating event. */
  seriesId?: string;
  seriesEtag?: string;
  draft: EventDraft;
  /** How the series repeats, as a family choice, or `other` when it was set up elsewhere in a way the forms cannot edit. */
  repeat: RepeatReading;
}

// ── Pure mapping ──────────────────────────────────────────────────────

/** The fields Google stores for a normalized event (no id, no marker). */
export function toGoogleTimes(event: NormalizedEvent): Pick<calendar_v3.Schema$Event, 'start' | 'end'> {
  if (event.allDay) return { start: { date: event.startDate }, end: { date: event.endDateExclusive } };
  return {
    start: { dateTime: event.startLocal, timeZone: event.timeZone },
    end: { dateTime: event.endLocal, timeZone: event.timeZone },
  };
}

export function toGoogleBody(event: NormalizedEvent): calendar_v3.Schema$Event {
  const rrule = repeatToRRule(event);
  return {
    summary: event.title,
    // An empty string clears a place on a patch; Google stores none for it.
    location: event.location ?? '',
    ...toGoogleTimes(event),
    ...(rrule ? { recurrence: [rrule] } : {}),
  };
}

function clockTime(minuteOfDay: number): string {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

/** A Google event as the forms' draft, on the household's clock. */
export function draftFromGoogle(event: calendar_v3.Schema$Event, timezone: string, repeat: RepeatReading): EventDraft {
  const base = {
    title: event.summary ?? '',
    ...(event.location ? { location: event.location } : {}),
    ...(repeat.kind === 'known' ? { repeat: repeat.rule } : {}),
  };
  if (event.start?.date) {
    const lastDate = event.end?.date ? addIsoDays(event.end.date, -1) : event.start.date;
    return { ...base, allDay: true, date: event.start.date, ...(lastDate > event.start.date ? { lastDate } : {}) };
  }
  // A time without an offset is on the event's own clock, read like every
  // other calendar time here; Google normally sends one.
  const start = wallClockParts(parseDateInTZ(event.start?.dateTime ?? '', event.start?.timeZone ?? timezone), timezone);
  const end = wallClockParts(parseDateInTZ(event.end?.dateTime ?? '', event.end?.timeZone ?? timezone), timezone);
  return { ...base, allDay: false, date: start.isoDate, startTime: clockTime(start.minuteOfDay), endTime: clockTime(end.minuteOfDay) };
}

/**
 * "Every time" on one day of a series: the series keeps its own first day,
 * moved by however many days this day was moved, and takes the new times.
 * Changing the series' start to this day instead would drop every earlier
 * occurrence.
 */
export function seriesTimes(
  event: NormalizedEvent,
  seriesStart: calendar_v3.Schema$EventDateTime,
  dayWas: string,
  timezone: string,
): Pick<calendar_v3.Schema$Event, 'start' | 'end'> {
  const firstDay = seriesStart.date ?? wallClockParts(parseDateInTZ(seriesStart.dateTime ?? '', seriesStart.timeZone ?? timezone), timezone).isoDate;
  const dayNow = event.allDay ? event.startDate : event.startLocal.slice(0, 10);
  const shift = isoDaysBetween(dayWas, dayNow) ?? 0;
  const newFirst = addIsoDays(firstDay, shift);
  if (event.allDay) {
    const span = isoDaysBetween(event.startDate, event.endDateExclusive) ?? 1;
    return { start: { date: newFirst }, end: { date: addIsoDays(newFirst, span) } };
  }
  const endDay = event.endLocal.slice(0, 10);
  const nights = isoDaysBetween(dayNow, endDay) ?? 0;
  return {
    start: { dateTime: `${newFirst}${event.startLocal.slice(10)}`, timeZone: event.timeZone },
    end: { dateTime: `${addIsoDays(newFirst, nights)}${event.endLocal.slice(10)}`, timeZone: event.timeZone },
  };
}

/** The series' recurrence with a new RRULE, keeping its skipped days (EXDATE) and anything else it carries. */
export function withNewRRule(recurrence: readonly string[] | null | undefined, rrule: string | null): string[] {
  const kept = (recurrence ?? []).filter((line) => !/^RRULE:/i.test(line));
  return rrule ? [...kept, rrule] : kept;
}

// ── Errors ────────────────────────────────────────────────────────────

function statusOf(err: unknown): number | undefined {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const status = e?.response?.status ?? e?.status ?? e?.code;
  return typeof status === 'number' ? status : undefined;
}

const KNOWN_WRITE_STATUSES = new Set([401, 403, 404, 410, 412]);

/** Whether a calendar service's HTTP answer has a refusal of its own; anything else reads as "couldn't reach", and is worth a log line. */
export function isKnownWriteStatus(status: number | undefined): boolean {
  return status !== undefined && KNOWN_WRITE_STATUSES.has(status);
}

/**
 * A failed write for the log: its status and the service's short reason
 * ("invalid", "ECONNRESET"), never the error itself. Google's client keeps
 * the request on its error, so logging that would put the event's name and
 * place in the hub's log, and the privacy policy says event details never
 * reach the hub's disk.
 */
export function describeWriteFailure(err: unknown, status: number | undefined): string {
  const e = err as {
    code?: unknown;
    name?: unknown;
    cause?: { code?: unknown };
    response?: { data?: { error?: { status?: unknown; errors?: Array<{ reason?: unknown }> } } };
  } | null;
  const google = e?.response?.data?.error;
  const reason = [google?.errors?.[0]?.reason, google?.status, e?.code, e?.cause?.code, e?.name].find((r) => typeof r === 'string');
  return `HTTP ${status ?? 'none'}${reason ? `, ${String(reason)}` : ''}`;
}

/**
 * A calendar service's HTTP answer to a write, in the family's words, as a
 * refusal the phone and the wall translate. Shared by the Google and iCloud
 * writers, so the same answer reads the same from either. No status (the
 * request never got an answer) and any other status mean the service could
 * not be reached.
 */
export function writeRefusalForStatus(
  status: number | undefined,
  service: 'Google' | 'iCloud',
  extra?: Record<string, unknown>,
): CalendarWriteError {
  if (status === 412) {
    return new CalendarWriteError('calendarWrite.changedElsewhere', 'Someone changed this event a moment ago.', undefined, { status: 409, extra });
  }
  if (status === 404 || status === 410) {
    return new CalendarWriteError('calendarWrite.gone', 'That event was already removed.', undefined, { status: 404 });
  }
  if (status === 403) {
    return new CalendarWriteError('calendarWrite.notAllowed', "This calendar can't be changed from Home Screens.", undefined, { status: 403 });
  }
  if (status === 401) {
    return new CalendarWriteError('calendarWrite.signInNeeded', `${service} needs you to sign in again.`, undefined, { status: 403 });
  }
  return new CalendarWriteError('calendarWrite.unreachable', `Couldn't reach ${service}. Try again in a minute.`, undefined, { status: 502 });
}

/** Google's answer in the family's words, as a refusal the phone and the wall translate. */
export function writeRefusal(err: unknown, extra?: Record<string, unknown>): CalendarWriteError {
  const status = statusOf(err);
  if (!isKnownWriteStatus(status)) log.warn(`Google refused or did not answer a calendar write (${describeWriteFailure(err, status)})`);
  return writeRefusalForStatus(status, 'Google', extra);
}

// ── Google ────────────────────────────────────────────────────────────

async function client(): Promise<calendar_v3.Calendar> {
  const auth = await getAuthenticatedClient();
  if (!auth) throw new CalendarWriteError('calendarWrite.signInNeeded', 'Google needs you to sign in again.', undefined, { status: 403 });
  return calendarApi(auth);
}

/** One event, ready for the Change form: the day the family tapped, and the series it belongs to. */
export async function getGoogleEventForEdit(calendarId: string, eventId: string, timezone: string): Promise<EditableGoogleEvent> {
  const calendar = await client();
  try {
    const { data: event } = await calendar.events.get({ calendarId, eventId });
    let series: calendar_v3.Schema$Event | null = null;
    if (event.recurringEventId) {
      series = (await calendar.events.get({ calendarId, eventId: event.recurringEventId })).data;
    }
    const repeat = repeatFromRecurrence((series ?? event).recurrence, timezone);
    return {
      calendarId,
      eventId,
      etag: event.etag ?? '',
      ...(series?.id ? { seriesId: series.id, seriesEtag: series.etag ?? '' } : {}),
      draft: draftFromGoogle(event, timezone, repeat),
      repeat,
    };
  } catch (err) {
    throw writeRefusal(err);
  }
}

/** Add an event. Answers its id, so the wall can outline it once it arrives. */
export async function createGoogleEvent(calendarId: string, event: NormalizedEvent): Promise<{ id: string }> {
  const calendar = await client();
  try {
    const { data } = await calendar.events.insert({
      calendarId,
      requestBody: { ...toGoogleBody(event), extendedProperties: { private: HOME_SCREENS_MARKER } },
    });
    return { id: `${calendarId}:${data.id ?? ''}` };
  } catch (err) {
    throw writeRefusal(err);
  }
}

/**
 * Change an event. `instance` changes the one event, or the one day of a
 * series; `series` changes every time, through the series itself. The
 * version sent must be the one the form loaded: the event's for `instance`,
 * the series' for `series`.
 */
export async function updateGoogleEvent(input: {
  calendarId: string;
  eventId: string;
  etag: string;
  scope: ChangeScope;
  seriesId?: string;
  /** The day the form opened on, for moving a series by the same number of days. */
  dayWas: string;
  event: NormalizedEvent;
  /** Send a new repeat rule (it changed). */
  repeatChanged: boolean;
  timezone: string;
}): Promise<void> {
  const calendar = await client();
  const { calendarId, event } = input;
  try {
    if (input.scope === 'series' && input.seriesId) {
      const { data: series } = await calendar.events.get({ calendarId, eventId: input.seriesId });
      if (series.etag && series.etag !== input.etag) {
        // Changed since the form opened: the same answer Google gives below.
        throw Object.assign(new Error('Precondition Failed'), { code: 412 });
      }
      await calendar.events.patch(
        {
          calendarId,
          eventId: input.seriesId,
          requestBody: {
            summary: event.title,
            location: event.location ?? '',
            ...seriesTimes(event, series.start ?? {}, input.dayWas, input.timezone),
            ...(input.repeatChanged ? { recurrence: withNewRRule(series.recurrence, repeatToRRule(event)) } : {}),
          },
        },
        { headers: { 'If-Match': input.etag } },
      );
      return;
    }
    const body = toGoogleBody(event);
    // One day of a series never carries a repeat of its own.
    if (input.seriesId) delete body.recurrence;
    await calendar.events.patch({ calendarId, eventId: input.eventId, requestBody: body }, { headers: { 'If-Match': input.etag } });
  } catch (err) {
    if (err instanceof CalendarWriteError) throw err;
    throw writeRefusal(err);
  }
}

/**
 * Remove an event: the one day (`instance`) or the whole series (`series`).
 * Already gone counts as done.
 */
export async function deleteGoogleEvent(input: { calendarId: string; eventId: string; scope: ChangeScope; seriesId?: string }): Promise<void> {
  const calendar = await client();
  const eventId = input.scope === 'series' && input.seriesId ? input.seriesId : input.eventId;
  try {
    await calendar.events.delete({ calendarId: input.calendarId, eventId });
  } catch (err) {
    const status = statusOf(err);
    if (status === 404 || status === 410) return;
    throw writeRefusal(err);
  }
}
