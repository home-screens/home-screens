import type { calendar_v3 } from '@googleapis/calendar';
import { getAuthenticatedClient } from '@/lib/google-auth';
import { calendarApi } from '@/lib/google-calendar';
import {
  CalendarWriteError,
  repeatFromRecurrence,
  repeatToRRule,
  seriesRuleFollows,
  type ChangeScope,
  type EventDraft,
  type NormalizedEvent,
  type RepeatReading,
  type TimeWas,
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
  /** A timed series' usual start, `HH:MM` on the household clock. */
  seriesStartTime?: string;
  draft: EventDraft;
  /** How the series repeats, as a family choice, or `other` when it was set up elsewhere in a way the forms cannot edit. */
  repeat: RepeatReading;
}

// ── Pure mapping ──────────────────────────────────────────────────────

type GoogleTimes = Pick<calendar_v3.Schema$Event, 'start' | 'end'>;

/**
 * A start or end as a day, or as a time on a clock. The other shape is named
 * and set to null: a patch merges `start` and `end` field by field, so an
 * all-day event turned timed (or the reverse) would otherwise keep its old
 * `date` beside the new `dateTime`.
 */
function googleDay(date: string): calendar_v3.Schema$EventDateTime {
  return { date, dateTime: null, timeZone: null };
}

function googleTime(dateTime: string, timeZone: string): calendar_v3.Schema$EventDateTime {
  return { date: null, dateTime, timeZone };
}

/** The fields Google stores for a normalized event (no id, no marker). */
export function toGoogleTimes(event: NormalizedEvent): GoogleTimes {
  if (event.allDay) return { start: googleDay(event.startDate), end: googleDay(event.endDateExclusive) };
  return { start: googleTime(event.startLocal, event.timeZone), end: googleTime(event.endLocal, event.timeZone) };
}

/** A start or end with only the fields it has, for a new event, which has no other shape to clear. */
function withoutNulls(when: calendar_v3.Schema$EventDateTime | undefined): calendar_v3.Schema$EventDateTime {
  return Object.fromEntries(Object.entries(when ?? {}).filter(([, value]) => value !== null));
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
  const start = localOf(event.start ?? {}, timezone);
  const end = localOf(event.end ?? {}, timezone);
  // A day or longer cannot be told from a shorter one by its two clock times, so its end day rides along and locks its times.
  const long = minutesBetween(start, end) >= DAY_MINUTES;
  return {
    ...base,
    allDay: false,
    date: start.isoDate,
    startTime: clockTime(start.minuteOfDay),
    endTime: clockTime(end.minuteOfDay),
    ...(long ? { endDate: end.isoDate } : {}),
  };
}

const DAY_MINUTES = 24 * 60;

interface LocalTime {
  isoDate: string;
  minuteOfDay: number;
}

/** A timed start or end on the household's clock. */
function localOf(when: calendar_v3.Schema$EventDateTime, timezone: string): LocalTime {
  return wallClockParts(parseDateInTZ(when.dateTime ?? '', when.timeZone ?? timezone), timezone);
}

/** `HH:MM` for minutes after midnight. */
export function clockOfMinutes(minuteOfDay: number): string {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

/** Minutes from one clock time to another, as a clock on the wall counts them. */
function minutesBetween(from: LocalTime, to: LocalTime): number {
  return (isoDaysBetween(from.isoDate, to.isoDate) ?? 0) * DAY_MINUTES + to.minuteOfDay - from.minuteOfDay;
}

/** A `YYYY-MM-DDTHH:MM:00` stamp as its day and minutes after midnight. */
function stampParts(stamp: string): LocalTime {
  return { isoDate: stamp.slice(0, 10), minuteOfDay: Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16)) };
}

/** `YYYY-MM-DDTHH:MM:00` for a day and minutes after its midnight, which may run past the day either way. */
function localStamp(isoDate: string, minuteOfDay: number): string {
  const days = Math.floor(minuteOfDay / DAY_MINUTES);
  return `${addIsoDays(isoDate, days)}T${clockTime(minuteOfDay - days * DAY_MINUTES)}:00`;
}

/**
 * "Every time" on one day of a series: the series keeps its own first day,
 * moved by however many days this day was moved, and takes the new times.
 * Changing the series' start to this day instead would drop every earlier
 * occurrence.
 *
 * `timeWas` is that day's own times as the form loaded them. A day that was
 * moved on its own (practice at 6 this week, 5 every other week) differs from
 * its series, so with it the series moves by how far the family moved this
 * day and grows by how much they lengthened it, and does not land on this
 * day's own times. It applies while the series, the day as loaded and the day
 * as saved are all timed or all all-day; across that line the new times are
 * taken as they are.
 */
export function seriesTimes(
  event: NormalizedEvent,
  series: { start: calendar_v3.Schema$EventDateTime; end?: calendar_v3.Schema$EventDateTime | null },
  dayWas: string,
  timezone: string,
  timeWas?: TimeWas,
): GoogleTimes {
  const seriesAllDay = Boolean(series.start.date);
  const first = seriesAllDay ? null : localOf(series.start, timezone);
  const firstDay = series.start.date ?? first!.isoDate;
  const dayNow = event.allDay ? event.startDate : event.startLocal.slice(0, 10);
  const shift = isoDaysBetween(dayWas, dayNow) ?? 0;
  const newFirst = addIsoDays(firstDay, shift);
  if (event.allDay) {
    const span = isoDaysBetween(event.startDate, event.endDateExclusive) ?? 1;
    const seriesSpan = seriesAllDay && series.end?.date ? isoDaysBetween(firstDay, series.end.date) : null;
    const grown = timeWas?.allDay === true && seriesSpan !== null ? seriesSpan + span - timeWas.days : span;
    return { start: googleDay(newFirst), end: googleDay(addIsoDays(newFirst, grown >= 1 ? grown : span)) };
  }
  const start = stampParts(event.startLocal);
  const startMinute = start.minuteOfDay;
  const minutes = minutesBetween(start, stampParts(event.endLocal));
  if (first && timeWas?.allDay === false) {
    const seriesMinutes = series.end?.dateTime ? minutesBetween(first, localOf(series.end, timezone)) : null;
    const grown = seriesMinutes !== null ? seriesMinutes + minutes - timeWas.minutes : minutes;
    const newStart = first.minuteOfDay + startMinute - timeWas.startMinute;
    return {
      start: googleTime(localStamp(newFirst, newStart), event.timeZone),
      end: googleTime(localStamp(newFirst, newStart + (grown > 0 ? grown : minutes)), event.timeZone),
    };
  }
  return {
    start: googleTime(localStamp(newFirst, startMinute), event.timeZone),
    end: googleTime(localStamp(newFirst, startMinute + minutes), event.timeZone),
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
      ...(series?.start?.dateTime ? { seriesStartTime: clockOfMinutes(localOf(series.start, timezone).minuteOfDay) } : {}),
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
  const body = toGoogleBody(event);
  try {
    const { data } = await calendar.events.insert({
      calendarId,
      requestBody: { ...body, start: withoutNulls(body.start), end: withoutNulls(body.end), extendedProperties: { private: HOME_SCREENS_MARKER } },
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
  /** That day's own times as the form loaded them; see `seriesTimes`. */
  timeWas?: TimeWas;
  event: NormalizedEvent;
  /** Send a new repeat rule (it changed). */
  repeatChanged: boolean;
  /**
   * Send new times (the family changed the day or the times). False leaves
   * `start` and `end` out of the patch, so a new name or place can never
   * move or shorten an event, whatever shape its times have.
   */
  timesChanged: boolean;
  /**
   * Send the name and the place (they changed). Matters for "every time":
   * the day the form opened may have a name or place of its own, which must
   * not become the whole series'.
   */
  titleChanged: boolean;
  placeChanged: boolean;
  /**
   * Make sure a one-day change is not aimed at a series' own id, which
   * would change every time without the question (and the grown-up code)
   * that guards it. Costs one read, so it is asked for a wall, whose token
   * every kiosk shares; a phone is already signed in.
   */
  refuseSeriesId?: boolean;
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
      // With its times left alone the series keeps its own shape, which one of its days may not share.
      const untilShape = input.timesChanged
        ? event
        : series.start?.date ? ({ allDay: true } as const) : ({ allDay: false, timeZone: input.timezone } as const);
      await calendar.events.patch(
        {
          calendarId,
          eventId: input.seriesId,
          requestBody: {
            ...(input.titleChanged ? { summary: event.title } : {}),
            ...(input.placeChanged ? { location: event.location ?? '' } : {}),
            ...(input.timesChanged
              ? seriesTimes(event, { start: series.start ?? {}, end: series.end }, input.dayWas, input.timezone, input.timeWas)
              : {}),
            ...(seriesRuleFollows(event, input) ? { recurrence: withNewRRule(series.recurrence, repeatToRRule(event, untilShape)) } : {}),
          },
        },
        { headers: { 'If-Match': input.etag } },
      );
      return;
    }
    if (input.refuseSeriesId) {
      const { data: target } = await calendar.events.get({ calendarId, eventId: input.eventId, fields: 'recurrence' });
      if (target.recurrence?.length) {
        throw new CalendarWriteError('calendarWrite.notEditable', "That event can't be changed here.", undefined, { status: 403 });
      }
    }
    const body = toGoogleBody(event);
    if (!input.timesChanged) {
      delete body.start;
      delete body.end;
    }
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
