import { randomUUID } from 'crypto';
import ical, { type DateWithTimeZone, type VEvent } from 'node-ical';
import type { calendar_v3 } from '@googleapis/calendar';
import type { DAVCalendar } from 'tsdav';
import type { CalendarEvent, ICloudSource } from '@/types/config';
import type { ICloudAccount } from '@/lib/icloud-accounts';
import {
  CalendarWriteError,
  repeatFromRecurrence,
  repeatToRRule,
  type ChangeScope,
  type EventDraft,
  type NormalizedEvent,
  type RepeatReading,
  type TimeWas,
} from '@/lib/calendar-write';
import { describeWriteFailure, draftFromGoogle, isKnownWriteStatus, seriesTimes, toGoogleTimes, writeRefusalForStatus } from '@/lib/google-calendar-write';
import { forgetICloudClient, isICloudUrl, withICloudClient, type ICloudCalDAVClient } from '@/lib/caldav-calendar';
import { parseICSEvents } from '@/lib/ical-calendar';
import { normalizeIcsTimezones } from '@/lib/ics-timezones';
import { DAY_MS, addIsoDays, isIsoDate } from '@/lib/iso-date';
import { isKnownTimezone, isoDateInTZ, localISODate, parseDateInTZ } from '@/lib/timezone';
import { logger } from '@/lib/logger';

/**
 * Adding, changing and removing iCloud Calendar events over CalDAV, with the
 * app password the household already saved. The rules for what a valid event
 * is live in calendar-write.ts; this module only speaks iCloud.
 *
 * An iCloud event is one calendar object: a small ICS document holding the
 * event and, for a repeating one, its changed days (a VEVENT with a
 * RECURRENCE-ID) and skipped days (EXDATE). A change edits that document's
 * text in place, so everything Home Screens does not show (alarms, invitees,
 * notes, Apple's own properties) is kept. Every change carries the version
 * the form loaded (`If-Match`), so a change made elsewhere in the meantime is
 * refused and shown, never overwritten. No queue and no retries, as on Google.
 */

const log = logger('icloud-calendar-write');

/** The property that marks events made here, the iCloud twin of Google's private `homeScreens` marker. */
export const ICLOUD_MARKER_PROPERTY = 'X-HOME-SCREENS';
export const ICLOUD_PRODID = '-//Home Screens//EN';

// ── ICS text (RFC 5545) ───────────────────────────────────────────────

const CRLF = '\r\n';
const encoder = new TextEncoder();

/** RFC 5545 TEXT escaping (3.3.11): backslash, semicolon, comma and line breaks. */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** The other way: an escaped TEXT value as the person typed it. */
export function unescapeIcsText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Undo line folding (RFC 5545 3.1) and split into content lines. */
export function unfoldIcsLines(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter((line) => line.length > 0);
}

/**
 * Fold one content line at 75 octets (RFC 5545 3.1). A continuation starts
 * with a space, which counts toward its 75, and a character is never split
 * across two lines, so an emoji or an accented letter stays whole.
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

export interface IcsContentLine {
  /** Upper-cased. */
  name: string;
  /** Each `KEY=VALUE` as written. */
  params: string[];
  value: string;
}

/** Split a content line at its first colon outside a quoted parameter value. */
export function parseContentLine(line: string): IcsContentLine {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  const head = colon < 0 ? line : line.slice(0, colon);
  const value = colon < 0 ? '' : line.slice(colon + 1);
  const pieces: string[] = [];
  let piece = '';
  inQuotes = false;
  for (const c of head) {
    if (c === '"') inQuotes = !inQuotes;
    if (c === ';' && !inQuotes) {
      pieces.push(piece);
      piece = '';
    } else {
      piece += c;
    }
  }
  pieces.push(piece);
  return { name: pieces[0].toUpperCase(), params: pieces.slice(1), value };
}

function paramOf(line: IcsContentLine, key: string): string | undefined {
  const found = line.params.find((p) => p.slice(0, key.length + 1).toUpperCase() === `${key}=`);
  return found === undefined ? undefined : found.slice(key.length + 1).replace(/^"(.*)"$/, '$1');
}

/** One component of an ICS document: its properties as unfolded lines, in order, then its children. */
export interface IcsComponent {
  name: string;
  props: string[];
  children: IcsComponent[];
}

/** Read an ICS document into its VCALENDAR. Throws when it is not one. */
export function parseIcsDocument(text: string): IcsComponent {
  const stack: IcsComponent[] = [];
  let root: IcsComponent | null = null;
  for (const line of unfoldIcsLines(text)) {
    const begin = /^BEGIN:(.+)$/i.exec(line);
    if (begin) {
      const component: IcsComponent = { name: begin[1].trim().toUpperCase(), props: [], children: [] };
      if (stack.length) stack[stack.length - 1].children.push(component);
      else if (!root) root = component;
      else break;
      stack.push(component);
      continue;
    }
    if (/^END:/i.test(line)) {
      stack.pop();
      if (!stack.length && root) break;
      continue;
    }
    if (stack.length) stack[stack.length - 1].props.push(line);
  }
  if (!root || root.name !== 'VCALENDAR') throw new Error('Not an iCalendar document');
  return root;
}

function writeComponent(component: IcsComponent, out: string[]): void {
  out.push(`BEGIN:${component.name}`);
  for (const prop of component.props) out.push(foldIcsLine(prop));
  for (const child of component.children) writeComponent(child, out);
  out.push(`END:${component.name}`);
}

/** Write a component back as ICS text: folded lines, CRLF line ends. */
export function serializeIcsDocument(component: IcsComponent): string {
  const out: string[] = [];
  writeComponent(component, out);
  return `${out.join(CRLF)}${CRLF}`;
}

function propName(line: string): string {
  return (/^[^;:]+/.exec(line)?.[0] ?? '').toUpperCase();
}

function getProp(component: IcsComponent, name: string): string | undefined {
  return component.props.find((p) => propName(p) === name);
}

/** Replace every `name` line with `line` where the first one stood (or at the end), or drop them all for null. */
function setProp(component: IcsComponent, name: string, line: string | null): void {
  const at = component.props.findIndex((p) => propName(p) === name);
  const kept = component.props.filter((p) => propName(p) !== name);
  if (line !== null) kept.splice(at < 0 ? kept.length : at, 0, line);
  component.props = kept;
}

function textOf(component: IcsComponent, name: string): string | undefined {
  const line = getProp(component, name);
  return line === undefined ? undefined : unescapeIcsText(parseContentLine(line).value);
}

function uidOf(component: IcsComponent): string {
  const line = getProp(component, 'UID');
  return line === undefined ? '' : parseContentLine(line).value.trim();
}

// ── Dates and times ───────────────────────────────────────────────────

/** A day of a series as RECURRENCE-ID and EXDATE name it: a date in an all-day series, an instant in a timed one. */
export type OccurrenceRef = { date: string } | { instant: number };

function icsDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/** `YYYY-MM-DDTHH:MM:SS` as `YYYYMMDDTHHMMSS`. */
function icsLocal(local: string): string {
  return local.slice(0, 19).replace(/[-:]/g, '');
}

function icsUtc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

function isoFromIcsDate(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function localFromIcs(value: string): string {
  return `${isoFromIcsDate(value)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
}

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

/** An instant's wall-clock reading in `zone`, to the second, as plain numbers (no Date in the machine's zone, so no gap to fall into). */
function wallFields(ms: number, zone: string): [number, number, number, number, number, number] {
  let formatter = wallFormatters.get(zone);
  if (!formatter) {
    // 'en-US' for ASCII digits: these parts are parsed, never shown.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    wallFormatters.set(zone, formatter);
  }
  const parts = formatter.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return [get('year'), get('month'), get('day'), get('hour') % 24, get('minute'), get('second')];
}

function wallTime(ms: number, zone: string): string {
  const [y, mo, d, h, mi, s] = wallFields(ms, zone);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}`;
}

/** Minutes east of UTC that `zone` is at the instant `ms`. */
function offsetMinutes(zone: string, ms: number): number {
  const whole = Math.floor(ms / 1000) * 1000;
  const [y, mo, d, h, mi, s] = wallFields(whole, zone);
  return Math.round((Date.UTC(y, mo - 1, d, h, mi, s) - whole) / 60_000);
}

function isDateValue(line: IcsContentLine): boolean {
  return (paramOf(line, 'VALUE') ?? '').toUpperCase() === 'DATE' || /^\d{8}$/.test(line.value.trim());
}

/** Which zone a TZID (or a floating time, with none) is read in. */
type ZoneFor = (tzid: string | undefined) => string;

function zoneReader(masterZone: string, timezone: string): ZoneFor {
  // A TZID that is not an IANA name ("Central Standard Time") is the one the
  // main event uses, which node-ical has already resolved to `masterZone`.
  return (tzid) => (tzid ? (isKnownTimezone(tzid) ? tzid : masterZone) : timezone);
}

/** The dates or instants a DTSTART, RECURRENCE-ID or EXDATE line names. */
function readDateValues(line: string, zoneFor: ZoneFor): OccurrenceRef[] {
  const parsed = parseContentLine(line);
  const asDate = (paramOf(parsed, 'VALUE') ?? '').toUpperCase() === 'DATE';
  const tzid = paramOf(parsed, 'TZID');
  const refs: OccurrenceRef[] = [];
  for (const raw of parsed.value.split(',')) {
    const value = raw.trim();
    if (asDate || /^\d{8}$/.test(value)) {
      if (/^\d{8}/.test(value)) refs.push({ date: isoFromIcsDate(value) });
    } else if (/^\d{8}T\d{6}Z$/i.test(value)) {
      refs.push({ instant: Date.parse(`${localFromIcs(value)}Z`) });
    } else if (/^\d{8}T\d{6}$/.test(value)) {
      refs.push({ instant: parseDateInTZ(localFromIcs(value), zoneFor(tzid)).getTime() });
    }
  }
  return refs;
}

function dayOf(ref: OccurrenceRef, timezone: string): string {
  return 'date' in ref ? ref.date : isoDateInTZ(new Date(ref.instant), timezone);
}

function sameOccurrence(a: OccurrenceRef, b: OccurrenceRef, timezone: string): boolean {
  if ('date' in a && 'date' in b) return a.date === b.date;
  if ('instant' in a && 'instant' in b) return a.instant === b.instant;
  return dayOf(a, timezone) === dayOf(b, timezone);
}

/**
 * A RECURRENCE-ID or EXDATE line for one day of a series, in the form the
 * series' own DTSTART uses (RFC 5545 says they must match): a date, a UTC
 * time, or a wall time in the same TZID. Also that day's own DTSTART and
 * DTEND, when a changed day keeps the times its series gives it.
 */
function lineLike(name: 'RECURRENCE-ID' | 'EXDATE' | 'DTSTART' | 'DTEND', dtstart: string, ref: OccurrenceRef, masterZone: string): string {
  const start = parseContentLine(dtstart);
  if (isDateValue(start)) return `${name};VALUE=DATE:${icsDate(dayOf(ref, masterZone))}`;
  const ms = 'instant' in ref ? ref.instant : parseDateInTZ(`${ref.date}${localFromIcs(start.value.trim()).slice(10)}`, masterZone).getTime();
  if (/Z$/i.test(start.value.trim())) return `${name}:${icsUtc(ms)}`;
  const tzParam = start.params.find((p) => /^TZID=/i.test(p));
  return `${name}${tzParam ? `;${tzParam}` : ''}:${icsLocal(wallTime(ms, masterZone))}`;
}

type EventTimes = Pick<calendar_v3.Schema$Event, 'start' | 'end'>;

/** A start or end in Google's shape (what `toGoogleTimes` and `seriesTimes` answer) as an ICS line. */
function timeLine(name: string, when: calendar_v3.Schema$EventDateTime | undefined): string {
  if (when?.date) return `${name};VALUE=DATE:${icsDate(when.date)}`;
  return `${name};TZID=${when?.timeZone ?? 'UTC'}:${icsLocal(when?.dateTime ?? '')}`;
}

function yearOf(times: EventTimes): number {
  return Number((times.start?.date ?? times.start?.dateTime ?? '').slice(0, 4));
}

// ── VTIMEZONE from the runtime's own time zone data ───────────────────

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface Transition {
  /** The instant the clocks change. */
  at: number;
  from: number;
  to: number;
}

interface Onset {
  /** The local time just before the change, `YYYYMMDDTHHMMSS`, the way a VTIMEZONE DTSTART is written. */
  local: string;
  year: number;
  month: number;
  day: number;
  weekday: number;
  time: string;
}

/** Every change of `zone`'s UTC offset during `year`, found by probing each day and narrowing to the minute. */
function transitionsIn(zone: string, year: number): Transition[] {
  const found: Transition[] = [];
  const end = Date.UTC(year + 1, 0, 1);
  let t = Date.UTC(year, 0, 1);
  let offset = offsetMinutes(zone, t);
  while (t < end) {
    const next = Math.min(t + DAY_MS, end);
    const nextOffset = offsetMinutes(zone, next);
    if (nextOffset !== offset) {
      let lo = t;
      let hi = next;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
        if (offsetMinutes(zone, mid) === offset) lo = mid;
        else hi = mid;
      }
      found.push({ at: hi, from: offset, to: nextOffset });
    }
    t = next;
    offset = nextOffset;
  }
  return found;
}

function onsetOf(transition: Transition): Onset {
  const local = new Date(transition.at + transition.from * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const time = `${p(local.getUTCHours())}${p(local.getUTCMinutes())}${p(local.getUTCSeconds())}`;
  return {
    local: `${local.getUTCFullYear()}${p(local.getUTCMonth() + 1)}${p(local.getUTCDate())}T${time}`,
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
    time,
  };
}

function utcOffsetText(minutes: number): string {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The yearly BYDAY a set of changes, one a year, all follow ("2SU", "-1SU"), or null when they follow none. */
function yearlyByDay(onsets: Onset[]): string | null {
  const first = onsets[0];
  if (onsets.some((o) => o.month !== first.month || o.weekday !== first.weekday || o.time !== first.time)) return null;
  const code = WEEKDAY_CODES[first.weekday];
  // "Last" first: a last-Sunday rule can land on the 4th Sunday several years running.
  if (onsets.every((o) => o.day + 7 > daysInMonth(o.year, o.month))) return `-1${code}`;
  const nth = Math.ceil(first.day / 7);
  return onsets.every((o) => Math.ceil(o.day / 7) === nth) ? `${nth}${code}` : null;
}

function observance(kind: 'STANDARD' | 'DAYLIGHT', from: number, to: number, start: string, rrule?: string): IcsComponent {
  return {
    name: kind,
    props: [`DTSTART:${start}`, `TZOFFSETFROM:${utcOffsetText(from)}`, `TZOFFSETTO:${utcOffsetText(to)}`, ...(rrule ? [rrule] : [])],
    children: [],
  };
}

/**
 * The years a zone's changes are read for: from the year before the event
 * (where a yearly rule's DTSTART sits, so the event's whole year is covered)
 * to past the longest repeat. A yearly rule has to hold for every one of
 * them: "the Friday before the last Sunday" reads as the 4th Friday for
 * years at a time, until a year whose last Sunday is the 31st.
 */
const YEARS_BEFORE = 1;
const YEARS_AFTER = 11;

function buildVTimezone(zone: string, year: number): IcsComponent {
  const years: number[] = [];
  for (let y = year - YEARS_BEFORE; y <= year + YEARS_AFTER; y++) years.push(y);
  const perYear = years.map((y) => transitionsIn(zone, y));
  const children: IcsComponent[] = [];

  if (perYear.every((list) => list.length === 0)) {
    const offset = offsetMinutes(zone, Date.UTC(year, 0, 1));
    children.push(observance('STANDARD', offset, offset, '19700101T000000'));
  } else {
    const yearly = perYear.every((list) => list.length === 2 && list.filter((t) => t.to > t.from).length === 1)
      ? (['DAYLIGHT', 'STANDARD'] as const).map((kind) => {
          const changes = perYear.map((list) => list.find((t) => (kind === 'DAYLIGHT' ? t.to > t.from : t.to < t.from))!);
          const same = changes.every((t) => t.from === changes[0].from && t.to === changes[0].to);
          const onsets = changes.map(onsetOf);
          const byDay = same ? yearlyByDay(onsets) : null;
          return byDay
            ? observance(kind, changes[0].from, changes[0].to, onsets[0].local, `RRULE:FREQ=YEARLY;BYMONTH=${onsets[0].month};BYDAY=${byDay}`)
            : null;
        })
      : [null];
    if (yearly.every((o): o is IcsComponent => o !== null)) {
      children.push(...yearly);
    } else {
      // No rule a calendar app can repeat (several changes a year, or the
      // rules change): every change is listed on its own.
      for (const list of perYear) {
        for (const t of list) {
          children.push(observance(t.to > t.from ? 'DAYLIGHT' : 'STANDARD', t.from, t.to, onsetOf(t).local));
        }
      }
    }
  }
  return { name: 'VTIMEZONE', props: [`TZID:${zone}`], children };
}

const vtimezoneCache = new Map<string, IcsComponent>();

/**
 * A VTIMEZONE for `zone` around `year`, built from the runtime's own time
 * zone data (no extra dependency). The zone's UTC offset is probed to find
 * its yearly changes, which become STANDARD and DAYLIGHT parts with yearly
 * rules (the nth or last weekday of a month); a zone without daylight saving
 * gets one STANDARD. Repeats then keep their wall time across a change in
 * every calendar app, not only those that know the IANA name.
 */
export function vtimezoneFor(zone: string, year: number): IcsComponent {
  const key = `${zone}|${year}`;
  let built = vtimezoneCache.get(key);
  if (!built) {
    built = buildVTimezone(zone, year);
    vtimezoneCache.set(key, built);
  }
  return structuredClone(built);
}

/** Add a VTIMEZONE for `zone` unless the document already has one with that TZID. */
function ensureVTimezone(calendar: IcsComponent, zone: string, year: number): void {
  const has = calendar.children.some((c) => {
    const tzid = getProp(c, 'TZID');
    return c.name === 'VTIMEZONE' && tzid !== undefined && parseContentLine(tzid).value.trim() === zone;
  });
  if (has) return;
  const firstEvent = calendar.children.findIndex((c) => c.name !== 'VTIMEZONE');
  calendar.children.splice(firstEvent < 0 ? calendar.children.length : firstEvent, 0, vtimezoneFor(zone, year));
}

// ── New events ────────────────────────────────────────────────────────

/**
 * The calendar object for a new event: an all-day event as dates with its
 * exclusive end, a timed one on the household's clock with that zone's
 * VTIMEZONE, the repeat's RRULE, and the Home Screens marker.
 */
export function buildICloudEvent(event: NormalizedEvent, opts: { uid: string; now: Date }): string {
  const times = toGoogleTimes(event);
  const rrule = repeatToRRule(event);
  const vevent: IcsComponent = {
    name: 'VEVENT',
    props: [
      `UID:${opts.uid}`,
      `DTSTAMP:${icsUtc(opts.now.getTime())}`,
      timeLine('DTSTART', times.start),
      timeLine('DTEND', times.end),
      `SUMMARY:${escapeIcsText(event.title)}`,
      ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
      ...(rrule ? [rrule] : []),
      `${ICLOUD_MARKER_PROPERTY}:1`,
    ],
    children: [],
  };
  const calendar: IcsComponent = {
    name: 'VCALENDAR',
    props: [`PRODID:${ICLOUD_PRODID}`, 'VERSION:2.0', 'CALSCALE:GREGORIAN'],
    children: event.allDay ? [vevent] : [vtimezoneFor(event.timeZone, yearOf(times)), vevent],
  };
  return serializeIcsDocument(calendar);
}

/** The wall's key for an event's first day, as `parseICSEvents` builds it: its date, or its start instant. */
function firstOccurrenceKey(event: NormalizedEvent): string {
  return event.allDay ? event.startDate : parseDateInTZ(event.startLocal, event.timeZone).toISOString();
}

// ── Finding the day that was tapped ───────────────────────────────────

const OCCURRENCE_ID = /^(.+):(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?)$/;

/**
 * An iCloud event's id on the wall is `<calendarId>:<uid>:<occurrence>`,
 * where the occurrence is the day (all day) or the start instant (timed).
 * This splits the part after the calendar. A UID may hold colons of its own;
 * the occurrence never does at its end, so it is read from there.
 */
export function splitICloudEventId(eventId: string): { uid: string; occurrence: string } | null {
  const match = OCCURRENCE_ID.exec(eventId);
  return match ? { uid: match[1], occurrence: match[2] } : null;
}

/** The day of a series (or the one-off) the family tapped, as the stored object holds it. */
export interface LocatedOccurrence {
  uid: string;
  /** The object holds a repeating series: its main event has an RRULE. */
  series: boolean;
  /** For a day of a series, its original start, the way RECURRENCE-ID names it. */
  recurrenceId?: OccurrenceRef;
  /** That day as the wall shows it. */
  shown: CalendarEvent;
  /** The series' own first start, for moving it by the days one day moved. */
  seriesStart: calendar_v3.Schema$EventDateTime;
  /** The IANA zone the main event's times are written in (the household's for floating times). */
  masterZone: string;
}

const PROBE_SOURCE = { id: 'icloud-write', name: 'iCloud event', color: '' };

function notEditable(): CalendarWriteError {
  return new CalendarWriteError('calendarWrite.notEditable', "That event can't be changed here.", undefined, { status: 403 });
}

function gone(): CalendarWriteError {
  return writeRefusalForStatus(404, 'iCloud');
}

function changedElsewhere(): CalendarWriteError {
  return writeRefusalForStatus(412, 'iCloud');
}

function isGone(err: unknown): boolean {
  return err instanceof CalendarWriteError && err.code === 'calendarWrite.gone';
}

/** A changed day's key the way the wall's event id carries it (its own all-day-ness, as `parseICSEvents` reads it). */
function changedDayKey(day: VEvent): string {
  return day.datetype === 'date' ? localISODate(day.start) : day.start.toISOString();
}

function refOf(date: DateWithTimeZone): OccurrenceRef {
  return date.dateOnly ? { date: localISODate(date) } : { instant: date.getTime() };
}

/**
 * Find the day `eventId` names in a stored object, read the same way the
 * wall read it (so its id matches), and what a change needs to know about
 * it. Throws `gone` when the object no longer holds that day.
 */
export function locateOccurrence(text: string, eventId: string, timezone: string): LocatedOccurrence {
  const ref = splitICloudEventId(eventId);
  if (!ref) throw notEditable();
  const parsed = ical.sync.parseICS(normalizeIcsTimezones(text, { floatingZone: timezone }).text);
  const entry = Object.prototype.hasOwnProperty.call(parsed, ref.uid) ? parsed[ref.uid] : undefined;
  if (!entry || entry.type !== 'VEVENT' || !entry.start) throw gone();
  const at = isIsoDate(ref.occurrence) ? parseDateInTZ(ref.occurrence, timezone).getTime() : Date.parse(ref.occurrence);
  const shown = parseICSEvents(text, PROBE_SOURCE, new Date(at - 2 * DAY_MS), new Date(at + 3 * DAY_MS), timezone)
    .find((e) => e.id === `${PROBE_SOURCE.id}:${ref.uid}:${ref.occurrence}`);
  if (!shown) throw gone();

  const series = Boolean(entry.rrule);
  const masterTz = entry.start.tz;
  const masterZone = masterTz && isKnownTimezone(masterTz) ? masterTz : timezone;
  let recurrenceId: OccurrenceRef | undefined;
  if (series) {
    // node-ical files each changed day under two keys (its date and its instant).
    const changedDays = [...new Set(Object.values(entry.recurrences ?? {}))] as VEvent[];
    const changed = changedDays.find((day) => day.start && day.recurrenceid && changedDayKey(day) === ref.occurrence);
    if (changed?.recurrenceid) recurrenceId = refOf(changed.recurrenceid);
    else recurrenceId = entry.datetype === 'date' ? { date: ref.occurrence.slice(0, 10) } : { instant: at };
  }
  return {
    uid: ref.uid,
    series,
    ...(recurrenceId ? { recurrenceId } : {}),
    shown,
    seriesStart: entry.datetype === 'date' ? { date: localISODate(entry.start) } : { dateTime: entry.start.toISOString() },
    masterZone,
  };
}

// ── Changing the stored text ──────────────────────────────────────────

interface ObjectEvents {
  master?: IcsComponent;
  changed: IcsComponent[];
}

function eventsOf(calendar: IcsComponent, uid: string): ObjectEvents {
  const vevents = calendar.children.filter((c) => c.name === 'VEVENT' && uidOf(c) === uid);
  return {
    master: vevents.find((c) => getProp(c, 'RECURRENCE-ID') === undefined),
    changed: vevents.filter((c) => getProp(c, 'RECURRENCE-ID') !== undefined),
  };
}

function findChanged(changed: IcsComponent[], ref: OccurrenceRef, zoneFor: ZoneFor, timezone: string): IcsComponent | undefined {
  return changed.find((c) => {
    const rid = readDateValues(getProp(c, 'RECURRENCE-ID') ?? '', zoneFor)[0];
    return rid !== undefined && sameOccurrence(rid, ref, timezone);
  });
}

const TIMING_PROPS = ['DTSTART', 'DTEND', 'DURATION', 'RRULE', 'EXDATE', 'RDATE', 'RECURRENCE-ID'];

function timingOf(component: IcsComponent): string {
  return component.props.filter((p) => TIMING_PROPS.includes(propName(p))).join('\n');
}

/** Stamp a component as revised now; a change of when it happens also bumps SEQUENCE (RFC 5545 3.8.7.4). */
function markRevised(component: IcsComponent, now: Date, timingBefore: string): void {
  setProp(component, 'DTSTAMP', `DTSTAMP:${icsUtc(now.getTime())}`);
  if (getProp(component, 'LAST-MODIFIED') !== undefined) setProp(component, 'LAST-MODIFIED', `LAST-MODIFIED:${icsUtc(now.getTime())}`);
  if (timingOf(component) !== timingBefore) {
    const sequence = Number(parseContentLine(getProp(component, 'SEQUENCE') ?? 'SEQUENCE:0').value) || 0;
    setProp(component, 'SEQUENCE', `SEQUENCE:${sequence + 1}`);
  }
}

function setTitle(component: IcsComponent, title: string): void {
  setProp(component, 'SUMMARY', `SUMMARY:${escapeIcsText(title)}`);
}

function setPlace(component: IcsComponent, location: string | undefined): void {
  if ((textOf(component, 'LOCATION') ?? '') === (location ?? '')) return;
  setProp(component, 'LOCATION', location ? `LOCATION:${escapeIcsText(location)}` : null);
  // Apple keeps the map pin for a place beside its text; a pin for the old
  // place would put the event somewhere it no longer is.
  setProp(component, 'X-APPLE-STRUCTURED-LOCATION', null);
}

function setTimes(component: IcsComponent, times: EventTimes): void {
  setProp(component, 'DTSTART', timeLine('DTSTART', times.start ?? undefined));
  setProp(component, 'DTEND', timeLine('DTEND', times.end ?? undefined));
  setProp(component, 'DURATION', null);
}

/**
 * Give a new changed day the times its series already gives that day, as the
 * wall read them, written the way the series writes its own. For a change
 * that leaves the times alone (a new name for one day): the day needs a
 * DTSTART of its own, and it must be the true one, however long the event.
 */
function setTimesAsShown(component: IcsComponent, master: IcsComponent, shown: CalendarEvent, masterZone: string): void {
  const dtstart = getProp(master, 'DTSTART') ?? '';
  const refFor = (value: string): OccurrenceRef => (shown.allDay ? { date: value.slice(0, 10) } : { instant: Date.parse(value) });
  setProp(component, 'DTSTART', lineLike('DTSTART', dtstart, refFor(shown.start), masterZone));
  setProp(component, 'DTEND', lineLike('DTEND', dtstart, refFor(shown.end), masterZone));
}

/** Properties that belong to a series as a whole, never to one changed day. */
const SERIES_ONLY = new Set(['RRULE', 'RDATE', 'EXDATE', 'EXRULE', 'DTSTART', 'DTEND', 'DURATION', 'RECURRENCE-ID', 'DTSTAMP']);

/** A changed day copied from the series: everything it carries (alarms, invitees, notes) except its timing. */
function newChangedDay(master: IcsComponent, ref: OccurrenceRef, masterZone: string): IcsComponent {
  const props = master.props.filter((p) => !SERIES_ONLY.has(propName(p)));
  const uidAt = props.findIndex((p) => propName(p) === 'UID');
  props.splice(uidAt + 1, 0, lineLike('RECURRENCE-ID', getProp(master, 'DTSTART') ?? '', ref, masterZone));
  return { name: 'VEVENT', props, children: structuredClone(master.children) };
}

function insertAfterEvent(calendar: IcsComponent, uid: string, component: IcsComponent): void {
  let last = -1;
  calendar.children.forEach((c, i) => {
    if (c.name === 'VEVENT' && uidOf(c) === uid) last = i;
  });
  calendar.children.splice(last + 1, 0, component);
}

/** How long a component runs, in milliseconds, or null without both ends. */
function spanOf(component: IcsComponent, zoneFor: ZoneFor): number | null {
  const start = readDateValues(getProp(component, 'DTSTART') ?? '', zoneFor)[0];
  const end = readDateValues(getProp(component, 'DTEND') ?? '', zoneFor)[0];
  if (!start || !end) return null;
  if ('date' in start && 'date' in end) return Date.UTC(...ymd(end.date)) - Date.UTC(...ymd(start.date));
  if ('instant' in start && 'instant' in end) return end.instant - start.instant;
  return null;
}

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}

/** An RRULE's UNTIL in the other form, for a series that turned all day or timed (RFC 5545 wants UNTIL to match DTSTART). */
function untilFor(rrule: string, allDay: boolean, timezone: string): string {
  return rrule.replace(/UNTIL=(\d{8}(?:T\d{6}Z?)?)/i, (whole, value: string) => {
    if (allDay) {
      if (/^\d{8}$/.test(value)) return whole;
      const day = /Z$/i.test(value) ? isoDateInTZ(new Date(`${localFromIcs(value)}Z`), timezone) : isoFromIcsDate(value);
      return `UNTIL=${icsDate(day)}`;
    }
    if (!/^\d{8}$/.test(value)) return whole;
    const nextMidnight = parseDateInTZ(`${addIsoDays(isoFromIcsDate(value), 1)}T00:00:00`, timezone);
    return `UNTIL=${icsUtc(nextMidnight.getTime() - 1000)}`;
  });
}

/** What a change to a stored event does: the form's answer and which days it reaches. */
export interface ICloudChange {
  scope: ChangeScope;
  event: NormalizedEvent;
  /** The day the form opened on, for moving a series by the same number of days. */
  dayWas: string;
  /** That day's own times as the form loaded them; see `seriesTimes`. */
  timeWas?: TimeWas;
  /** Write a new repeat rule (it changed). */
  repeatChanged: boolean;
  /**
   * Write new times (the family changed the day or the times). False leaves
   * every DTSTART, DTEND and DURATION as stored, so a new name or place can
   * never move or shorten an event, whatever shape its times have.
   */
  timesChanged: boolean;
  timezone: string;
  now: Date;
}

/**
 * The stored object's text with one change made, keeping every line Home
 * Screens does not show.
 * - A one-off: its own SUMMARY, LOCATION, DTSTART and DTEND (DURATION goes),
 *   and RRULE when the repeat changed.
 * - "Just this day" of a series: that day's changed-day VEVENT (same UID,
 *   RECURRENCE-ID), written or replaced, with the new values.
 * - "Every time": the main VEVENT, keeping the series' own first day moved by
 *   the days this day moved. Skipped and changed days move with it, and a
 *   changed day that still had the old name, place or times takes the new.
 *
 * Times are written only when the family changed them (`timesChanged`).
 */
export function changeICloudObject(text: string, located: LocatedOccurrence, change: ICloudChange): string {
  const calendar = parseIcsDocument(text);
  const { master, changed } = eventsOf(calendar, located.uid);
  const { event, now, timezone } = change;
  const zoneFor = zoneReader(located.masterZone, timezone);

  if (!located.series || !master) {
    // A one-off, or a lone changed day of a series this calendar does not hold.
    const target = master ?? changed[0];
    if (!target) throw gone();
    const times = toGoogleTimes(event);
    const before = timingOf(target);
    setTitle(target, event.title);
    setPlace(target, event.location);
    if (change.timesChanged) setTimes(target, times);
    if (master && change.repeatChanged) setProp(master, 'RRULE', repeatToRRule(event));
    markRevised(target, now, before);
    if (change.timesChanged && !event.allDay) ensureVTimezone(calendar, event.timeZone, yearOf(times));
    return serializeIcsDocument(calendar);
  }

  if (change.scope === 'instance') {
    const ref = located.recurrenceId;
    if (!ref) throw notEditable();
    let target = findChanged(changed, ref, zoneFor, timezone);
    const isNew = !target;
    if (!target) {
      target = newChangedDay(master, ref, located.masterZone);
      insertAfterEvent(calendar, located.uid, target);
    }
    const times = toGoogleTimes(event);
    const before = timingOf(target);
    setTitle(target, event.title);
    setPlace(target, event.location);
    if (change.timesChanged) setTimes(target, times);
    else if (isNew) setTimesAsShown(target, master, located.shown, located.masterZone);
    for (const name of ['RRULE', 'RDATE', 'EXDATE', 'EXRULE']) setProp(target, name, null);
    markRevised(target, now, before);
    if (change.timesChanged && !event.allDay) ensureVTimezone(calendar, event.timeZone, yearOf(times));
    return serializeIcsDocument(calendar);
  }

  editSeries(calendar, master, changed, located, change, zoneFor);
  return serializeIcsDocument(calendar);
}

function editSeries(
  calendar: IcsComponent,
  master: IcsComponent,
  changed: IcsComponent[],
  located: LocatedOccurrence,
  change: ICloudChange,
  zoneFor: ZoneFor,
): void {
  const { event, dayWas, timeWas, timezone, now } = change;
  const oldStart = getProp(master, 'DTSTART') ?? '';
  const wasAllDay = isDateValue(parseContentLine(oldStart));
  const oldTitle = textOf(master, 'SUMMARY') ?? '';
  const oldPlace = textOf(master, 'LOCATION') ?? '';
  const oldSpan = spanOf(master, zoneFor);
  const before = timingOf(master);

  // A start with the series' own length after it, for `seriesTimes` to move and grow.
  const withEnd = (start: OccurrenceRef) => {
    if ('date' in start) {
      return { start: { date: start.date }, ...(wasAllDay && oldSpan !== null ? { end: { date: addIsoDays(start.date, Math.round(oldSpan / DAY_MS)) } } : {}) };
    }
    return {
      start: { dateTime: new Date(start.instant).toISOString() },
      ...(!wasAllDay && oldSpan !== null ? { end: { dateTime: new Date(start.instant + oldSpan).toISOString() } } : {}),
    };
  };
  const seriesStart: OccurrenceRef = located.seriesStart.date
    ? { date: located.seriesStart.date }
    : { instant: Date.parse(located.seriesStart.dateTime ?? '') };

  setTitle(master, event.title);
  setPlace(master, event.location);
  if (change.timesChanged) {
    const times = seriesTimes(event, withEnd(seriesStart), dayWas, timezone, timeWas);
    setTimes(master, times);
    if (!event.allDay) ensureVTimezone(calendar, event.timeZone, yearOf(times));
  }

  if (change.repeatChanged) {
    // With its times left alone the series keeps its own shape, which one of its days may not share.
    const rrule = repeatToRRule(event, change.timesChanged ? event : wasAllDay ? { allDay: true } : { allDay: false, timeZone: timezone });
    if (!rrule) {
      // It no longer repeats, so its skipped and changed days go with the rule.
      for (const name of ['RRULE', 'RDATE', 'EXDATE', 'EXRULE']) setProp(master, name, null);
      calendar.children = calendar.children.filter((c) => !changed.includes(c));
      markRevised(master, now, before);
      return;
    }
    setProp(master, 'RRULE', rrule);
  } else if (change.timesChanged && wasAllDay !== event.allDay) {
    master.props = master.props.map((p) => (propName(p) === 'RRULE' ? untilFor(p, event.allDay, timezone) : p));
  }

  // Where one day of the series lands now: that day moved like the series,
  // at the new times.
  const onDay = (ref: OccurrenceRef) => seriesTimes(event, withEnd(ref), dayWas, timezone, timeWas);
  const moved = getProp(master, 'DTSTART') !== oldStart;

  if (moved) {
    master.props = master.props.map((p) => {
      if (propName(p) !== 'EXDATE') return p;
      const days = readDateValues(p, zoneFor).map((ref) => onDay(ref).start ?? {});
      if (days.length === 0) return p;
      return event.allDay
        ? `EXDATE;VALUE=DATE:${days.map((d) => icsDate(d.date ?? '')).join(',')}`
        : `EXDATE;TZID=${event.timeZone}:${days.map((d) => icsLocal(d.dateTime ?? '')).join(',')}`;
    });
  }

  for (const day of changed) {
    const dayBefore = timingOf(day);
    const propsBefore = day.props.join('\n');
    const ridLine = getProp(day, 'RECURRENCE-ID');
    const rid = ridLine ? readDateValues(ridLine, zoneFor)[0] : undefined;
    if (moved && rid) {
      const dayStart = readDateValues(getProp(day, 'DTSTART') ?? '', zoneFor)[0];
      const unmoved = dayStart !== undefined && sameOccurrence(dayStart, rid, timezone)
        && ('date' in dayStart) === ('date' in rid) && oldSpan !== null && spanOf(day, zoneFor) === oldSpan;
      const landing = onDay(rid);
      setProp(day, 'RECURRENCE-ID', timeLine('RECURRENCE-ID', landing.start ?? undefined));
      if (unmoved) setTimes(day, landing);
    }
    if ((textOf(day, 'SUMMARY') ?? '') === oldTitle) setTitle(day, event.title);
    if ((textOf(day, 'LOCATION') ?? '') === oldPlace) setPlace(day, event.location);
    if (day.props.join('\n') !== propsBefore) markRevised(day, now, dayBefore);
  }
  markRevised(master, now, before);
}

/**
 * The stored object's text with one day of a series skipped: an EXDATE for
 * it on the series, and its changed-day VEVENT (if it had one) dropped.
 */
export function removeICloudOccurrence(text: string, located: LocatedOccurrence, change: { timezone: string; now: Date }): string {
  const calendar = parseIcsDocument(text);
  const { master, changed } = eventsOf(calendar, located.uid);
  const ref = located.recurrenceId;
  if (!master || !ref) throw notEditable();
  const zoneFor = zoneReader(located.masterZone, change.timezone);
  const before = timingOf(master);
  const target = findChanged(changed, ref, zoneFor, change.timezone);
  if (target) calendar.children = calendar.children.filter((c) => c !== target);
  const skipped = master.props
    .filter((p) => propName(p) === 'EXDATE')
    .some((p) => readDateValues(p, zoneFor).some((r) => sameOccurrence(r, ref, change.timezone)));
  if (!skipped) {
    let after = -1;
    master.props.forEach((p, i) => {
      if (propName(p) === 'RRULE' || propName(p) === 'EXDATE') after = i;
    });
    master.props.splice(after < 0 ? master.props.length : after + 1, 0, lineLike('EXDATE', getProp(master, 'DTSTART') ?? '', ref, located.masterZone));
  }
  markRevised(master, change.now, before);
  return serializeIcsDocument(calendar);
}

/** The series' recurrence lines in the shape `repeatFromRecurrence` reads (Google's `recurrence`). */
function recurrenceLines(calendar: IcsComponent, uid: string): string[] {
  const master = eventsOf(calendar, uid).master;
  if (!master) return [];
  return master.props
    .filter((p) => ['RRULE', 'RDATE', 'EXRULE', 'EXDATE'].includes(propName(p)))
    .map((p) => `${propName(p)}:${parseContentLine(p).value}`);
}

// ── Where a write may go ──────────────────────────────────────────────

function calendarBase(source: ICloudSource): string {
  return source.url.endsWith('/') ? source.url : `${source.url}/`;
}

function checkSource(source: ICloudSource, account: ICloudAccount): void {
  if (source.kind !== 'calendar' || source.accountId !== account.id || !isICloudUrl(source.url)) throw notEditable();
}

/**
 * The calendar object address a change may go to: an iCloud https address
 * directly inside this source's calendar, and nothing else. `sourceRef`
 * comes back from a phone or a wall, so this is what stops one from pointing
 * a write (and the app password that rides it) at another calendar or host.
 */
export function icloudObjectUrl(source: ICloudSource, sourceRef: unknown): string {
  if (typeof sourceRef !== 'string' || !isICloudUrl(source.url)) throw notEditable();
  let url: URL;
  let base: URL;
  try {
    url = new URL(sourceRef);
    base = new URL(calendarBase(source));
  } catch {
    throw notEditable();
  }
  if (!isICloudUrl(url.href) || url.origin !== base.origin || url.username || url.password || url.search || url.hash) throw notEditable();
  if (!url.pathname.startsWith(base.pathname)) throw notEditable();
  const name = url.pathname.slice(base.pathname.length);
  if (!name || name.includes('/') || /%2f|%5c/i.test(name)) throw notEditable();
  return url.href;
}

// ── iCloud ────────────────────────────────────────────────────────────

/** What the phone and the wall need to open Change on one event. Same shape as Google's, plus the object's address. */
export interface EditableICloudEvent {
  /** The iCloud calendar (source) id. */
  calendarId: string;
  /** `<uid>:<occurrence>`: the wall's event id after the calendar. */
  eventId: string;
  /** The calendar object's version, sent back with the change. One for the whole series and its changed days. */
  etag: string;
  /** The calendar object's address, sent back with the change. */
  sourceRef: string;
  /** The series (its UID) and its version, when this is one day of a repeating event. On iCloud the version is the object's. */
  seriesId?: string;
  seriesEtag?: string;
  draft: EventDraft;
  /** How the series repeats, as a family choice, or `other` when it was set up elsewhere in a way the forms cannot edit. */
  repeat: RepeatReading;
}

interface StoredObject {
  url: string;
  etag: string;
  data: string;
}

/** iCloud's HTTP answer in the family's words. A 401 means the app password was turned away, so the next request signs in afresh. */
function refusal(account: ICloudAccount, status: number | undefined): CalendarWriteError {
  if (status === 401) forgetICloudClient(account);
  if (!isKnownWriteStatus(status)) log.warn(`iCloud refused a calendar write (HTTP ${status ?? 'none'})`);
  return writeRefusalForStatus(status, 'iCloud');
}

async function call<T>(account: ICloudAccount, label: string, run: (client: ICloudCalDAVClient, fetchOptions: RequestInit) => Promise<T>): Promise<T> {
  try {
    return await withICloudClient(account, label, run);
  } catch (err) {
    if (err instanceof CalendarWriteError) throw err;
    log.warn(`${label} did not get an answer from iCloud (${describeWriteFailure(err, undefined)})`);
    throw writeRefusalForStatus(undefined, 'iCloud');
  }
}

/**
 * The object as iCloud holds it now, through the same calendar-multiget
 * REPORT the event fetch uses. Asked through `davRequest` rather than tsdav's
 * `calendarMultiGet`, which throws away the status of a missing object.
 */
async function fetchStoredObject(source: ICloudSource, account: ICloudAccount, url: string): Promise<StoredObject> {
  const responses = await call(account, 'iCloud event', (client, fetchOptions) =>
    client.davRequest({
      url: calendarBase(source),
      init: {
        method: 'REPORT',
        namespace: 'c',
        headers: { depth: '1' },
        body: {
          'calendar-multiget': {
            _attributes: { 'xmlns:d': 'DAV:', 'xmlns:c': 'urn:ietf:params:xml:ns:caldav' },
            'd:prop': { 'd:getetag': {}, 'c:calendar-data': {} },
            'd:href': [new URL(url).pathname],
          },
        },
      },
      fetchOptions,
    }),
  );
  const found = responses.find((r) => r.ok && r.props?.calendarData);
  if (!found) {
    const status = responses.find((r) => !r.ok)?.status;
    // An answer that names no such object, or names it 404, means it is gone.
    throw refusal(account, status === undefined || (status >= 200 && status < 300) ? 404 : status);
  }
  const raw = found.props?.calendarData as unknown;
  const data = typeof raw === 'string' ? raw : (raw as { _cdata?: unknown; _text?: unknown })?._cdata ?? (raw as { _text?: unknown })?._text;
  const etag = found.props?.getetag as unknown;
  // Without a version a change could overwrite one made elsewhere.
  if (typeof data !== 'string' || etag === undefined || etag === null || etag === '') throw notEditable();
  return { url, etag: String(etag), data };
}

async function putStoredObject(account: ICloudAccount, stored: StoredObject, data: string): Promise<void> {
  const response = await call(account, 'iCloud change', (client, fetchOptions) =>
    client.updateCalendarObject({ calendarObject: { url: stored.url, etag: stored.etag, data }, fetchOptions }),
  );
  if (!response.ok) throw refusal(account, response.status);
}

/** Read the object, check it is still the version the form loaded, and find the day. */
async function load(
  source: ICloudSource,
  account: ICloudAccount,
  input: { eventId: string; sourceRef: unknown; timezone: string; etag?: string },
): Promise<{ stored: StoredObject; located: LocatedOccurrence }> {
  checkSource(source, account);
  const url = icloudObjectUrl(source, input.sourceRef);
  const stored = await fetchStoredObject(source, account, url);
  if (input.etag !== undefined && stored.etag !== input.etag) throw changedElsewhere();
  return { stored, located: locateOccurrence(stored.data, input.eventId, input.timezone) };
}

/** One event, ready for the Change form: the day the family tapped, and the series it belongs to. */
export async function getICloudEventForEdit(
  source: ICloudSource,
  account: ICloudAccount,
  input: { eventId: string; sourceRef: string; timezone: string },
): Promise<EditableICloudEvent> {
  const { stored, located } = await load(source, account, input);
  const calendar = parseIcsDocument(stored.data);
  const { master, changed } = eventsOf(calendar, located.uid);
  const zoneFor = zoneReader(located.masterZone, input.timezone);
  const component = (located.recurrenceId && findChanged(changed, located.recurrenceId, zoneFor, input.timezone)) || master || changed[0];
  const repeat = located.series ? repeatFromRecurrence(recurrenceLines(calendar, located.uid), input.timezone) : ({ kind: 'none' } as const);
  const { shown } = located;
  const when = (value: string) => (shown.allDay ? { date: value } : { dateTime: value });
  const location = component ? textOf(component, 'LOCATION') : undefined;
  const draft = draftFromGoogle(
    { summary: (component && textOf(component, 'SUMMARY')) ?? '', ...(location ? { location } : {}), start: when(shown.start), end: when(shown.end) },
    input.timezone,
    repeat,
  );
  return {
    calendarId: source.id,
    eventId: input.eventId,
    etag: stored.etag,
    sourceRef: stored.url,
    ...(located.series ? { seriesId: located.uid, seriesEtag: stored.etag } : {}),
    draft,
    repeat,
  };
}

/** Add an event. Answers its id the way the wall will read it back, so the wall can outline it once it arrives. */
export async function createICloudEvent(source: ICloudSource, account: ICloudAccount, event: NormalizedEvent): Promise<{ id: string }> {
  checkSource(source, account);
  const name = randomUUID();
  const uid = `${name}@homescreens.dev`;
  const text = buildICloudEvent(event, { uid, now: new Date() });
  const response = await call(account, 'iCloud add', (client, fetchOptions) =>
    client.createCalendarObject({ calendar: { url: calendarBase(source) } as DAVCalendar, iCalString: text, filename: `${name}.ics`, fetchOptions }),
  );
  if (!response.ok) throw refusal(account, response.status);
  return { id: `${source.id}:${uid}:${firstOccurrenceKey(event)}` };
}

/**
 * Change an event. `instance` changes the one event, or the one day of a
 * series; `series` changes every time. `etag` must be the one the form
 * loaded (the object's, which is the same for both scopes).
 */
export async function updateICloudEvent(
  source: ICloudSource,
  account: ICloudAccount,
  input: {
    /** `<uid>:<occurrence>`, the wall's event id after the calendar. */
    eventId: string;
    sourceRef: string;
    etag: string;
    scope: ChangeScope;
    /** The day the form opened on, for moving a series by the same number of days. */
    dayWas: string;
    /** That day's own times as the form loaded them; see `seriesTimes`. */
    timeWas?: TimeWas;
    event: NormalizedEvent;
    /** Send a new repeat rule (it changed). */
    repeatChanged: boolean;
    /** Write new times (the family changed the day or the times). */
    timesChanged: boolean;
    timezone: string;
  },
): Promise<void> {
  const { stored, located } = await load(source, account, input);
  const text = changeICloudObject(stored.data, located, {
    scope: input.scope,
    event: input.event,
    dayWas: input.dayWas,
    ...(input.timeWas ? { timeWas: input.timeWas } : {}),
    repeatChanged: input.repeatChanged,
    timesChanged: input.timesChanged,
    timezone: input.timezone,
    now: new Date(),
  });
  await putStoredObject(account, stored, text);
}

/**
 * Remove an event: the one day (`instance`, an EXDATE on its series) or the
 * whole event (`series`, or any one-off). Already gone counts as done. With
 * `etag`, a change made elsewhere since the form loaded is refused instead.
 */
export async function deleteICloudEvent(
  source: ICloudSource,
  account: ICloudAccount,
  input: { eventId: string; sourceRef: string; scope: ChangeScope; timezone: string; etag?: string },
): Promise<void> {
  let loaded: Awaited<ReturnType<typeof load>>;
  try {
    loaded = await load(source, account, input);
  } catch (err) {
    if (isGone(err)) return;
    throw err;
  }
  const { stored, located } = loaded;
  try {
    if (input.scope === 'instance' && located.series) {
      await putStoredObject(account, stored, removeICloudOccurrence(stored.data, located, { timezone: input.timezone, now: new Date() }));
      return;
    }
    const response = await call(account, 'iCloud remove', (client, fetchOptions) =>
      client.deleteCalendarObject({ calendarObject: { url: stored.url, etag: stored.etag }, fetchOptions }),
    );
    if (!response.ok) throw refusal(account, response.status);
  } catch (err) {
    if (isGone(err)) return;
    throw err;
  }
}
