'use client';

/**
 * The timetables window's draft, and the edits the tabs make to it.
 *
 * One document holds every school, the shared subject list and one week per
 * person, so the window loads it whole, edits it in memory and saves it whole
 * behind a debounce. The draft lives at the modal root rather than in a tab,
 * because a tab unmounts when another one is picked and an unsaved paint must
 * not go with it.
 *
 * Two rules keep the save honest:
 *
 * - **What is sent is a projection, not the draft.** A row the household has
 *   started but not finished (a break with no name, a blank subject) is not
 *   data yet, and sending it would come back as a refusal the household can
 *   do nothing useful with. `sanitizeTimetableData` drops those rows on the
 *   way out and leaves them on screen to finish.
 * - **The answer is never adopted into the draft**, only its revision. The
 *   only exception is a conflict, where the draft is no longer standing on
 *   anything and the saved document replaces it.
 * - **One save is in the air at a time.** A save quotes the revision it started
 *   from, so a second one sent alongside it quotes a revision the first has
 *   already replaced and comes back a conflict over nobody: see `persist`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { loadTimetables, saveTimetables } from '@/lib/timetable-client';
import { addDays, dateInZone, weekLetterOn } from '@/lib/timetable-layout';
import {
  DAY_KEYS,
  TIMETABLE_LIMITS,
  type DayKey,
  type Timetable,
  type TimetableCell,
  type TimetableData,
  type TimetableNote,
  type TimetableSchool,
  type TimetableSlot,
  type TimetableSubject,
  type TimetableWeek,
  type WeekLetter,
} from '@/types/timetables';

// ---------------------------------------------------------------------------
// Ids and starting values
// ---------------------------------------------------------------------------

/** A new id for a school, a subject or anything else the household adds. */
function newId(prefix: string): string {
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${unique.replaceAll('-', '').slice(0, 16)}`;
}

/**
 * The colours a subject starts from: the ones a household already owns in
 * notebook covers and folder labels, in the order the subject catalogues use
 * them, so a new subject looks like it belongs beside the built-in ones.
 */
export const SUBJECT_COLORS = [
  '#f26363', '#4f8ef7', '#f2c94c', '#f58b3c', '#43c07e',
  '#26b5a8', '#3ab7f0', '#b5c23a', '#e0a86e', '#ee6fd8',
  '#fb6f92', '#8fdc4e', '#c084fc', '#7c8cf8', '#b08968',
] as const;

/** The first colour nothing uses yet, so two subjects rarely start alike. */
export function nextSubjectColor(subjects: readonly TimetableSubject[]): string {
  const taken = new Set(subjects.map((subject) => subject.color.toLowerCase()));
  const free = SUBJECT_COLORS.find((color) => !taken.has(color));
  return free ?? SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
}

/** The picture a subject starts with, until somebody picks another one. */
const STARTING_ICON = 'book';

// ---------------------------------------------------------------------------
// Bell schedule templates
// ---------------------------------------------------------------------------

interface TemplateSpec {
  /** When the first period starts. */
  start: string;
  /** How long a period runs. */
  length: number;
  /** Minutes between one period and the next, when nothing longer sits there. */
  changeover: number;
  periods: number;
  /** Period number to the longer gap that follows it, for the real breaks. */
  gaps: Record<number, number>;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A template lays out periods and the gaps between them, and names nothing.
 *
 * The gap where a break belongs is left as a gap on purpose: what a school
 * calls it is the school's own word, so the household types it in the bell
 * times editor rather than inheriting one in the wrong language.
 */
function buildSlots(spec: TemplateSpec): TimetableSlot[] {
  const slots: TimetableSlot[] = [];
  let at = spec.start;
  for (let n = 1; n <= spec.periods; n++) {
    const end = addMinutes(at, spec.length);
    slots.push({ kind: 'period', n, start: at, end });
    at = addMinutes(end, spec.gaps[n] ?? spec.changeover);
  }
  return slots;
}

/**
 * The bell schedules a new school can start from, so nobody types ten pairs
 * of times to get going.
 *
 * Each one is offered by the kind of school day it suits, with the bells it
 * would lay down shown underneath: a list of bare times reads as the only
 * schedules a school is allowed to have, which is the opposite of the truth.
 * The last row starts with a single period, for a day that looks like none of
 * the others and is quicker to type from nothing.
 */
export const SCHOOL_TEMPLATES: { id: string; slots: TimetableSlot[] }[] = [
  { id: 'long-45', slots: buildSlots({ start: '07:50', length: 45, changeover: 5, periods: 10, gaps: { 2: 20, 4: 20 } }) },
  { id: 'short-45', slots: buildSlots({ start: '08:15', length: 45, changeover: 5, periods: 8, gaps: { 2: 15, 4: 20 } }) },
  { id: 'hour', slots: buildSlots({ start: '08:00', length: 60, changeover: 5, periods: 6, gaps: { 2: 15, 4: 15 } }) },
  { id: 'blank', slots: buildSlots({ start: '08:00', length: 45, changeover: 5, periods: 1, gaps: {} }) },
];

// ---------------------------------------------------------------------------
// Reading the document
// ---------------------------------------------------------------------------

export const EMPTY_TIMETABLE_DATA: TimetableData = { schools: [], subjects: [], timetables: [] };

export function findTimetable(data: TimetableData, memberId: string | null): Timetable | undefined {
  return memberId ? data.timetables.find((timetable) => timetable.memberId === memberId) : undefined;
}

export function findSchool(data: TimetableData, schoolId: string | undefined): TimetableSchool | undefined {
  return schoolId ? data.schools.find((school) => school.id === schoolId) : undefined;
}

/** The periods of a school's bell schedule, in bell order. */
export function periodsOf(school: { slots: readonly TimetableSlot[] }): Extract<TimetableSlot, { kind: 'period' }>[] {
  return school.slots.filter((slot): slot is Extract<TimetableSlot, { kind: 'period' }> => slot.kind === 'period');
}

/** Everyone whose timetable is at this school, in document order. */
export function schoolMembers(data: TimetableData, schoolId: string): string[] {
  return data.timetables.filter((timetable) => timetable.schoolId === schoolId).map((timetable) => timetable.memberId);
}

/** Everyone with this subject somewhere in either of their weeks. */
export function subjectMembers(data: TimetableData, subjectId: string): string[] {
  return data.timetables
    .filter((timetable) => weeksOf(timetable).some((week) => weekUses(week, subjectId)))
    .map((timetable) => timetable.memberId);
}

function weeksOf(timetable: Timetable): TimetableWeek[] {
  return timetable.weeks.B ? [timetable.weeks.A, timetable.weeks.B] : [timetable.weeks.A];
}

function weekUses(week: TimetableWeek, subjectId: string): boolean {
  return DAY_KEYS.some((day) =>
    Object.values(week[day] ?? {}).some((cell) => 'subjectId' in cell && cell.subjectId === subjectId),
  );
}

/** The subjects this person actually has, so the palette leads with them. */
export function usedSubjectIds(timetable: Timetable | undefined): Set<string> {
  const used = new Set<string>();
  if (!timetable) return used;
  for (const week of weeksOf(timetable)) {
    for (const day of DAY_KEYS) {
      for (const cell of Object.values(week[day] ?? {})) {
        if ('subjectId' in cell) used.add(cell.subjectId);
      }
    }
  }
  return used;
}

/**
 * This week's letter and next week's, for the sentence under the A/B rule.
 * `timezone` is the household's, so the week turns over when the wall's does.
 */
export function weekCycleLetters(
  school: TimetableSchool,
  now: Date,
  timezone: string | undefined,
): { thisLetter: WeekLetter; nextLetter: WeekLetter } {
  const today = dateInZone(now, timezone);
  return { thisLetter: weekLetterOn(school, today), nextLetter: weekLetterOn(school, addDays(today, 7)) };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

export type TimetableBrush =
  | { kind: 'subject'; subjectId: string }
  | { kind: 'lunch' }
  | { kind: 'clear' };

/**
 * One cell after the brush has been on it.
 *
 * Painting the subject that is already there keeps the room and the course
 * badge, so dragging back across a lesson an import filled in does not strip
 * what it knew.
 */
export function paintedCell(current: TimetableCell | undefined, brush: TimetableBrush): TimetableCell | undefined {
  if (brush.kind === 'clear') return undefined;
  if (brush.kind === 'lunch') return { lunch: true };
  if (current && 'subjectId' in current && current.subjectId === brush.subjectId) return current;
  return { subjectId: brush.subjectId };
}

function setCell(week: TimetableWeek, day: DayKey, period: number, cell: TimetableCell | undefined): TimetableWeek {
  const cells = { ...(week[day] ?? {}) };
  if (cell === undefined) delete cells[period];
  else cells[period] = cell;
  const next = { ...week };
  if (Object.keys(cells).length === 0) delete next[day];
  else next[day] = cells;
  return next;
}

function withWeek(timetable: Timetable, letter: WeekLetter, change: (week: TimetableWeek) => TimetableWeek): Timetable {
  if (letter === 'B' && !timetable.weeks.B) return timetable;
  const weeks = { ...timetable.weeks };
  if (letter === 'A') weeks.A = change(weeks.A);
  else weeks.B = change(weeks.B as TimetableWeek);
  return { ...timetable, weeks };
}

/** Replace one person's timetable, leaving everybody else's alone. */
export function withTimetable(
  data: TimetableData,
  memberId: string,
  change: (timetable: Timetable) => Timetable,
): TimetableData {
  return {
    ...data,
    timetables: data.timetables.map((timetable) => (timetable.memberId === memberId ? change(timetable) : timetable)),
  };
}

/** One brush stroke on one cell of one person's week. */
export function withPaintedCell(
  data: TimetableData,
  memberId: string,
  letter: WeekLetter,
  day: DayKey,
  period: number,
  brush: TimetableBrush,
): TimetableData {
  return withTimetable(data, memberId, (timetable) =>
    withWeek(timetable, letter, (week) => setCell(week, day, period, paintedCell(week[day]?.[period], brush))),
  );
}

/**
 * The room and the course group on one lesson.
 *
 * An empty string clears the field rather than storing one, because the store
 * treats an empty room as no room and a half-typed box should not become a
 * value nobody can see.
 */
export function withCellDetails(
  data: TimetableData,
  memberId: string,
  letter: WeekLetter,
  day: DayKey,
  period: number,
  patch: { room?: string; course?: string },
): TimetableData {
  return withTimetable(data, memberId, (timetable) =>
    withWeek(timetable, letter, (week) => {
      const cell = week[day]?.[period];
      if (!cell || !('subjectId' in cell)) return week;
      return setCell(week, day, period, applyDetails(cell, patch));
    }),
  );
}

/**
 * The same room and course on every lesson of one subject, in both weeks.
 *
 * A school teaches chemistry in the chemistry lab, so typing the room once and
 * saying "every Chemistry" is what somebody almost always means. Both weeks,
 * because a fixed room does not alternate.
 */
export function withSubjectDetails(
  data: TimetableData,
  memberId: string,
  subjectId: string,
  patch: { room?: string; course?: string },
): TimetableData {
  return withTimetable(data, memberId, (timetable) => {
    const paint = (week: TimetableWeek): TimetableWeek => {
      let next = week;
      for (const day of DAY_KEYS) {
        for (const [period, cell] of Object.entries(week[day] ?? {})) {
          if (!('subjectId' in cell) || cell.subjectId !== subjectId) continue;
          next = setCell(next, day, Number(period), applyDetails(cell, patch));
        }
      }
      return next;
    };
    return {
      ...timetable,
      weeks: {
        A: paint(timetable.weeks.A),
        ...(timetable.weeks.B ? { B: paint(timetable.weeks.B) } : {}),
      },
    };
  });
}

/** One lesson with the patch applied, and emptied fields dropped rather than stored blank. */
function applyDetails(
  cell: TimetableCell,
  patch: { room?: string; course?: string },
): TimetableCell {
  if (!('subjectId' in cell)) return cell;
  const room = patch.room === undefined ? cell.room : patch.room.trim() || undefined;
  const course = patch.course === undefined ? cell.course : patch.course.trim() || undefined;
  return { subjectId: cell.subjectId, ...(room ? { room } : {}), ...(course ? { course } : {}) };
}

/**
 * Stop, or start, following the spreadsheet a week came from.
 *
 * Editing a synced week by hand turns it off: the alternative is an hourly
 * check that throws away the cell a parent just fixed, which is the failure
 * this whole window is built to avoid. Reversible, from the panel and from the
 * line that says it happened.
 */
export function withSheetSync(data: TimetableData, memberId: string, sync: boolean): TimetableData {
  return withTimetable(data, memberId, (timetable) =>
    timetable.source ? { ...timetable, source: { ...timetable.source, sync } } : timetable,
  );
}

/**
 * What a check of one person's spreadsheet turned out to be.
 *
 * Null when the document could not be read back, in which case the load banner
 * says so and the panel has nothing to add.
 */
export type SheetCheckOutcome = 'changed' | 'unchanged' | null;

/**
 * The document to save after an edit, with a hand-edited week let off the sheet.
 *
 * Compares the person's weeks either side of the change rather than asking the
 * component that made it, so every way of editing a week is covered by one rule
 * and a new one cannot forget it. Returns the person who was let off, if any, so
 * the window can say so: a change nobody was told about is the same silent loss
 * as the rows this window used to drop.
 */
export function stopFollowingEditedWeek(
  before: TimetableData,
  after: TimetableData,
  memberId: string | null,
): { data: TimetableData; stopped: string | null } {
  if (!memberId || !followsSheet(before, memberId)) return { data: after, stopped: null };
  const was = findTimetable(before, memberId)?.weeks;
  const now = findTimetable(after, memberId)?.weeks;
  // Nothing to let off if the week is untouched, or if the person has just been
  // removed from the document altogether.
  if (!was || !now || JSON.stringify(was) === JSON.stringify(now)) return { data: after, stopped: null };
  return { data: withSheetSync(after, memberId, false), stopped: memberId };
}

/** Whether a hand edit to this person's week would stop it following a sheet. */
export function followsSheet(data: TimetableData, memberId: string | null): boolean {
  if (!memberId) return false;
  return findTimetable(data, memberId)?.source?.sync === true;
}

// ---------------------------------------------------------------------------
// Adding and removing
// ---------------------------------------------------------------------------

/** Start a week for somebody who has none yet, at the school given. */
export function addTimetable(data: TimetableData, memberId: string, schoolId: string): TimetableData {
  if (data.timetables.some((timetable) => timetable.memberId === memberId)) return data;
  return { ...data, timetables: [...data.timetables, { memberId, schoolId, weeks: { A: {} } }] };
}

function copyWeek(week: TimetableWeek): TimetableWeek {
  const copy: TimetableWeek = {};
  for (const day of DAY_KEYS) {
    if (week[day]) copy[day] = { ...week[day] };
  }
  return copy;
}

/**
 * Turn a second week on or off for one person.
 *
 * Turning it on copies week A across, because a household that alternates
 * usually changes a handful of periods rather than typing a second week from
 * nothing, and it turns the school's alternation on if it was off: a week B
 * at a school that does not alternate is not a document the store will take.
 */
export function withWeeksAB(data: TimetableData, memberId: string, on: boolean): TimetableData {
  const timetable = findTimetable(data, memberId);
  if (!timetable) return data;
  if (!on) {
    return withTimetable(data, memberId, (current) => ({ ...current, weeks: { A: current.weeks.A } }));
  }
  if (timetable.weeks.B) return data;
  const withB = withTimetable(data, memberId, (current) => ({
    ...current,
    weeks: { A: current.weeks.A, B: copyWeek(current.weeks.A) },
  }));
  const school = findSchool(withB, timetable.schoolId);
  if (!school || school.weekCycle.mode !== 'off') return withB;
  return withWeekCycle(withB, school.id, { mode: 'parity', oddWeek: 'A' });
}

/**
 * Change a school's A/B rule.
 *
 * Switching it off takes the second week away from everybody at that school:
 * the store refuses a document where a week B outlives the rule that gives it
 * a meaning, and leaving it in the draft would fail every later save.
 */
export function withWeekCycle(
  data: TimetableData,
  schoolId: string,
  weekCycle: TimetableSchool['weekCycle'],
): TimetableData {
  const schools = data.schools.map((school) => (school.id === schoolId ? { ...school, weekCycle } : school));
  if (weekCycle.mode !== 'off') return { ...data, schools };
  const timetables = data.timetables.map((timetable) =>
    timetable.schoolId === schoolId && timetable.weeks.B ? { ...timetable, weeks: { A: timetable.weeks.A } } : timetable,
  );
  return { ...data, schools, timetables };
}

/** The second weeks a school's rule is holding up, so they can be put back. */
export function stashedWeeksB(data: TimetableData, schoolId: string): Record<string, TimetableWeek> {
  const stash: Record<string, TimetableWeek> = {};
  for (const timetable of data.timetables) {
    if (timetable.schoolId === schoolId && timetable.weeks.B) stash[timetable.memberId] = timetable.weeks.B;
  }
  return stash;
}

/** Put stashed second weeks back, for a rule that was turned off by mistake. */
export function withRestoredWeeksB(data: TimetableData, stash: Record<string, TimetableWeek>): TimetableData {
  return {
    ...data,
    timetables: data.timetables.map((timetable) =>
      stash[timetable.memberId] && !timetable.weeks.B
        ? { ...timetable, weeks: { A: timetable.weeks.A, B: stash[timetable.memberId] } }
        : timetable,
    ),
  };
}

/**
 * A new school, built before it is added.
 *
 * The caller holds the school it just made, so it can select it straight away;
 * building it inside the state update would mean reading an id back out of an
 * updater that React is free to run more than once.
 */
export function makeSchool(name: string, slots: readonly TimetableSlot[]): TimetableSchool {
  return {
    id: newId('school'),
    name,
    slots: slots.map((slot) => ({ ...slot })),
    weekCycle: { mode: 'off' },
    specialDays: [],
  };
}

/** Add a school that is already built. */
export function withAddedSchool(data: TimetableData, school: TimetableSchool): TimetableData {
  return { ...data, schools: [...data.schools, school] };
}

export function withSchool(
  data: TimetableData,
  schoolId: string,
  change: (school: TimetableSchool) => TimetableSchool,
): TimetableData {
  return { ...data, schools: data.schools.map((school) => (school.id === schoolId ? change(school) : school)) };
}

/**
 * Take one person's week away again.
 *
 * Adding a timetable was a one-way door: a person picked by mistake, or a child
 * who has left school, stayed in the list for good and the only way out was
 * removing them from the family, which takes their chores and their calendar
 * with them. Nothing else about the person is touched here; the roster is still
 * the only place somebody exists.
 */
export function withoutTimetable(data: TimetableData, memberId: string): TimetableData {
  return { ...data, timetables: data.timetables.filter((timetable) => timetable.memberId !== memberId) };
}

/**
 * Remove a school nobody is at.
 *
 * A school still in use is deliberately not removable here: the store refuses a
 * timetable whose school is not in the list, so deleting one out from under a
 * week would either refuse the whole document or quietly move a child to another
 * school's bell times. The caller checks `schoolMembers` first and says who is
 * there instead.
 */
export function withoutSchool(data: TimetableData, schoolId: string): TimetableData {
  if (schoolMembers(data, schoolId).length > 0) return data;
  return { ...data, schools: data.schools.filter((school) => school.id !== schoolId) };
}

/** A new subject, built before it is added. See `makeSchool` for why. */
export function makeSubject(code: string, color: string, name?: string): TimetableSubject {
  return { id: newId('subject'), code, name: name?.trim() || code, color, icon: STARTING_ICON };
}

/**
 * A short code for a subject a spreadsheet spelled out in full.
 *
 * A sheet says "Geography" where a cell has room for "Geog", and the store
 * refuses a code longer than `maxCodeLength`, so an import that reused the
 * sheet's own word was refused in one piece with nothing to act on. Several
 * words become their initials, the way a household writes ELA for English
 * Language Arts; one long word keeps its first few letters. Either way the
 * full text stays as the subject's name, and both are editable on the Subjects
 * tab afterwards.
 */
export function shortCodeFor(text: string): string {
  const max = TIMETABLE_LIMITS.maxCodeLength;
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const words = trimmed.split(/[\s/·,-]+/).filter(Boolean);
  if (words.length > 1) {
    const initials = words.map((word) => [...word][0].toUpperCase()).join('');
    if (initials.length <= max) return initials;
    return initials.slice(0, max);
  }
  // One word: four letters reads as an abbreviation ("Chem", "Biol") where six
  // reads as a word with its end bitten off ("Chemis").
  return [...trimmed].slice(0, Math.min(4, max)).join('');
}

/** Add a subject that is already built. */
export function withAddedSubject(data: TimetableData, subject: TimetableSubject): TimetableData {
  return { ...data, subjects: [...data.subjects, subject] };
}

export function withSubject(
  data: TimetableData,
  subjectId: string,
  change: (subject: TimetableSubject) => TimetableSubject,
): TimetableData {
  return { ...data, subjects: data.subjects.map((subject) => (subject.id === subjectId ? change(subject) : subject)) };
}

// ---------------------------------------------------------------------------
// Dates to remember
// ---------------------------------------------------------------------------

/** A new, unfinished date for one person: the day is asked, not guessed. */
export function makeNote(kind: TimetableNote['kind'] = 'test'): TimetableNote {
  return { id: newId('note'), date: '', kind };
}

/** Add or replace one person's date, keeping the list in date order. */
export function withNote(data: TimetableData, memberId: string, note: TimetableNote): TimetableData {
  return withTimetable(data, memberId, (timetable) => {
    const rest = (timetable.notes ?? []).filter((entry) => entry.id !== note.id);
    const notes = [...rest, note].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { ...timetable, notes };
  });
}

/** Take one date off one person. */
export function withoutNote(data: TimetableData, memberId: string, noteId: string): TimetableData {
  return withTimetable(data, memberId, (timetable) => {
    const notes = (timetable.notes ?? []).filter((entry) => entry.id !== noteId);
    const { notes: _dropped, ...rest } = timetable;
    return notes.length ? { ...rest, notes } : rest;
  });
}

/**
 * Whether a date is complete enough for the store to take: a day, and for
 * each kind the thing it points at. The editor keeps an unfinished row on
 * screen and out of the save, and never lets it look saved.
 */
export function noteIsComplete(note: TimetableNote): boolean {
  if (!note.date) return false;
  if (note.kind === 'test') return Boolean(note.subjectId);
  if (note.kind === 'bring') return Boolean(note.text?.trim());
  return (note.periods?.length ?? 0) > 0;
}

/** Take a subject off the list and out of every week that used it. */
export function withoutSubject(data: TimetableData, subjectId: string): TimetableData {
  const strip = (week: TimetableWeek): TimetableWeek => {
    let next = week;
    for (const day of DAY_KEYS) {
      for (const [period, cell] of Object.entries(week[day] ?? {})) {
        if ('subjectId' in cell && cell.subjectId === subjectId) next = setCell(next, day, Number(period), undefined);
      }
    }
    return next;
  };
  return {
    ...data,
    subjects: data.subjects.filter((subject) => subject.id !== subjectId),
    timetables: data.timetables.map((timetable) => {
      // A test in the removed subject has nothing left to point at.
      const notes = timetable.notes?.filter((note) => !(note.kind === 'test' && note.subjectId === subjectId));
      const { notes: _dropped, ...rest } = timetable;
      return {
        ...rest,
        weeks: {
          A: strip(timetable.weeks.A),
          ...(timetable.weeks.B ? { B: strip(timetable.weeks.B) } : {}),
        },
        ...(notes?.length ? { notes } : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// What gets sent
// ---------------------------------------------------------------------------

/**
 * The draft as the store will take it.
 *
 * Incomplete, unused rows stay in the draft until they are finished. Schools
 * and subjects referenced by a timetable must stay in the save too: filtering
 * them out would also delete the lessons that depend on them. The store
 * refuses those incomplete edits and the draft displays the validation error.
 */
export function sanitizeTimetableData(data: TimetableData): TimetableData {
  // A blank field on a referenced subject is an incomplete edit, not a deletion.
  // Keep it so the store refuses the save without removing any lessons.
  const used = new Set(data.timetables.flatMap((timetable) => [...usedSubjectIds(timetable)]));
  const subjects = data.subjects.filter((subject) =>
    used.has(subject.id) || (subject.code.trim() !== '' && subject.name.trim() !== ''),
  );
  const subjectIds = new Set(subjects.map((subject) => subject.id));

  const schools = data.schools
    .filter((school) => school.name.trim() !== '' || schoolMembers(data, school.id).length > 0)
    .map((school) => ({
      ...school,
      slots: school.slots.filter((slot) => slot.kind === 'period' || slot.label.trim() !== ''),
      specialDays: school.specialDays.filter((day) => day.date !== '' && day.label.trim() !== ''),
      ...(school.care && school.care.name.trim() === '' ? { care: undefined } : {}),
    }));
  const byId = new Map(schools.map((school) => [school.id, school]));

  const keepCells = (week: TimetableWeek): TimetableWeek => {
    const kept: TimetableWeek = {};
    for (const day of DAY_KEYS) {
      const cells = week[day];
      if (!cells) continue;
      const usable: Record<number, TimetableCell> = {};
      for (const [period, cell] of Object.entries(cells)) {
        if (!('subjectId' in cell) || subjectIds.has(cell.subjectId)) usable[Number(period)] = cell;
      }
      if (Object.keys(usable).length > 0) kept[day] = usable;
    }
    return kept;
  };

  const timetables = data.timetables
    .filter((timetable) => byId.has(timetable.schoolId))
    .map((timetable) => {
      const alternates = byId.get(timetable.schoolId)?.weekCycle.mode !== 'off';
      // An unfinished date stays in the draft and out of the save, the way an
      // unfinished special day does; a finished one is trimmed as the store
      // will trim it.
      const notes = (timetable.notes ?? [])
        .filter(noteIsComplete)
        .map((note) => ({ ...note, ...(note.text !== undefined ? { text: note.text.trim() } : {}) }))
        .filter((note) => !(note.kind === 'test' && note.subjectId && !subjectIds.has(note.subjectId)));
      const { notes: _all, ...rest } = timetable;
      return {
        ...rest,
        weeks: {
          A: keepCells(timetable.weeks.A),
          ...(timetable.weeks.B && alternates ? { B: keepCells(timetable.weeks.B) } : {}),
        },
        ...(notes.length ? { notes } : {}),
      };
    });

  return { schools, subjects, timetables };
}

// ---------------------------------------------------------------------------
// The draft itself
// ---------------------------------------------------------------------------

export interface TimetableDraftMessages {
  /** Shown when the document cannot be read at all. */
  loadFailed: string;
  /** Shown when a save is refused for a reason the server did not put words to. */
  saveFailed: string;
}

export interface TimetableDraft {
  data: TimetableData | null;
  loaded: boolean;
  loadError: string | null;
  saveError: string | null;
  /** A save was refused because somebody else saved first. */
  conflict: boolean;
  update: (change: (current: TimetableData) => TimetableData) => void;
  /** Save what is pending right now, for closing the window. */
  flush: () => void;
  /**
   * Save what is pending and say whether the store took it, so the window can
   * stay open on a refusal instead of closing over it.
   */
  flushNow: () => Promise<boolean>;
  /**
   * Read the document again, throwing away what is on screen, and hand back
   * what came.
   *
   * Awaited rather than fired and forgotten, because the caller has to be able
   * to say what the re-read brought: pressing "Check now" reports whether the
   * sheet had a new week, and the only way to know that is to compare the
   * document before the check with the one after it. Null when the read itself
   * failed, which the load banner reports.
   */
  reload: () => Promise<TimetableData | null>;
}

export function useTimetableDraft(messages: TimetableDraftMessages): TimetableDraft {
  const [data, setData] = useState<TimetableData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  // The save runs long after the render that scheduled it, so it reads the
  // draft and the revision through refs rather than closing over either.
  const dataRef = useRef<TimetableData | null>(null);
  dataRef.current = data;
  const revisionRef = useRef<string | null>(null);
  // Adopting a conflicting document changes the draft, which would schedule a
  // save of the very document that was just read back.
  //
  // What is remembered is the adopted document itself, not "skip one save". A
  // boolean was consumed by whichever save ran next, so a cell painted inside
  // the debounce window just after an adoption was swallowed: it lived only in
  // the draft, nothing retried it, and the banner invited a Refresh that would
  // have thrown it away. Comparing identity instead means the save is skipped
  // only while the draft really is still the document that came back.
  const adoptedRef = useRef<TimetableData | null>(null);
  // Read inside a save, which runs between renders, so the state itself is not
  // current enough: a conflict adopted a moment ago must still count.
  const conflictRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // The first read. Every later one goes through `reload`, which has an answer
  // to hand back.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    loadTimetables(editorFetch, messagesRef.current.loadFailed)
      .then((snapshot) => {
        if (cancelled) return;
        revisionRef.current = snapshot.revision;
        setData(snapshot.data);
      })
      .catch((error) => {
        if (cancelled || isSessionExpired(error)) return;
        setLoadError(messagesRef.current.loadFailed);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** The save that is open right now, and the one waiting behind it. */
  const savingRef = useRef<Promise<boolean> | null>(null);
  const queuedRef = useRef<Promise<boolean> | null>(null);

  /** Send the draft as it stands. Only ever called with nothing else in the air. */
  const send = useCallback(async (): Promise<boolean> => {
    const current = dataRef.current;
    const revision = revisionRef.current;
    if (!current || !revision) return true;
    // Adopting a conflicting document is not an edit of ours, so it does not go
    // back. Done still must not close over the banner it came with.
    if (adoptedRef.current !== null && adoptedRef.current === current) {
      adoptedRef.current = null;
      return !conflictRef.current;
    }
    adoptedRef.current = null;
    const result = await saveTimetables(
      editorFetch,
      { data: sanitizeTimetableData(current), revision },
      messagesRef.current.saveFailed,
    );
    if (result.kind === 'conflict') {
      if (result.snapshot) {
        revisionRef.current = result.snapshot.revision;
        adoptedRef.current = result.snapshot.data;
        dataRef.current = result.snapshot.data;
        setData(result.snapshot.data);
      }
      conflictRef.current = true;
      setConflict(true);
      return false;
    }
    revisionRef.current = result.snapshot.revision;
    conflictRef.current = false;
    setConflict(false);
    setSaveError(null);
    return true;
  }, []);

  const start = useCallback((): Promise<boolean> => {
    const run = send().finally(() => {
      savingRef.current = null;
    });
    savingRef.current = run;
    return run;
  }, [send]);

  /**
   * One save at a time, whoever asked for it.
   *
   * A save quotes the revision it started from, so two of them in the air at
   * once means the second quotes a revision the first has already replaced. The
   * store refuses it as a conflict with nobody, and the window then adopts the
   * document the first save wrote, throwing away every edit made since it and
   * saying somebody else got there first. Pressing Done while an autosave was
   * coming back was enough to do it.
   *
   * So a save that arrives while one is open waits for it, and then sends the
   * draft as it stands at that moment against the revision that came back. One
   * waiting save is enough: it will carry whatever is on screen when it goes, so
   * a third caller has nothing to add to it.
   */
  const persist = useCallback((): Promise<boolean> => {
    const open = savingRef.current;
    if (!open) return start();
    queuedRef.current ??= open
      // The save in front reports its own failure to whoever asked for it;
      // this one still has a draft to get out.
      .catch(() => false)
      .then(() => {
        queuedRef.current = null;
        return start();
      });
    return queuedRef.current;
  }, [start]);

  const { flush, cancel } = useDebouncedSave({
    values: [data],
    enabled: data !== null,
    save: persist,
    onError: (error) => {
      if (isSessionExpired(error)) return;
      setSaveError(error instanceof Error && error.message ? error.message : messagesRef.current.saveFailed);
    },
  });

  /**
   * The save the Done button waits on.
   *
   * `flush` hands the save to the debouncer and forgets it, which is right for
   * an edit that is followed by more editing and wrong for the last one: a
   * refusal used to be shown in a banner on a window that had already closed
   * over it, so the household's last change was gone with nothing said.
   *
   * Anything still sitting in the debounce is dropped rather than left to fire:
   * this save carries that edit already, and the timer would only send the same
   * document again behind it.
   */
  const flushNow = useCallback(async (): Promise<boolean> => {
    cancel();
    try {
      return await persist();
    } catch (error) {
      if (isSessionExpired(error)) return true;
      setSaveError(error instanceof Error && error.message ? error.message : messagesRef.current.saveFailed);
      return false;
    }
  }, [cancel, persist]);

  const update = useCallback((change: (current: TimetableData) => TimetableData) => {
    setData((current) => {
      if (!current) return current;
      const next = change(current);
      dataRef.current = next;
      return next;
    });
  }, []);

  /**
   * A read the caller waits for.
   *
   * The document that comes back is marked as adopted, the way a conflicting
   * one is: it is the store's own copy, so sending it straight back would be a
   * save of nothing at all.
   */
  const reload = useCallback(async (): Promise<TimetableData | null> => {
    conflictRef.current = false;
    setConflict(false);
    setSaveError(null);
    try {
      const snapshot = await loadTimetables(editorFetch, messagesRef.current.loadFailed);
      revisionRef.current = snapshot.revision;
      adoptedRef.current = snapshot.data;
      dataRef.current = snapshot.data;
      setData(snapshot.data);
      return snapshot.data;
    } catch (error) {
      if (!isSessionExpired(error)) setLoadError(messagesRef.current.loadFailed);
      return null;
    }
  }, []);

  return {
    data,
    loaded: data !== null,
    loadError,
    saveError,
    conflict,
    update,
    flush,
    flushNow,
    reload,
  };
}
