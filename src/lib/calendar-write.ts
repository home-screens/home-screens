import { addIsoDays, isIsoDate, isoDaysBetween, isoWeekday } from './iso-date';
import { oneLineText, textLength } from './text-length';
import { isoDateInTZ, parseDateInTZ } from './timezone';
import { RefusalError, type RefusalParams } from './refusal';
import type { CalendarEventEntry, CalendarEvent, GlobalSettings } from '@/types/config';

/**
 * The rules for adding and changing calendar events from Home Screens: what a
 * valid event is, how its repeat is written for Google and iCloud, and who may
 * add at all. One rule set for the phone, the wall and the hub, so a form
 * never offers something the hub then turns down. Pure and free of server
 * imports.
 */

export const CALENDAR_WRITE_LIMITS = {
  /** Event names, counted the way day notes count (an emoji is one). */
  maxTitleLength: 80,
  maxLocationLength: 200,
  /** How far from today an event may start, either way. */
  maxYearsAway: 5,
  /** The longest all-day event, first day to last. */
  maxAllDayDays: 366,
  /** How far after its first day a repeat may be told to stop. */
  maxRepeatYears: 10,
} as const;

/**
 * Why an event write was turned down. Each one has a sentence in the `remote`
 * dictionary under `refusals.calendarWrite`, shown on the phone and the wall.
 */
export type CalendarWriteRefusalCode =
  | 'calendarWrite.titleRequired'
  | 'calendarWrite.titleTooLong'
  | 'calendarWrite.placeTooLong'
  | 'calendarWrite.badDate'
  | 'calendarWrite.dayTooFar'
  | 'calendarWrite.badTime'
  | 'calendarWrite.endsWhenItStarts'
  | 'calendarWrite.lastDayBeforeFirst'
  | 'calendarWrite.tooManyDays'
  | 'calendarWrite.badRepeat'
  | 'calendarWrite.weekdaysOnWeekend'
  | 'calendarWrite.repeatEndsBeforeStart'
  | 'calendarWrite.repeatTooLong'
  | 'calendarWrite.repeatNeedsEveryTime'
  | 'calendarWrite.notOffered'
  | 'calendarWrite.calendarNotTicked'
  | 'calendarWrite.notEditable'
  | 'calendarWrite.changedElsewhere'
  | 'calendarWrite.gone'
  | 'calendarWrite.notAllowed'
  | 'calendarWrite.signInNeeded'
  | 'calendarWrite.unreachable';

export class CalendarWriteError extends RefusalError {
  constructor(
    code: CalendarWriteRefusalCode,
    message: string,
    params?: RefusalParams,
    options: { status?: number; extra?: Record<string, unknown> } = {},
  ) {
    super(options.status ?? 400, code, message, { ...(params ? { params } : {}), ...(options.extra ? { extra: options.extra } : {}) });
    this.name = 'CalendarWriteError';
  }
}

/** The repeats a family can pick on the phone and the wall. Anything else stays in Google Calendar or Apple Calendar. */
export const REPEAT_FREQUENCIES = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] as const;
export type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];

export interface RepeatRule {
  frequency: RepeatFrequency;
  /** The last day it may happen, inclusive (`YYYY-MM-DD`). Absent means it keeps going. */
  until?: string;
}

/** What the phone and the wall send. Times are on the household's clock. */
export interface EventDraft {
  title: string;
  /** The day it starts, `YYYY-MM-DD`. */
  date: string;
  allDay: boolean;
  /** Timed only: `HH:MM`. */
  startTime?: string;
  /** Timed only: `HH:MM`. Earlier than `startTime` means the next day. */
  endTime?: string;
  /**
   * Timed only, and only on an event loaded for Change that runs 24 hours or
   * more: the day it really ends. The forms can only say "ends the same day
   * or the next", so such an event's day and times are shown and never
   * changed here; its name, place and Remove still work.
   */
  endDate?: string;
  /** All day only: the last day, inclusive. Absent means one day. */
  lastDate?: string;
  location?: string;
  /** Absent or null means it does not repeat. */
  repeat?: RepeatRule | null;
}

interface NormalizedBase {
  title: string;
  location?: string;
  repeat?: RepeatRule;
}

/** An event ready for a writer. All-day ends are exclusive, the way Google and iCloud store them. */
export type NormalizedEvent =
  | (NormalizedBase & { allDay: true; startDate: string; endDateExclusive: string })
  | (NormalizedBase & {
      allDay: false;
      /** `YYYY-MM-DDTHH:MM:00` on the household's clock. */
      startLocal: string;
      endLocal: string;
      timeZone: string;
    });

/** What a change to one day of a repeating event applies to. */
export type ChangeScope = 'instance' | 'series';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function refuse(code: CalendarWriteRefusalCode, message: string, params?: RefusalParams): never {
  throw new CalendarWriteError(code, message, params);
}

function minutesOf(time: string | undefined): number {
  const match = time ? TIME.exec(time) : null;
  if (!match) refuse('calendarWrite.badTime', 'That time does not look right.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function yearsFrom(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  // Day 29 of February lands on March 1 in a year without one; close enough for a cap.
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

/** Repeats that make sense for an event starting on `date`: every weekday only from a weekday. */
export function repeatFrequenciesFor(date: string): RepeatFrequency[] {
  const weekday = isoWeekday(date);
  const onWeekend = weekday === 0 || weekday === 6;
  return REPEAT_FREQUENCIES.filter((f) => f !== 'weekdays' || !onWeekend);
}

function normalizeRepeat(repeat: RepeatRule | null | undefined, date: string): RepeatRule | undefined {
  if (!repeat) return undefined;
  if (!REPEAT_FREQUENCIES.includes(repeat.frequency)) refuse('calendarWrite.badRepeat', 'That repeat is not one Home Screens can set.');
  if (!repeatFrequenciesFor(date).includes(repeat.frequency)) {
    refuse('calendarWrite.weekdaysOnWeekend', 'Every weekday needs an event that starts on a weekday.');
  }
  if (repeat.until === undefined) return { frequency: repeat.frequency };
  if (!isIsoDate(repeat.until)) refuse('calendarWrite.badDate', 'That day does not look right.');
  if (repeat.until < date) refuse('calendarWrite.repeatEndsBeforeStart', 'It stops before it starts.');
  const cap = yearsFrom(date, CALENDAR_WRITE_LIMITS.maxRepeatYears);
  if (repeat.until > cap) {
    refuse('calendarWrite.repeatTooLong', `A repeat can run at most ${CALENDAR_WRITE_LIMITS.maxRepeatYears} years.`, {
      years: CALENDAR_WRITE_LIMITS.maxRepeatYears,
    });
  }
  return { frequency: repeat.frequency, until: repeat.until };
}

/** Whether a draft is a timed event of 24 hours or more, whose day and times the forms show but never change. */
export function isLongTimed(draft: Pick<EventDraft, 'allDay' | 'endDate'>): boolean {
  return !draft.allDay && draft.endDate !== undefined;
}

/**
 * An event across days, timed or all day: the forms keep it the shape it is.
 * Switching it between all day and timed would quietly make it one day long,
 * since a form has no way to set a time on another day.
 */
export function spansDays(draft: Pick<EventDraft, 'allDay' | 'endDate' | 'lastDate' | 'date'>): boolean {
  return isLongTimed(draft) || (draft.allDay && draft.lastDate !== undefined && draft.lastDate > draft.date);
}

/**
 * Check a draft and put it in the shape the writers take. `timezone` is the
 * household's, and `now` decides "today" for the date range.
 *
 * `timesChanged: false` is a change that leaves the day and times alone (a
 * new name or place): the writers then send no times at all, so the event
 * keeps exactly the times its calendar holds, including ones no form here
 * could have made (two days long, or ending the moment it starts). Left out,
 * the times count as changed.
 */
export function normalizeEventDraft(draft: EventDraft, opts: { timezone: string; now?: Date; timesChanged?: boolean }): NormalizedEvent {
  const title = oneLineText(String(draft.title ?? ''));
  if (!title) refuse('calendarWrite.titleRequired', 'Give the event a name.');
  if (textLength(title) > CALENDAR_WRITE_LIMITS.maxTitleLength) {
    refuse('calendarWrite.titleTooLong', `An event name can be at most ${CALENDAR_WRITE_LIMITS.maxTitleLength} characters.`, {
      max: CALENDAR_WRITE_LIMITS.maxTitleLength,
    });
  }
  const location = oneLineText(String(draft.location ?? '')) || undefined;
  if (location && textLength(location) > CALENDAR_WRITE_LIMITS.maxLocationLength) {
    refuse('calendarWrite.placeTooLong', `A place can be at most ${CALENDAR_WRITE_LIMITS.maxLocationLength} characters.`, {
      max: CALENDAR_WRITE_LIMITS.maxLocationLength,
    });
  }

  const date = draft.date;
  if (!isIsoDate(date)) refuse('calendarWrite.badDate', 'That day does not look right.');
  const today = isoDateInTZ(opts.now ?? new Date(), opts.timezone);
  if (date < yearsFrom(today, -CALENDAR_WRITE_LIMITS.maxYearsAway) || date > yearsFrom(today, CALENDAR_WRITE_LIMITS.maxYearsAway)) {
    refuse('calendarWrite.dayTooFar', `An event must start within ${CALENDAR_WRITE_LIMITS.maxYearsAway} years of today.`, {
      years: CALENDAR_WRITE_LIMITS.maxYearsAway,
    });
  }
  const repeat = normalizeRepeat(draft.repeat, date);
  const base: NormalizedBase = { title, ...(location ? { location } : {}), ...(repeat ? { repeat } : {}) };

  if (draft.allDay) {
    const lastDate = draft.lastDate ?? date;
    if (!isIsoDate(lastDate)) refuse('calendarWrite.badDate', 'That day does not look right.');
    if (lastDate < date) refuse('calendarWrite.lastDayBeforeFirst', 'The last day is before the first.');
    const endDateExclusive = addIsoDays(lastDate, 1);
    if (endDateExclusive > addIsoDays(date, CALENDAR_WRITE_LIMITS.maxAllDayDays)) {
      refuse('calendarWrite.tooManyDays', `An all-day event can cover at most ${CALENDAR_WRITE_LIMITS.maxAllDayDays} days.`, {
        max: CALENDAR_WRITE_LIMITS.maxAllDayDays,
      });
    }
    return { ...base, allDay: true, startDate: date, endDateExclusive };
  }

  const start = minutesOf(draft.startTime);
  const end = minutesOf(draft.endTime);
  const keepsTimes = opts.timesChanged === false;
  let endDate: string;
  if (draft.endDate !== undefined) {
    if (!isIsoDate(draft.endDate) || draft.endDate < date) refuse('calendarWrite.badDate', 'That day does not look right.');
    // New times would be written as "the same day or the next", cutting the event short.
    if (!keepsTimes) throw new CalendarWriteError('calendarWrite.notEditable', "That event's times can't be changed here.", undefined, { status: 403 });
    endDate = draft.endDate;
  } else {
    if (end === start && !keepsTimes) refuse('calendarWrite.endsWhenItStarts', 'It ends when it starts.');
    // An end earlier on the clock is the next day: a sleepover from 6 PM to
    // 10 AM. That keeps every timed event made here under a day; longer is all day.
    endDate = end < start ? addIsoDays(date, 1) : date;
  }
  return {
    ...base,
    allDay: false,
    startLocal: `${date}T${draft.startTime}:00`,
    endLocal: `${endDate}T${draft.endTime}:00`,
    timeZone: opts.timezone,
  };
}

/** How long a timed draft runs, in minutes; the forms show it beside the end. */
export function draftMinutes(startTime: string, endTime: string): number | null {
  if (!TIME.test(startTime) || !TIME.test(endTime)) return null;
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  if (end === start) return null;
  return end > start ? end - start : end + 24 * 60 - start;
}

/**
 * Ends once Starts moves to `nextStart`: the event keeps its length, the way
 * Google Calendar moves an event. `fallbackMinutes` (the household's usual
 * length) stands in while the draft has no length, Ends equal to Starts.
 */
export function endKeepingLength(startTime: string, endTime: string, nextStart: string, fallbackMinutes: number): string {
  if (!TIME.test(nextStart)) return endTime;
  const total = (minutesOf(nextStart) + (draftMinutes(startTime, endTime) ?? fallbackMinutes)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Whether a timed draft ends on the next day, for the "next day" mark beside Ends. */
export function endsNextDay(startTime: string, endTime: string): boolean {
  return TIME.test(startTime) && TIME.test(endTime) && minutesOf(endTime) < minutesOf(startTime);
}

/**
 * A change to one day of a repeating event cannot also change how it
 * repeats: that can only mean every time, so the forms skip the question.
 * A one-off is the whole event, so giving it a repeat is an ordinary change.
 */
export function checkChangeScope(scope: ChangeScope, repeatChanged: boolean, inSeries: boolean): void {
  if (scope === 'instance' && repeatChanged && inSeries) {
    refuse('calendarWrite.repeatNeedsEveryTime', 'Changing how it repeats changes every time.');
  }
}

/**
 * The day a Change form opened on, which "every time" moves a whole series
 * from: a real day, and no further from today than an event may start, so a
 * made-up one cannot carry a series decades away.
 */
export function checkDayWas(dayWas: unknown, today: string): string {
  if (typeof dayWas !== 'string' || !isIsoDate(dayWas)) refuse('calendarWrite.badDate', 'That day does not look right.');
  if (dayWas < yearsFrom(today, -CALENDAR_WRITE_LIMITS.maxYearsAway) || dayWas > yearsFrom(today, CALENDAR_WRITE_LIMITS.maxYearsAway)) {
    refuse('calendarWrite.dayTooFar', `An event must start within ${CALENDAR_WRITE_LIMITS.maxYearsAway} years of today.`, {
      years: CALENDAR_WRITE_LIMITS.maxYearsAway,
    });
  }
  return dayWas;
}

/** The times a Change form opened with, as the forms send them beside `dayWas`. */
export type TimeWasInput = { allDay: true; lastDate?: string } | { allDay: false; startTime?: string; endTime?: string };

/**
 * A day's own times as its form loaded them. A day of a series that was
 * moved on its own can differ from the series, so "every time" moves the
 * series by how far the family moved this day, not onto this day's times.
 */
export type TimeWas =
  | { allDay: true; /** First day to last, inclusive. */ days: number }
  | { allDay: false; /** Minutes after midnight. */ startMinute: number; /** How long it ran. */ minutes: number };

/** Read `timeWas` from a change. Absent, or a day with no length to measure from, answers undefined: the new times are then taken as they are. */
export function readTimeWas(value: unknown, dayWas: string): TimeWas | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') refuse('calendarWrite.badTime', 'That time does not look right.');
  const was = value as { allDay?: unknown; lastDate?: unknown; startTime?: unknown; endTime?: unknown };
  if (was.allDay === true) {
    const lastDate = was.lastDate ?? dayWas;
    if (typeof lastDate !== 'string' || !isIsoDate(lastDate)) refuse('calendarWrite.badDate', 'That day does not look right.');
    const nights = isoDaysBetween(dayWas, lastDate) ?? -1;
    if (nights < 0 || nights >= CALENDAR_WRITE_LIMITS.maxAllDayDays) refuse('calendarWrite.badDate', 'That day does not look right.');
    return { allDay: true, days: nights + 1 };
  }
  if (typeof was.startTime !== 'string' || typeof was.endTime !== 'string') refuse('calendarWrite.badTime', 'That time does not look right.');
  const startMinute = minutesOf(was.startTime);
  const minutes = draftMinutes(was.startTime, was.endTime);
  return minutes === null ? undefined : { allDay: false, startMinute, minutes };
}

// ── Repeat rules as RFC 5545 RRULE lines (Google and iCloud both take them) ──

const RRULE_FOR: Record<RepeatFrequency, string> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  biweekly: 'FREQ=WEEKLY;INTERVAL=2',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

function compactUtc(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * The RRULE line for an event's repeat. UNTIL is the last day in the form
 * each side of RFC 5545 needs: a date for an all-day event, and for a timed
 * one the last second of that day on the household's clock, in UTC.
 *
 * `shape` is whose form UNTIL takes when that is not the event's own: a
 * series whose times are being left alone, changed from one of its days that
 * was made all day (or timed) on its own.
 */
export function repeatToRRule(
  event: NormalizedEvent,
  shape: { allDay: true } | { allDay: false; timeZone: string } = event,
): string | null {
  if (!event.repeat) return null;
  const parts = [RRULE_FOR[event.repeat.frequency], ...ruleAnchor(event.repeat.frequency, event.allDay ? event.startDate : event.startLocal.slice(0, 10))];
  const until = event.repeat.until;
  if (until) {
    if (shape.allDay) {
      parts.push(`UNTIL=${until.replace(/-/g, '')}`);
    } else {
      const nextMidnight = parseDateInTZ(`${addIsoDays(until, 1)}T00:00:00`, shape.timeZone);
      parts.push(`UNTIL=${compactUtc(new Date(nextMidnight.getTime() - 1000))}`);
    }
  }
  return `RRULE:${parts.join(';')}`;
}

const WEEKDAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/**
 * The day a repeat is worded from, written into the rule: "Every week on
 * Wednesday" is `BYDAY=WE`, "Every month on the 22nd" `BYMONTHDAY=22`. A bare
 * `FREQ` repeats from the series' own first day, so a repeat changed from
 * any other day landed on days the form never named (a Wednesday's "every
 * week" fell on Tuesdays). The series keeps its first day, which RFC 5545
 * always counts as the first time.
 */
function ruleAnchor(frequency: RepeatFrequency, isoDate: string): string[] {
  const [y, m, d] = isoDate.split('-').map(Number);
  switch (frequency) {
    case 'weekly':
    case 'biweekly':
      return [`BYDAY=${WEEKDAY_ORDER[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]}`];
    case 'monthly':
      return [`BYMONTHDAY=${d}`];
    case 'yearly':
      return [`BYMONTH=${m}`, `BYMONTHDAY=${d}`];
    default:
      return [];
  }
}

/**
 * Whether "every time" writes the series' rule again: when the repeat itself
 * changed, or when the series moved to another day and its rule names its
 * day (`ruleAnchor`). A weekly series moved from Wednesday to Thursday kept
 * `BYDAY=WE` and stayed on Wednesdays, with only its first day moved.
 */
export function seriesRuleFollows(event: NormalizedEvent, change: { repeatChanged: boolean; timesChanged: boolean; dayWas: string }): boolean {
  if (change.repeatChanged) return true;
  if (!change.timesChanged || !event.repeat) return false;
  const day = event.allDay ? event.startDate : event.startLocal.slice(0, 10);
  return day !== change.dayWas && ruleAnchor(event.repeat.frequency, day).length > 0;
}

/**
 * Take out a rule's anchor to one day (one weekday for a weekly rule, one day
 * of the month, one date in the year), the way `ruleAnchor` writes it and
 * Google's own app writes every weekly event. What is left matches a family
 * choice; a rule on several days, or a "second Tuesday", keeps its parts and
 * reads as set up elsewhere.
 */
function dropDayAnchor(fields: Map<string, string>): void {
  const freq = fields.get('FREQ');
  const single = (key: string, pattern: RegExp) => {
    const value = fields.get(key);
    return value !== undefined && pattern.test(value);
  };
  if (freq === 'WEEKLY' && single('BYDAY', /^(MO|TU|WE|TH|FR|SA|SU)$/)) fields.delete('BYDAY');
  if (freq === 'MONTHLY' && single('BYMONTHDAY', /^([1-9]|[12]\d|3[01])$/)) fields.delete('BYMONTHDAY');
  if (freq === 'YEARLY' && single('BYMONTH', /^([1-9]|1[0-2])$/) && single('BYMONTHDAY', /^([1-9]|[12]\d|3[01])$/)) {
    fields.delete('BYMONTH');
    fields.delete('BYMONTHDAY');
  }
}

function ruleFields(rule: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const part of rule.split(';')) {
    const [key, value] = part.split('=');
    if (key && value !== undefined) fields.set(key.toUpperCase(), value.toUpperCase());
  }
  return fields;
}

/** One spelling per rule: keys sorted, and BYDAY's days in week order, since Google and Apple each write their own. */
function canonicalRule(fields: Map<string, string>): string {
  return [...fields.entries()]
    .map(([k, v]) => {
      if (k !== 'BYDAY') return `${k}=${v}`;
      const days = v.split(',').sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
      return `${k}=${days.join(',')}`;
    })
    .sort()
    .join(';');
}

/** How a saved repeat reads back: one of the family's choices, or something set elsewhere that the forms show but cannot edit. */
export type RepeatReading = { kind: 'none' } | { kind: 'known'; rule: RepeatRule } | { kind: 'other' };

function untilToIso(value: string, timeZone: string | undefined): string | null {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date) return `${date[1]}-${date[2]}-${date[3]}`;
  const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!stamp) return null;
  const instant = new Date(Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +stamp[6]));
  return isoDateInTZ(instant, timeZone);
}

/**
 * Read a series' recurrence lines (Google's `recurrence`, an iCloud RRULE)
 * back into a family choice. Anything with exceptions written as rules,
 * counts, other days or other steps is `other`.
 */
export function repeatFromRecurrence(lines: readonly string[] | null | undefined, timeZone?: string): RepeatReading {
  const rrules = (lines ?? []).filter((l) => /^RRULE:/i.test(l));
  if (rrules.length === 0) return { kind: 'none' };
  if (rrules.length > 1 || (lines ?? []).some((l) => /^(EXRULE|RDATE):/i.test(l))) return { kind: 'other' };
  const fields = ruleFields(rrules[0].slice('RRULE:'.length));
  const until = fields.get('UNTIL');
  fields.delete('UNTIL');
  if (fields.get('INTERVAL') === '1') fields.delete('INTERVAL');
  fields.delete('WKST');
  dropDayAnchor(fields);
  const body = canonicalRule(fields);
  const frequency = (Object.keys(RRULE_FOR) as RepeatFrequency[]).find((f) => canonicalRule(ruleFields(RRULE_FOR[f])) === body);
  if (!frequency) return { kind: 'other' };
  if (until === undefined) return { kind: 'known', rule: { frequency } };
  const untilIso = untilToIso(until, timeZone);
  return untilIso ? { kind: 'known', rule: { frequency, until: untilIso } } : { kind: 'other' };
}

// ── Event ids on the wall and the phone ──

/**
 * A Google event's id on the wall is `<calendarId>:<eventId>`. Split it back
 * against the calendars the household ticked, rather than at a colon, so a
 * calendar id with an unusual character can never move the split.
 */
export function splitGoogleEventId(id: string, calendarIds: readonly string[]): { calendarId: string; eventId: string } | null {
  const calendarId = calendarIds.find((c) => id.startsWith(`${c}:`) && id.length > c.length + 1);
  if (!calendarId) return null;
  return { calendarId, eventId: id.slice(calendarId.length + 1) };
}

// ── Who may add ──

/**
 * Where Google event entry stands for this hub, which Settings > Calendar
 * shows and every write route checks:
 * - `notOffered`: Home Screens' own app before Google has approved its wider
 *   sign-in; nothing about adding is shown (decision A8).
 * - `off`: the household has not turned it on.
 * - `needsWebClient`: its own Google app has no web sign-in saved yet.
 * - `needsSignIn`: on, but the saved sign-in can only read.
 * - `scopeMissing`: signed in on the web, but Google's "View and edit events" box was left empty.
 * - `ready`: events can be added.
 */
export type GoogleEntryState = 'notOffered' | 'off' | 'needsWebClient' | 'needsSignIn' | 'scopeMissing' | 'ready';

export const GOOGLE_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/**
 * Where adding events stands, as Settings > Calendar and the phone both say
 * it: `off`; `needsGoogle` (switched on, nothing to add to until Google is
 * signed in again); `googleUnreachable` (signed in, but Google cannot be
 * asked right now); `noCalendars` (switched on, but no calendar is ticked to
 * take new events, the state right after the switch is first turned on); or
 * `ready`. `calendars` is how many ticked calendars can take an event.
 */
export type AddingReadiness = 'off' | 'needsGoogle' | 'googleUnreachable' | 'noCalendars' | 'ready';

export function addingReadiness(entry: { enabled: boolean; google: GoogleEntryState | null; calendars: number; googleUnreachable?: boolean }): AddingReadiness {
  if (!entry.enabled) return 'off';
  if (entry.calendars > 0) return 'ready';
  if (entry.google !== null && entry.google !== 'notOffered' && entry.google !== 'ready') return 'needsGoogle';
  // Signed in, but Google could not be asked which calendars take events (`googleUnreachable` on the hub's answer).
  if (entry.googleUnreachable) return 'googleUnreachable';
  return 'noCalendars';
}

export function googleEntryState(input: {
  settingOn: boolean;
  /** Which Google app Calendar signs in with now; null when neither is usable. */
  clientMode: 'own' | 'hosted' | null;
  /** Home Screens' app may offer adding (HS_GOOGLE_HOSTED_EVENTS). */
  hostedEventsEnabled: boolean;
  /** Its own app has a web sign-in saved (the pair Google Photos import uses too). */
  webClientSaved: boolean;
  /** The saved Calendar sign-in: which kind made it, and what Google granted. */
  grant: { kind: 'device' | 'web'; scopes: readonly string[] } | null;
}): GoogleEntryState {
  if (input.clientMode === null) return 'notOffered';
  if (input.clientMode === 'hosted' && !input.hostedEventsEnabled) return 'notOffered';
  if (!input.settingOn) return 'off';
  if (input.clientMode === 'own' && !input.webClientSaved) return 'needsWebClient';
  if (!input.grant || input.grant.kind !== 'web') return 'needsSignIn';
  return input.grant.scopes.includes(GOOGLE_EVENTS_SCOPE) ? 'ready' : 'scopeMissing';
}

/**
 * `googleEntryState` for a given switch, from where Google would stand with
 * adding on (the state with `settingOn: true`). Settings applies the switch as
 * it is on the page, so the sign-in step shows the moment the switch flips
 * rather than after the change is saved.
 */
export function googleEntryStateWithSetting(ifOn: GoogleEntryState, settingOn: boolean): GoogleEntryState {
  return settingOn || ifOn === 'notOffered' ? ifOn : 'off';
}

/** The scope string Google saved with a grant, as a list. */
export function grantedScopes(scope: string | null | undefined): string[] {
  return (scope ?? '').split(/\s+/).filter(Boolean);
}

/** Calendars events may go on: ticked for adding, and in the household's list of shown calendars. */
export function entryCalendarIds(entry: CalendarEventEntry | undefined, shownIds: readonly string[]): string[] {
  if (!entry?.enabled) return [];
  const shown = new Set(shownIds);
  return entry.calendarIds.filter((id) => shown.has(id));
}

/**
 * Mark the events the phone and the wall may offer Change and Remove for,
 * and drop the version (`etag`) and `writable` from the rest, which no form
 * will send back. `editable` says whether a calendar takes changes now.
 */
export function stampEditable(events: CalendarEvent[], editable: (sourceId: string) => boolean): CalendarEvent[] {
  return events.map((event) => {
    const can = Boolean(event.writable && event.sourceId && event.kind !== 'birthday' && event.kind !== 'holiday' && editable(event.sourceId));
    if (can) return { ...event, canEdit: true };
    if (!event.writable && event.etag === undefined && event.sourceRef === undefined) return event;
    const rest = { ...event };
    delete rest.writable;
    delete rest.etag;
    delete rest.sourceRef;
    return rest;
  });
}

/**
 * Whether any wall may add, change and remove events: some display whose own
 * switch, or the household's where it has none, is on. Before any displays
 * exist it is the household's setting. The hub cannot tell which display sent
 * a write (one token for every kiosk), so each wall checks its own switch and
 * the hub checks this: once every display is off, nothing holding the display
 * token can write.
 */
export function anyWallMayWrite(settings: Pick<GlobalSettings, 'calendarWallEntry'>, displays: readonly { settings?: { calendarWallEntry?: boolean } }[] | undefined): boolean {
  if (!displays || displays.length === 0) return settings.calendarWallEntry !== false;
  return displays.some((d) => (d.settings?.calendarWallEntry ?? settings.calendarWallEntry) !== false);
}

/** Whether this wall may add, change and remove events: its own switch, else the household's. On unless turned off. */
export function wallMayWrite(effective: { calendarWallEntry?: boolean }): boolean {
  return effective.calendarWallEntry !== false;
}
