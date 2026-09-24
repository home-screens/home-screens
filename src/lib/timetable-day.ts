/**
 * The Day view's brain: which school day the whole family is shown, what each
 * person's row on that day holds, and the clock the rows share.
 *
 * Everything here is pure and takes the display's clock and zone as arguments,
 * the same rules `timetable-layout.ts` follows. What the day looks like on a
 * wall is decided by `timetable-day-fit.ts`; this file only decides what is
 * true about the day.
 *
 * One date for the whole card, on purpose. The rows sit on one shared time
 * axis, so they have to be the same day: it is the first date on which at
 * least one of the people shown has school, and anyone whose school is shut
 * that day gets a row that says why rather than no row at all.
 */

import type { WeekLetter } from '@/types/timetables';
import {
  addDays,
  bringFor,
  closureOn,
  dateInZone,
  dayBlocks,
  dayKeyOf,
  daySpan,
  endsAfterOn,
  isoWeekNumber,
  minutesInZone,
  notesOn,
  periodEndTime,
  weekLetterOn,
  type FocusContext,
  type LessonBlock,
  type OffReason,
  type TimetableBlock,
} from '@/lib/timetable-layout';
import { parseTimeToMinutes } from '@/lib/sleep-timeline';
import { formatClockMinutes } from '@/lib/clock-time';
import type { TimeFormat } from '@/types/config';

/** When the Day view moves on to the next school day, unless the household says otherwise. */
export const DEFAULT_TOMORROW_FROM = '16:00';

/** A year of walking is past any real holiday; the guard is only for a household with every day off. */
const MAX_WALK_DAYS = 370;

/** The axis rounds out to the half hour, with this much lead before the first bell. */
const AXIS_LEAD_MIN = 12;
const AXIS_ROUND_MIN = 30;
/** A short day is not stretched across the whole screen: the clock is at least this long. */
const AXIS_MIN_SPAN_MIN = 4 * 60;

/** One person as the Day view knows them: the same context the Week view's focus takes. */
export type FamilyDayPerson = FocusContext;

/**
 * How the day is named on the card.
 *
 * `today` and `tomorrow` are the two ordinary cases. `weekday` names the day
 * because it is within the week ("Monday", on a Friday evening). `date` spells
 * the date out, because after a holiday the day is far enough away that its
 * name alone would be ambiguous.
 */
export type FamilyDayLabelKind = 'today' | 'tomorrow' | 'weekday' | 'date';

export interface FamilyDay {
  /** YYYY-MM-DD in the display's zone. */
  date: string;
  labelKind: FamilyDayLabelKind;
  /** The ISO week the date falls in, which German schools print as "KW 37". */
  weekNumber: number;
}

/**
 * The time of day the card moves on, in minutes. A malformed or missing value
 * falls back to the default rather than to midnight, so a typo in the editor
 * never makes a breakfast wall show tomorrow.
 */
export function tomorrowFromMinutes(value: string | undefined): number {
  const minutes = value ? parseTimeToMinutes(value.trim()) : null;
  return minutes ?? (parseTimeToMinutes(DEFAULT_TOMORROW_FROM) as number);
}

/** Whether this person has school and lessons on this date. */
function hasSchoolOn(person: FamilyDayPerson, date: string): boolean {
  const day = dayKeyOf(date);
  if (!day) return false;
  if (closureOn(date, person)) return false;
  const week = weekLetterOn(person.school, date);
  return daySpan(dayBlocks(person.timetable, person.school, person.subjects, day, week)) !== null;
}

/**
 * The day the whole card shows.
 *
 * Before the switch time on a weekday the card shows today, which makes it a
 * breakfast view; from the switch time on it looks ahead, which makes it the
 * evening view the reporter asked for. The weekend always looks ahead. From
 * there it walks forward to the first date on which at least one of the people
 * shown has school: a holiday for everyone skips to the first day back, a day
 * off at one school does not move the card as long as the other school is
 * open.
 *
 * Null when nobody shown has a lesson on any day of the year, which is what a
 * household with empty weeks looks like; the module's empty states cover that.
 */
export function resolveFamilyDay(
  now: Date,
  timeZone: string | undefined,
  people: readonly FamilyDayPerson[],
  tomorrowFrom?: string,
): FamilyDay | null {
  if (people.length === 0) return null;
  const today = dateInZone(now, timeZone);
  const minutes = minutesInZone(now, timeZone);
  const lookAhead = !dayKeyOf(today) || minutes >= tomorrowFromMinutes(tomorrowFrom);

  let probe = lookAhead ? addDays(today, 1) : today;
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    if (people.some((person) => hasSchoolOn(person, probe))) {
      return { date: probe, labelKind: labelKindFor(today, probe), weekNumber: isoWeekNumber(probe) };
    }
    probe = addDays(probe, 1);
  }
  return null;
}

function labelKindFor(today: string, date: string): FamilyDayLabelKind {
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  for (let i = 2; i <= 6; i++) if (date === addDays(today, i)) return 'weekday';
  return 'date';
}

// ---------------------------------------------------------------------------
// One person's row
// ---------------------------------------------------------------------------

/** A block on the day's clock. Lessons keep their subject; everything is in minutes too. */
export type FamilyDayBlock = TimetableBlock & {
  startMin: number;
  endMin: number;
  /** Off by the day's cut or by a note: drawn faded, and not counted towards the start or end. */
  off?: OffReason;
  /** A test in this subject that day: the name the note gave it, or '' for a plain test. */
  test?: string;
};

/** Something on the packing card besides the subjects' items: a one-off thing to bring, or a test. */
export interface FamilyDayExtra {
  kind: 'bring' | 'test';
  /** What to bring, or the test's name; '' for a test with no name. */
  text: string;
}

export interface FamilyDayRow {
  /** School is shut for this person: the name of the day off, and nothing else below. */
  closed?: string;
  blocks: FamilyDayBlock[];
  /** First lesson to last surviving lesson, care excluded. Absent when closed or empty. */
  span?: { start: string; end: string };
  /** The cut a short day stops at, when it is earlier than the timetable's own end. */
  cutAt?: string;
  /** The timetable's own end, kept beside the cut so the row can say "usually 13:15". */
  usualEnd?: string;
  /** What the special day is called, and the last period that still happens, when the day is cut short. */
  shortLabel?: string;
  endsAfterPeriod?: number;
  /** After-school care and when it runs until, starting when lessons stop. */
  care?: { name: string; from: string; until: string };
  /** The first period is free, so the day really starts here. */
  lateStart?: string;
  /** What goes in the bag: the subjects' items, for the lessons that still happen. */
  bring: string[];
  /** The day's notes as pills: one-off things to bring, then tests. */
  extras: FamilyDayExtra[];
  /** Set only when the school alternates weeks. */
  weekLetter?: WeekLetter;
}

/** 'HH:MM' as minutes. The store validates every bell time, so a bad one is a hand-edited file. */
const minutesOf = (time: string): number => parseTimeToMinutes(time) ?? 0;

/** No lessons at all: a row that stands for a person with nothing on. */
const EMPTY_ROW: FamilyDayRow = { blocks: [], bring: [], extras: [] };

/** The day's notes as pills, one-off things first and then tests. */
function extrasOf(notes: ReturnType<typeof notesOn>): FamilyDayExtra[] {
  return [
    ...notes.bring.map((text): FamilyDayExtra => ({ kind: 'bring', text })),
    ...[...notes.tests.values()].map((text): FamilyDayExtra => ({ kind: 'test', text: text ?? '' })),
  ];
}

/**
 * One person's day, as the row draws it.
 *
 * A short day keeps every block where it would have been and marks the ones
 * after the cut `off`, so the row still shows the shape of the day the school
 * planned and a reader can see what was dropped. Care starts when the lessons
 * really stop, which on a short day is the cut, so a child in after-school
 * care has an unchanged afternoon.
 */
export function familyDayRow(person: FamilyDayPerson, date: string): FamilyDayRow {
  const day = dayKeyOf(date);
  if (!day) return EMPTY_ROW;
  const { school, timetable, subjects } = person;
  const week = weekLetterOn(school, date);
  const weekLetter = school.weekCycle.mode === 'parity' ? week : undefined;
  const closed = closureOn(date, person);
  // A closed row still knows which week it is: the header's letter comes from
  // whichever school alternates, shut for the day or not.
  if (closed !== undefined) return { closed: closed || '', blocks: [], bring: [], extras: [], weekLetter };
  const notes = notesOn(timetable, date);
  const endsAfter = endsAfterOn(date, person);
  const raw = dayBlocks(timetable, school, subjects, day, week, endsAfter, notes.cancelled);
  const lessons = raw.filter((b): b is LessonBlock => b.kind === 'lesson');
  if (lessons.length === 0) return { ...EMPTY_ROW, extras: extrasOf(notes), weekLetter };

  const cut = endsAfter === undefined ? null : periodEndTime(school, endsAfter);
  const usualStart = lessons[0].start;
  const usualEnd = lessons[lessons.length - 1].end;
  const isOff = (block: TimetableBlock): boolean => block.kind !== 'care' && block.off !== undefined;

  const surviving = lessons.filter((b) => !isOff(b));
  const start = surviving[0]?.start;
  const lastEnd = surviving.length ? surviving[surviving.length - 1].end : undefined;
  // The day ends at the cut's bell or the last surviving lesson, whichever is
  // earlier. Asked of the school rather than the block, because a double can
  // straddle the cut (dayBlocks splits it, but the bell is still the truth).
  const end = cut && lastEnd ? (cut < lastEnd ? cut : lastEnd) : lastEnd ?? cut ?? undefined;

  // Care picks up where lessons stop, whatever the timetable says about the
  // afternoon. Rebuilt from the school rather than taken from dayBlocks, whose
  // care band starts at the last block the grid holds, cut or no cut.
  const careUntil = school.care?.until[day];
  const care =
    school.care && careUntil && end && careUntil > end
      ? { name: school.care.name, from: end, until: careUntil }
      : undefined;

  const blocks: FamilyDayBlock[] = [];
  for (const block of raw) {
    if (block.kind === 'care') continue;
    const off = isOff(block);
    // A faded free period or lunch says nothing a reader needs; a faded lesson
    // says what was dropped. Blocks the care band now covers are not drawn
    // under it either.
    if (off && block.kind !== 'lesson') continue;
    if (off && care && block.start >= care.from && block.start < care.until) continue;
    const test = block.kind === 'lesson' && notes.tests.has(block.subject.id) ? { test: notes.tests.get(block.subject.id) ?? '' } : {};
    blocks.push({ ...block, startMin: minutesOf(block.start), endMin: minutesOf(block.end), ...test });
  }
  if (care) {
    blocks.push({ kind: 'care', label: care.name, start: care.from, end: care.until, startMin: minutesOf(care.from), endMin: minutesOf(care.until) });
  }

  // The day starts late when its first period is free, or when the first
  // lessons are off; either way the head says when it really starts.
  const first = blocks[0];
  const lateStart = start && ((first && first.kind === 'free' && first.start < start) || start !== usualStart) ? start : undefined;
  const shortDay = endsAfter === undefined
    ? undefined
    : school.specialDays.find((d) => d.date === date && d.kind === 'ends-after')?.label;

  return {
    blocks,
    span: start && end ? { start, end } : undefined,
    // The dashed line marks the new end whatever moved it: the school's cut
    // or a cancelled last lesson.
    cutAt: end && end !== usualEnd ? end : undefined,
    usualEnd: end && end !== usualEnd ? usualEnd : undefined,
    shortLabel: shortDay,
    endsAfterPeriod: endsAfter,
    care,
    lateStart,
    bring: bringFor(surviving),
    extras: extrasOf(notes),
    weekLetter,
  };
}

// ---------------------------------------------------------------------------
// The shared clock
// ---------------------------------------------------------------------------

export interface DayAxis {
  /** Minutes past midnight at the left (or top) of the clock. */
  startMin: number;
  endMin: number;
  /** Where the hour labels go, in minutes past midnight. */
  ticks: number[];
}

function roundDown(minutes: number): number {
  return Math.floor(minutes / AXIS_ROUND_MIN) * AXIS_ROUND_MIN;
}

function roundUp(minutes: number): number {
  return Math.ceil(minutes / AXIS_ROUND_MIN) * AXIS_ROUND_MIN;
}

/**
 * The window of the day every row shares.
 *
 * From the earliest thing on any open row to the latest, care included, both
 * rounded out to the half hour with a little lead so the first bell is not on
 * the edge. Rounding to the hour wasted most of a column on a 07:50 start.
 * `tickEvery` is 60 unless the fit says an hour is too narrow for its label,
 * in which case every other hour is labelled.
 */
export function dayAxis(rows: readonly FamilyDayRow[], tickEvery: 60 | 120 = 60): DayAxis {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    for (const block of row.blocks) {
      lo = Math.min(lo, block.startMin);
      hi = Math.max(hi, block.endMin);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 8 * 60;
    hi = 12 * 60;
  }
  const startMin = Math.max(0, roundDown(lo - AXIS_LEAD_MIN));
  let endMin = Math.min(24 * 60, roundUp(hi + AXIS_LEAD_MIN));
  if (endMin - startMin < AXIS_MIN_SPAN_MIN) endMin = Math.min(24 * 60, startMin + AXIS_MIN_SPAN_MIN);

  const ticks: number[] = [];
  const firstHour = Math.ceil(startMin / 60) * 60;
  for (let t = firstHour; t <= endMin; t += 60) {
    if (tickEvery === 120 && (t / 60) % 2 === 1) continue;
    ticks.push(t);
  }
  return { startMin, endMin, ticks };
}

/** Where a minute sits on the clock, as a share of its length. */
export function axisShare(axis: DayAxis, minutes: number): number {
  const span = Math.max(1, axis.endMin - axis.startMin);
  return Math.min(1, Math.max(0, (minutes - axis.startMin) / span));
}

/** The hour label on the ruler: "07:00", or "7 AM" on a 12 hour clock. */
export function tickLabel(minutes: number, timeFormat: TimeFormat): string {
  const label = formatClockMinutes(minutes, timeFormat);
  return timeFormat === '12h' ? label.replace(':00 ', ' ') : label;
}

/**
 * The current minute on the display's clock, when it falls inside the axis;
 * null before the first tick and after the last, when there is nothing to
 * point at. Whole minutes, so the line moves with the clock and never
 * between two screenshots a second apart.
 */
export function nowOnAxis(now: Date, timeZone: string | undefined, axis: DayAxis): number | null {
  const minutes = minutesInZone(now, timeZone);
  return minutes >= axis.startMin && minutes <= axis.endMin ? minutes : null;
}
