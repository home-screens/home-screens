/**
 * School timetables: `data/timetables.json`.
 *
 * One document holds every school's bell schedule, the subject list everyone
 * shares, and one week grid per person. The editor loads it whole and saves it
 * whole, so a save quotes the revision it started from and is refused when
 * somebody else saved first, the same way the family list works.
 *
 * A timetable names a person by `memberId` and holds nothing else about them,
 * so the family roster stays the one place a name, colour or picture lives.
 * Member ids are checked against that roster on every save, inside the same
 * coordinator section as the write, so nobody can be removed between the check
 * and the file landing.
 *
 * A household that has never saved gets the subject catalogue for its
 * language to paint with. That default is handed out by `readTimetables`
 * only: nothing is written until the first real save.
 */

import { createHash } from 'node:crypto';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import {
  DAY_KEYS,
  TIMETABLE_LIMITS,
  type Timetable,
  type TimetableCell,
  type TimetableData,
  type TimetableSchool,
  type TimetableSlot,
  type TimetableNote,
  type TimetableSpecialDay,
  type TimetableSubject,
  type TimetableWeek,
} from '@/types/timetables';
import { isValidISODate } from './api-utils';
import { readConfig } from './config';
import { readTransactionFile, withDataTransaction } from './data-transaction';
import { validateMemberReferences, withFamilyData } from './family-api';
import { createJsonStore } from './json-store';
import { parseTimeToMinutes } from './sleep-timeline';
import { RefusalError, type RefusalOptions } from './refusal';
import { getDefaultSubjects } from './timetable-subjects';

export const TIMETABLES_FILE_PATH = 'data/timetables.json';

const EMPTY: TimetableData = { schools: [], subjects: [], timetables: [] };

const store = createJsonStore<TimetableData>({
  path: TIMETABLES_FILE_PATH,
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

/**
 * Why a save was turned down. Each one has a sentence in the `editor`
 * dictionary under `refusals.timetables`.
 *
 * Three different refusals share a 409: a save that started from an older
 * copy, a save naming somebody who has left the family, and a file that
 * cannot be read at all. Only the first is a conflict the editor may resolve
 * by adopting the saved document (which the refusal carries); doing that for
 * the other two threw away everything unsaved and explained it with the
 * wrong sentence. `timetables.invalid` covers every shape check in
 * `cleanTimetableData`; the editor makes those checks itself before saving,
 * so the English `error` keeps the exact reason for logs and the API.
 */
export type TimetableRefusalCode =
  | 'timetables.revision'
  | 'timetables.member'
  | 'timetables.corrupt'
  | 'timetables.reopen'
  | 'timetables.invalid';

/** Thrown by the operations below; the route wrapper answers with its code. */
export class TimetableError extends RefusalError {
  constructor(status: number, code: TimetableRefusalCode, message: string, options: RefusalOptions = {}) {
    super(status, code, message, options);
    this.name = 'TimetableError';
  }
}

const CORRUPT_MESSAGE = 'The saved timetables could not be read. Restore or repair the file before making changes.';

/** Map an unreadable file to a friendly refusal; anything else passes through. */
function readFailure(error: unknown): unknown {
  return error instanceof SyntaxError ? new TimetableError(409, 'timetables.corrupt', CORRUPT_MESSAGE) : error;
}

export function timetableRevision(data: TimetableData): string {
  return createHash('sha256').update(JSON.stringify(withoutServerNotes(data))).digest('hex').slice(0, 24);
}

/**
 * The document as far as a person's save is concerned.
 *
 * The revision exists to stop two people overwriting each other. The hourly
 * sheet check is not a person: when it records that it looked and what it
 * found, nobody has edited anything, and an editor that happened to be open
 * would have been told "somebody else changed the timetables" by a background
 * job talking to itself. Those two fields are therefore left out of the
 * revision, and carried across a save by `withServerNotes` rather than taken
 * from whatever copy the editor is holding. A check that actually changes a
 * week still changes the revision, which is right: that is a real change.
 */
function withoutServerNotes(data: TimetableData): TimetableData {
  if (!data.timetables?.some?.((timetable) => timetable.source)) return data;
  return {
    ...data,
    timetables: data.timetables.map((timetable) => {
      if (!timetable.source) return timetable;
      const { lastCheckedAt: _checked, lastError: _failed, ...source } = timetable.source;
      return { ...timetable, source };
    }),
  };
}

/** A save keeps the check's own bookkeeping, which was never the editor's to send. */
function withServerNotes(next: TimetableData, saved: TimetableData): TimetableData {
  const before = new Map(saved.timetables.map((timetable) => [timetable.memberId, timetable.source]));
  return {
    ...next,
    timetables: next.timetables.map((timetable) => {
      const was = before.get(timetable.memberId);
      if (!timetable.source || !was || was.url !== timetable.source.url) return timetable;
      return {
        ...timetable,
        source: {
          ...timetable.source,
          ...(was.lastCheckedAt ? { lastCheckedAt: was.lastCheckedAt } : {}),
          ...(was.lastError ? { lastError: was.lastError } : {}),
        },
      };
    }),
  };
}

// ── Field cleaning ──

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const CLOCK_TIME = /^\d{2}:\d{2}$/;
const WEB_LINK = /^https?:\/\//i;
/** Ids are minted by the editor (a uuid, or a short slug for the built-in subjects). */
const MAX_ID_LENGTH = 64;
/** Long enough for a published spreadsheet link, short enough to stay sane. */
const MAX_LINK_LENGTH = 2048;
/** Schools number their periods from 1; the ceiling is only a sanity bound. */
const MAX_PERIOD_NUMBER = 99;
/**
 * The two shapes the holiday lookup will turn into a request: a country on its
 * own, for the countries that publish one set of dates and no regions, and a
 * country with a subdivision. Checked here as well as there so a code that
 * could never answer is refused at the save rather than every hour on the wall.
 */
const HOLIDAY_REGION = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

function asRecord(raw: unknown, message: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TimetableError(400, 'timetables.invalid', message);
  return raw as Record<string, unknown>;
}

function asList(raw: unknown, message: string): unknown[] {
  if (!Array.isArray(raw)) throw new TimetableError(400, 'timetables.invalid', message);
  return raw;
}

function cleanId(raw: unknown, message: string): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_ID_LENGTH) throw new TimetableError(400, 'timetables.invalid', message);
  return raw.trim();
}

/** A required piece of short text, trimmed and capped. */
function cleanText(raw: unknown, max: number, needed: string, tooLong: string): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new TimetableError(400, 'timetables.invalid', needed);
  const text = raw.trim();
  if (text.length > max) throw new TimetableError(400, 'timetables.invalid', tooLong);
  return text;
}

/** Optional short text. Blank counts as "not set" and is dropped. */
function cleanOptionalText(raw: unknown, max: number, message: string): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') throw new TimetableError(400, 'timetables.invalid', message);
  const text = raw.trim();
  if (!text) return undefined;
  if (text.length > max) throw new TimetableError(400, 'timetables.invalid', message);
  return text;
}

function cleanFlag(raw: unknown, message: string): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'boolean') throw new TimetableError(400, 'timetables.invalid', message);
  return raw;
}

function cleanColor(raw: unknown, message: string): string {
  if (typeof raw !== 'string' || !HEX_COLOR.test(raw)) throw new TimetableError(400, 'timetables.invalid', message);
  return raw.toLowerCase();
}

/** 'HH:MM' on a 24 hour clock, so the stored times also sort as text. */
function cleanTime(raw: unknown, message: string): string {
  if (typeof raw !== 'string' || !CLOCK_TIME.test(raw) || parseTimeToMinutes(raw) === null) {
    throw new TimetableError(400, 'timetables.invalid', message);
  }
  return raw;
}

function cleanPeriodNumber(raw: unknown, message: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_PERIOD_NUMBER) {
    throw new TimetableError(400, 'timetables.invalid', message);
  }
  return raw;
}

function cleanTimestamp(raw: unknown, message: string): string {
  if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) throw new TimetableError(400, 'timetables.invalid', message);
  return raw;
}

// ── Schools ──

function cleanSlots(raw: unknown, at: string): TimetableSlot[] {
  const entries = asList(raw, `${at} needs a list of periods and breaks`);
  if (entries.length > TIMETABLE_LIMITS.maxSlotsPerSchool) {
    throw new TimetableError(400, 'timetables.invalid', `${at} can have up to ${TIMETABLE_LIMITS.maxSlotsPerSchool} periods and breaks`);
  }
  const numbers = new Set<number>();
  let previousEnd = -1;
  return entries.map((entry): TimetableSlot => {
    const slot = asRecord(entry, `${at} has a period that is not saved properly`);
    const start = cleanTime(slot.start, `${at}: times look like 08:15`);
    const end = cleanTime(slot.end, `${at}: times look like 08:15`);
    const startsAt = parseTimeToMinutes(start) ?? 0;
    const endsAt = parseTimeToMinutes(end) ?? 0;
    if (endsAt <= startsAt) throw new TimetableError(400, 'timetables.invalid', `${at}: the period starting at ${start} has to end later than it starts`);
    if (startsAt < previousEnd) throw new TimetableError(400, 'timetables.invalid', `${at}: periods and breaks have to run in time order without overlapping`);
    previousEnd = endsAt;
    if (slot.kind === 'period') {
      const n = cleanPeriodNumber(slot.n, `${at}: every period needs a number`);
      if (numbers.has(n)) throw new TimetableError(400, 'timetables.invalid', `${at} uses period ${n} twice`);
      numbers.add(n);
      return { kind: 'period', n, start, end };
    }
    if (slot.kind === 'break') {
      const label = cleanText(
        slot.label,
        TIMETABLE_LIMITS.maxNameLength,
        `${at}: give the break at ${start} a name`,
        `Break names can be up to ${TIMETABLE_LIMITS.maxNameLength} characters`,
      );
      return { kind: 'break', label, start, end };
    }
    throw new TimetableError(400, 'timetables.invalid', `${at}: a row is either a lesson period or a break`);
  });
}

/**
 * A school's holiday region, stored the way the lookup takes it. A code typed
 * in lower case is the same region, and saving it as typed would have the
 * store hold two spellings of one place.
 */
function cleanHolidayRegion(raw: unknown, at: string): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') throw new TimetableError(400, 'timetables.invalid', `${at}: school holidays need a region code like DE-NW`);
  const region = raw.trim().toUpperCase();
  if (!region) return undefined;
  if (!HOLIDAY_REGION.test(region)) throw new TimetableError(400, 'timetables.invalid', `${at}: school holidays need a region code like DE-NW`);
  return region;
}

function cleanCare(raw: unknown, at: string): TimetableSchool['care'] {
  if (raw === undefined || raw === null) return undefined;
  const care = asRecord(raw, `${at}: after-school care is not saved properly`);
  const name = cleanText(
    care.name,
    TIMETABLE_LIMITS.maxNameLength,
    `${at}: give after-school care a name`,
    `After-school care names can be up to ${TIMETABLE_LIMITS.maxNameLength} characters`,
  );
  const hours = asRecord(care.until ?? {}, `${at}: after-school care needs the time it runs until`);
  const until: NonNullable<TimetableSchool['care']>['until'] = {};
  for (const day of DAY_KEYS) {
    const value = hours[day];
    if (value === undefined || value === null || value === '') continue;
    until[day] = cleanTime(value, `${at}: after-school care times look like 16:00`);
  }
  return { name, until };
}

function cleanSpecialDays(raw: unknown, at: string): TimetableSpecialDay[] {
  const entries = asList(raw, `${at} needs a list of special days`);
  if (entries.length > TIMETABLE_LIMITS.maxSpecialDaysPerSchool) {
    throw new TimetableError(400, 'timetables.invalid', `${at} can have up to ${TIMETABLE_LIMITS.maxSpecialDaysPerSchool} special days`);
  }
  const dates = new Set<string>();
  return entries.map((entry): TimetableSpecialDay => {
    const day = asRecord(entry, `${at} has a special day that is not saved properly`);
    if (typeof day.date !== 'string' || !isValidISODate(day.date)) {
      throw new TimetableError(400, 'timetables.invalid', `${at}: special days need a real date, like 2026-02-16`);
    }
    if (dates.has(day.date)) throw new TimetableError(400, 'timetables.invalid', `${at} has two special days on ${day.date}`);
    dates.add(day.date);
    const label = cleanText(
      day.label,
      TIMETABLE_LIMITS.maxNameLength,
      `${at}: give the special day on ${day.date} a name`,
      `Special day names can be up to ${TIMETABLE_LIMITS.maxNameLength} characters`,
    );
    if (day.kind === 'off') return { date: day.date, label, kind: 'off' };
    if (day.kind === 'ends-after') {
      const period = cleanPeriodNumber(day.period, `${at}: say which period the day on ${day.date} ends after`);
      return { date: day.date, label, kind: 'ends-after', period };
    }
    throw new TimetableError(400, 'timetables.invalid', `${at}: a special day is either a day off or a short day`);
  });
}

/**
 * A person's dates to remember, each checked against the school and the
 * subjects it points at: a test names a subject that exists, a cancellation
 * names periods the school has, a thing to bring says what. Kept sorted by
 * date so the editor and the wall read them in order.
 */
function cleanNotes(
  raw: unknown,
  at: string,
  school: TimetableSchool,
  subjectIds: ReadonlySet<string>,
): TimetableNote[] {
  const entries = asList(raw, `${at} needs a list of dates`);
  if (entries.length > TIMETABLE_LIMITS.maxNotesPerTimetable) {
    throw new TimetableError(400, 'timetables.invalid', `${at} can have up to ${TIMETABLE_LIMITS.maxNotesPerTimetable} dates`);
  }
  const periods = new Set(school.slots.filter((slot) => slot.kind === 'period').map((slot) => (slot as { n: number }).n));
  const ids = new Set<string>();
  const notes = entries.map((entry): TimetableNote => {
    const note = asRecord(entry, `${at} has a date that is not saved properly`);
    const id = cleanId(note.id, `${at} has a date with no id`);
    if (ids.has(id)) throw new TimetableError(400, 'timetables.invalid', `${at} has two dates with the same id`);
    ids.add(id);
    if (typeof note.date !== 'string' || !isValidISODate(note.date)) {
      throw new TimetableError(400, 'timetables.invalid', `${at}: dates need a real day, like 2026-02-16`);
    }
    const text = cleanOptionalText(
      note.text,
      TIMETABLE_LIMITS.maxNoteLength,
      `A date's words can be up to ${TIMETABLE_LIMITS.maxNoteLength} characters`,
    );
    if (note.kind === 'test') {
      const subjectId = cleanId(note.subjectId, `${at}: say which subject the test on ${note.date} is in`);
      if (!subjectIds.has(subjectId)) throw new TimetableError(400, 'timetables.invalid', `${at}: the test on ${note.date} is in a subject that is not in the list`);
      return { id, date: note.date, kind: 'test', subjectId, ...(text ? { text } : {}) };
    }
    if (note.kind === 'bring') {
      if (!text) throw new TimetableError(400, 'timetables.invalid', `${at}: say what to bring on ${note.date}`);
      return { id, date: note.date, kind: 'bring', text };
    }
    if (note.kind === 'cancelled') {
      const list = asList(note.periods, `${at}: say which lessons are off on ${note.date}`);
      const cleaned = [...new Set(list.map((n) => cleanPeriodNumber(n, `${at}: lessons that are off are listed by period number`)))].sort((a, b) => a - b);
      if (cleaned.length === 0) throw new TimetableError(400, 'timetables.invalid', `${at}: say which lessons are off on ${note.date}`);
      for (const n of cleaned) {
        if (!periods.has(n)) throw new TimetableError(400, 'timetables.invalid', `${at}: ${school.name} has no period ${n} to be off on ${note.date}`);
      }
      return { id, date: note.date, kind: 'cancelled', periods: cleaned };
    }
    throw new TimetableError(400, 'timetables.invalid', `${at}: a date is a test, something to bring, or a lesson that is off`);
  });
  return notes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function cleanSchool(raw: unknown, index: number): TimetableSchool {
  const where = `school ${index + 1}`;
  const school = asRecord(raw, `School ${index + 1} is not saved properly`);
  const id = cleanId(school.id, `School ${index + 1} is missing its id`);
  const name = cleanText(
    school.name,
    TIMETABLE_LIMITS.maxNameLength,
    `Give ${where} a name`,
    `School names can be up to ${TIMETABLE_LIMITS.maxNameLength} characters`,
  );
  const slots = cleanSlots(school.slots, name);
  const weekCycle = cleanWeekCycle(school.weekCycle, name);
  const holidayRegion = cleanHolidayRegion(school.holidayRegion, name);
  const care = cleanCare(school.care, name);
  const specialDays = cleanSpecialDays(school.specialDays ?? [], name);
  return {
    id,
    name,
    slots,
    weekCycle,
    ...(holidayRegion ? { holidayRegion } : {}),
    ...(care ? { care } : {}),
    specialDays,
  };
}

function cleanWeekCycle(raw: unknown, at: string): TimetableSchool['weekCycle'] {
  const cycle = asRecord(raw, `${at}: say whether the weeks alternate`);
  if (cycle.mode === 'off') return { mode: 'off' };
  if (cycle.mode === 'parity') {
    if (cycle.oddWeek !== 'A' && cycle.oddWeek !== 'B') throw new TimetableError(400, 'timetables.invalid', `${at}: odd weeks are either week A or week B`);
    return { mode: 'parity', oddWeek: cycle.oddWeek };
  }
  throw new TimetableError(400, 'timetables.invalid', `${at}: say whether the weeks alternate`);
}

// ── Subjects ──

function cleanSubjects(raw: unknown): TimetableSubject[] {
  const entries = asList(raw, 'Subjects have to be saved as a list');
  if (entries.length > TIMETABLE_LIMITS.maxSubjects) {
    throw new TimetableError(400, 'timetables.invalid', `You can have up to ${TIMETABLE_LIMITS.maxSubjects} subjects`);
  }
  const ids = new Set<string>();
  return entries.map((entry, index): TimetableSubject => {
    const subject = asRecord(entry, `Subject ${index + 1} is not saved properly`);
    const id = cleanId(subject.id, `Subject ${index + 1} is missing its id`);
    if (ids.has(id)) throw new TimetableError(400, 'timetables.invalid', 'Two subjects share the same id');
    ids.add(id);
    const name = cleanText(
      subject.name,
      TIMETABLE_LIMITS.maxNameLength,
      `Give subject ${index + 1} a name`,
      `Subject names can be up to ${TIMETABLE_LIMITS.maxNameLength} characters`,
    );
    const code = cleanText(
      subject.code,
      TIMETABLE_LIMITS.maxCodeLength,
      `${name} needs a short code for narrow cells`,
      `Short codes can be up to ${TIMETABLE_LIMITS.maxCodeLength} characters`,
    );
    const color = cleanColor(subject.color, `${name} needs a colour, like #4f8ef7`);
    const icon = cleanText(subject.icon, MAX_ID_LENGTH, `${name} needs a picture`, `${name} has a picture name that is too long`);
    const bring = cleanOptionalText(
      subject.bring,
      TIMETABLE_LIMITS.maxBringLength,
      `What to bring can be up to ${TIMETABLE_LIMITS.maxBringLength} characters`,
    );
    return { id, code, name, color, icon, ...(bring ? { bring } : {}) };
  });
}

// ── Weeks ──

function cleanCell(raw: unknown, at: string, subjectIds: ReadonlySet<string>): TimetableCell {
  const cell = asRecord(raw, `${at} has a lesson that is not saved properly`);
  if (cell.lunch === true) return { lunch: true };
  const subjectId = cleanId(cell.subjectId, `${at} has a lesson with no subject`);
  if (!subjectIds.has(subjectId)) throw new TimetableError(400, 'timetables.invalid', `${at} has a lesson whose subject is not in the subject list`);
  const room = cleanOptionalText(cell.room, TIMETABLE_LIMITS.maxRoomLength, `Room names can be up to ${TIMETABLE_LIMITS.maxRoomLength} characters`);
  const course = cleanOptionalText(cell.course, TIMETABLE_LIMITS.maxCodeLength, `Course badges can be up to ${TIMETABLE_LIMITS.maxCodeLength} characters`);
  return { subjectId, ...(room ? { room } : {}), ...(course ? { course } : {}) };
}

function cleanWeek(raw: unknown, at: string, subjectIds: ReadonlySet<string>): TimetableWeek {
  const week = asRecord(raw ?? {}, `${at} is not saved properly`);
  const cleaned: TimetableWeek = {};
  for (const day of DAY_KEYS) {
    const entry = week[day];
    if (entry === undefined || entry === null) continue;
    const periods = asRecord(entry, `${at} has a day that is not saved properly`);
    const cells: Record<number, TimetableCell> = {};
    for (const [key, value] of Object.entries(periods)) {
      if (value === undefined || value === null) continue;
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1 || n > MAX_PERIOD_NUMBER) {
        throw new TimetableError(400, 'timetables.invalid', `${at} has a lesson in a period that is not numbered`);
      }
      cells[n] = cleanCell(value, at, subjectIds);
    }
    if (Object.keys(cells).length > 0) cleaned[day] = cells;
  }
  return cleaned;
}

/**
 * The subject the household said each of the sheet's own codes means.
 *
 * Written by the import screen and read by the hourly check, never typed, so a
 * row that no longer makes sense is dropped rather than refused: a code whose
 * subject has been deleted since, or one longer than any cell has business
 * being, would only cost that one period its lesson on the next re-read, and
 * refusing the whole document over it would cost the household their save.
 */
function cleanSourceCodes(raw: unknown, at: string, subjectIds: ReadonlySet<string>): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  const codes = asRecord(raw, `${at}: what the spreadsheet's subject codes mean is not saved properly`);
  const cleaned: Record<string, string> = {};
  for (const [code, subjectId] of Object.entries(codes)) {
    if (Object.keys(cleaned).length >= TIMETABLE_LIMITS.maxSubjects) break;
    const key = code.trim();
    if (!key || key.length > TIMETABLE_LIMITS.maxNameLength) continue;
    if (typeof subjectId !== 'string' || !subjectIds.has(subjectId)) continue;
    cleaned[key] = subjectId;
  }
  return cleaned;
}

function cleanSource(raw: unknown, at: string, subjectIds: ReadonlySet<string>): Timetable['source'] {
  if (raw === undefined || raw === null) return undefined;
  const source = asRecord(raw, `${at}: the spreadsheet it came from is not saved properly`);
  if (source.kind !== 'sheet') throw new TimetableError(400, 'timetables.invalid', `${at}: the spreadsheet it came from is not saved properly`);
  const url = cleanText(source.url, MAX_LINK_LENGTH, `${at}: the spreadsheet needs a link`, `${at}: that spreadsheet link is too long`);
  if (!WEB_LINK.test(url)) throw new TimetableError(400, 'timetables.invalid', `${at}: a spreadsheet link has to start with https://`);
  const importedAt = cleanTimestamp(source.importedAt, `${at}: the spreadsheet needs the time it was read`);
  const sync = cleanFlag(source.sync, `${at}: keeping the spreadsheet up to date is either on or off`);
  if (sync === undefined) throw new TimetableError(400, 'timetables.invalid', `${at}: keeping the spreadsheet up to date is either on or off`);
  const tab = cleanOptionalText(source.tab, MAX_ID_LENGTH, `${at}: that spreadsheet tab is not saved properly`);
  const codes = cleanSourceCodes(source.codes, at, subjectIds);
  const lastCheckedAt = source.lastCheckedAt === undefined || source.lastCheckedAt === null
    ? undefined
    : cleanTimestamp(source.lastCheckedAt, `${at}: the time the spreadsheet was last checked is not saved properly`);
  const lastError = cleanOptionalText(source.lastError, MAX_ID_LENGTH, `${at}: that spreadsheet problem is not saved properly`);
  return {
    kind: 'sheet',
    url,
    importedAt,
    sync,
    ...(tab ? { tab } : {}),
    ...(Object.keys(codes).length > 0 ? { codes } : {}),
    ...(lastCheckedAt ? { lastCheckedAt } : {}),
    ...(lastError ? { lastError } : {}),
  };
}

function cleanTimetable(
  raw: unknown,
  index: number,
  schools: ReadonlyMap<string, TimetableSchool>,
  subjectIds: ReadonlySet<string>,
): Timetable {
  const where = `Timetable ${index + 1}`;
  const entry = asRecord(raw, `${where} is not saved properly`);
  const memberId = cleanId(entry.memberId, `${where} is missing the person it belongs to`);
  const schoolId = cleanId(entry.schoolId, `${where} is missing its school`);
  const school = schools.get(schoolId);
  if (!school) throw new TimetableError(400, 'timetables.invalid', `${where} points at a school that is not in the list`);
  const className = cleanOptionalText(entry.className, TIMETABLE_LIMITS.maxNameLength, `Class names can be up to ${TIMETABLE_LIMITS.maxNameLength} characters`);
  const usualRoom = cleanOptionalText(entry.usualRoom, TIMETABLE_LIMITS.maxRoomLength, `Room names can be up to ${TIMETABLE_LIMITS.maxRoomLength} characters`);
  const icons = cleanFlag(entry.icons, `${where}: subject pictures are either on or off`);
  const weeks = asRecord(entry.weeks, `${where} is missing its week`);
  const weekA = cleanWeek(weeks.A, `${where}, week A`, subjectIds);
  let weekB: TimetableWeek | undefined;
  if (weeks.B !== undefined && weeks.B !== null) {
    if (school.weekCycle.mode === 'off') throw new TimetableError(400, 'timetables.invalid', `${where} has a week B, but ${school.name} does not alternate weeks`);
    weekB = cleanWeek(weeks.B, `${where}, week B`, subjectIds);
  }
  const source = cleanSource(entry.source, where, subjectIds);
  const notes = cleanNotes(entry.notes ?? [], where, school, subjectIds);
  return {
    memberId,
    schoolId,
    ...(className ? { className } : {}),
    ...(usualRoom ? { usualRoom } : {}),
    ...(icons !== undefined ? { icons } : {}),
    weeks: { A: weekA, ...(weekB ? { B: weekB } : {}) },
    ...(source ? { source } : {}),
    ...(notes.length ? { notes } : {}),
  };
}

/** How long a date is kept once it has passed, so the file does not grow forever. */
export const NOTE_KEEP_DAYS = 14;

/**
 * The document with every date older than a fortnight dropped.
 *
 * Done on save with the clock handed in, never inside `cleanTimetableData`:
 * validation and restore must stay pure, so a backup from last year restores
 * exactly what it holds and only the next save tidies it.
 */
export function withoutPastNotes(data: TimetableData, now: Date): TimetableData {
  const cutoff = new Date(now.getTime() - NOTE_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let changed = false;
  const timetables = data.timetables.map((timetable) => {
    if (!timetable.notes?.length) return timetable;
    const kept = timetable.notes.filter((note) => note.date >= cutoff);
    if (kept.length === timetable.notes.length) return timetable;
    changed = true;
    const { notes: _dropped, ...rest } = timetable;
    return kept.length ? { ...rest, notes: kept } : rest;
  });
  return changed ? { ...data, timetables } : data;
}

/**
 * The saved shape of `raw`, with every field trimmed, capped and checked.
 * Throws a `TimetableError` with a plain reason at the first problem, so a
 * save never lands a document a read could not serve.
 */
export function cleanTimetableData(raw: unknown): TimetableData {
  const doc = asRecord(raw, 'Timetables are saved as schools, subjects and timetables');
  const schoolEntries = asList(doc.schools, 'Schools have to be saved as a list');
  if (schoolEntries.length > TIMETABLE_LIMITS.maxSchools) {
    throw new TimetableError(400, 'timetables.invalid', `You can have up to ${TIMETABLE_LIMITS.maxSchools} schools`);
  }
  const schools = schoolEntries.map((entry, index) => cleanSchool(entry, index));
  const byId = new Map<string, TimetableSchool>();
  for (const school of schools) {
    if (byId.has(school.id)) throw new TimetableError(400, 'timetables.invalid', 'Two schools share the same id');
    byId.set(school.id, school);
  }

  const subjects = cleanSubjects(doc.subjects);
  const subjectIds = new Set(subjects.map((subject) => subject.id));

  const entries = asList(doc.timetables, 'Timetables have to be saved as a list');
  if (entries.length > TIMETABLE_LIMITS.maxTimetables) {
    throw new TimetableError(400, 'timetables.invalid', `You can have up to ${TIMETABLE_LIMITS.maxTimetables} timetables`);
  }
  const timetables = entries.map((entry, index) => cleanTimetable(entry, index, byId, subjectIds));
  const members = new Set<string>();
  for (const timetable of timetables) {
    if (members.has(timetable.memberId)) throw new TimetableError(400, 'timetables.invalid', 'One person cannot have two timetables');
    members.add(timetable.memberId);
  }

  return { schools, subjects, timetables };
}

/**
 * Whether `raw` is a document the store can serve. A backup restore writes the
 * file whole, so a malformed bundle would otherwise land on disk and break
 * every read after it. Returns a plain-language reason, or null when the shape
 * is sound.
 */
export function validateTimetableData(raw: unknown): string | null {
  try {
    cleanTimetableData(raw);
    return null;
  } catch (error) {
    if (error instanceof TimetableError) return error.message;
    throw error;
  }
}

// ── Reads and writes ──

export interface TimetableSnapshot {
  data: TimetableData;
  /** Quote this back when saving, so a save that raced another one is refused. */
  revision: string;
}

export interface ReplaceTimetablesInput {
  data: unknown;
  revision: unknown;
}

function snapshot(data: TimetableData): TimetableSnapshot {
  return { data, revision: timetableRevision(data) };
}

function hasNothingSaved(data: TimetableData): boolean {
  return [data.schools, data.subjects, data.timetables].every((list) => !Array.isArray(list) || list.length === 0);
}

async function defaultSubjects(): Promise<TimetableSubject[]> {
  const config = await readConfig().catch(() => null);
  return getDefaultSubjects(config?.settings?.locale ?? DEFAULT_LOCALE);
}

/**
 * What a read serves and what a save is compared against. Until the file
 * exists, that is the subject catalogue for the household's language; an empty
 * document that was actually saved is left alone.
 */
async function withSeededSubjects(saved: TimetableData): Promise<TimetableData> {
  if (!hasNothingSaved(saved)) return saved;
  if ((await readTransactionFile(TIMETABLES_FILE_PATH)) !== null) return saved;
  return { schools: [], subjects: await defaultSubjects(), timetables: [] };
}

export function readTimetables(): Promise<TimetableSnapshot> {
  return withDataTransaction(async () => {
    let saved: TimetableData;
    try {
      saved = await store.read();
    } catch (error) {
      throw readFailure(error);
    }
    return snapshot(await withSeededSubjects(saved));
  });
}

/**
 * Change the document from the server's own side, with no revision to quote.
 *
 * The hourly sheet check is not somebody's save: nobody is holding a copy of
 * the document to be out of date about, and refusing it would leave the wall
 * showing a week the sheet no longer has. It still goes through the same
 * validation and the same coordinator section as a save, so a bad change is
 * refused rather than written. `change` returning null means nothing to do.
 */
export function updateTimetablesInPlace(
  change: (current: TimetableData) => TimetableData | null | Promise<TimetableData | null>,
): Promise<TimetableData | null> {
  return withDataTransaction(async () => {
    let changed = false;
    const saved = await store.updateAtomic(async (current) => {
      const base = await withSeededSubjects(current);
      const next = await change(base);
      if (!next) return base;
      changed = true;
      return cleanTimetableData(next);
    });
    return changed ? saved : null;
  });
}

/**
 * Exactly what is on disk, with no starting subjects filled in, or null when
 * nothing has been saved yet. A backup wants this rather than a read: the
 * starting subjects are named in the household's own language, so seeding them
 * into an export would carry one household's language into another's restore.
 */
export function readSavedTimetables(): Promise<TimetableData | null> {
  return withDataTransaction(async () => {
    if ((await readTransactionFile(TIMETABLES_FILE_PATH)) === null) return null;
    try {
      return await store.read();
    } catch (error) {
      throw readFailure(error);
    }
  });
}

/**
 * Save the whole document, refusing a save that started from an older copy.
 * The roster check, the revision check and the write share one coordinator
 * section, so nobody can be removed from the family in between.
 */
export function replaceTimetables(input: ReplaceTimetablesInput, now: Date = new Date()): Promise<TimetableSnapshot> {
  return withFamilyData(async () => {
    try {
      const saved = await store.updateAtomic(async (current) => {
        const base = await withSeededSubjects(current);
        if (typeof input.revision !== 'string' || !input.revision) {
          throw new TimetableError(400, 'timetables.reopen', 'Reopen the timetables page and try saving again.');
        }
        if (input.revision !== timetableRevision(base)) {
          throw new TimetableError(409, 'timetables.revision', 'Somebody else changed the timetables. Reopen the page and make your change again.', { extra: { ...snapshot(base) } });
        }
        const next = withoutPastNotes(withServerNotes(cleanTimetableData(input.data), base), now);
        const missing = await validateMemberReferences(next.timetables.map((timetable) => timetable.memberId));
        // The check answers with a ready-made response for a route; here only
        // its verdict matters, so the timetable wording is used instead.
        if (missing) throw new TimetableError(409, 'timetables.member', 'A timetable belongs to somebody who is no longer in the family. Reopen the page and pick a person again.');
        return next;
      });
      return snapshot(saved);
    } catch (error) {
      throw readFailure(error);
    }
  });
}
