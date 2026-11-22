import { addIsoDays, isIsoDate, isoWeekday } from './iso-date';
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

/**
 * Check a draft and put it in the shape the writers take. `timezone` is the
 * household's, and `now` decides "today" for the date range.
 */
export function normalizeEventDraft(draft: EventDraft, opts: { timezone: string; now?: Date }): NormalizedEvent {
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
  if (end === start) refuse('calendarWrite.endsWhenItStarts', 'It ends when it starts.');
  // An end earlier on the clock is the next day: a sleepover from 6 PM to
  // 10 AM. That keeps every timed event under a day; longer is all day.
  const endDate = end < start ? addIsoDays(date, 1) : date;
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
 */
export function checkChangeScope(scope: ChangeScope, repeatChanged: boolean): void {
  if (scope === 'instance' && repeatChanged) {
    refuse('calendarWrite.repeatNeedsEveryTime', 'Changing how it repeats changes every time.');
  }
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
 */
export function repeatToRRule(event: NormalizedEvent): string | null {
  if (!event.repeat) return null;
  const parts = [RRULE_FOR[event.repeat.frequency]];
  const until = event.repeat.until;
  if (until) {
    if (event.allDay) {
      parts.push(`UNTIL=${until.replace(/-/g, '')}`);
    } else {
      const nextMidnight = parseDateInTZ(`${addIsoDays(until, 1)}T00:00:00`, event.timeZone);
      parts.push(`UNTIL=${compactUtc(new Date(nextMidnight.getTime() - 1000))}`);
    }
  }
  return `RRULE:${parts.join(';')}`;
}

const WEEKDAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

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
 * Whether any wall may add, change and remove events: the household's
 * setting, or a display that turned it on for itself. The hub cannot tell
 * which display sent a write (one token for every kiosk), so each wall checks
 * its own switch and the hub checks this.
 */
export function anyWallMayWrite(settings: Pick<GlobalSettings, 'calendarWallEntry'>, displays: readonly { settings?: { calendarWallEntry?: boolean } }[] | undefined): boolean {
  if (settings.calendarWallEntry !== false) return true;
  return (displays ?? []).some((d) => d.settings?.calendarWallEntry === true);
}

/** Whether this wall may add, change and remove events: its own switch, else the household's. On unless turned off. */
export function wallMayWrite(effective: { calendarWallEntry?: boolean }): boolean {
  return effective.calendarWallEntry !== false;
}
