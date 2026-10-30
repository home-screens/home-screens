import { DAY_NOTES_LIMITS, type DayNote, type DayNotesData } from '@/types/day-notes';
import { localISODate } from './timezone';

/**
 * The rules for calendar day notes, shared by the API, the phone's optimistic
 * view and every calendar on the wall. Pure and free of the store's file
 * system imports, so the phone runs exactly what the server will.
 */

export class DayNotesError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'DayNotesError';
  }
}

/** What a calendar view reads: each day's note texts, in the order they were written. */
export type DayNotes = Readonly<Record<string, readonly string[]>>;

export const NO_DAY_NOTES: DayNotes = Object.freeze({});
const NONE: readonly string[] = Object.freeze([]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day spelled `YYYY-MM-DD` (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** `iso` moved by `days`, counted on the calendar (no clock, so no daylight-saving drift). */
export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** One line of plain words: trimmed, every run of spaces and line breaks made one space. */
export function normalizeDayNoteText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Characters as people count them: an emoji is one, not the two code units JavaScript sees. */
export function dayNoteLength(text: string): number {
  return Array.from(text).length;
}

/** `text` cut to the cap, counted the way `dayNoteLength` counts. */
export function clampDayNoteText(text: string): string {
  const chars = Array.from(text);
  return chars.length <= DAY_NOTES_LIMITS.maxTextLength ? text : chars.slice(0, DAY_NOTES_LIMITS.maxTextLength).join('');
}

/** Each day's note texts, in the order they were written: what the calendar views read. */
export function indexDayNotes(notes: readonly DayNote[]): DayNotes {
  if (notes.length === 0) return NO_DAY_NOTES;
  const byDate: Record<string, string[]> = {};
  for (const note of notes) (byDate[note.date] ??= []).push(note.text);
  return byDate;
}

/**
 * The notes for a day a calendar view draws. Views hold their days as Dates
 * whose local getters read the household's wall clock (`useTZClock`), so the
 * Date's own calendar day is the key.
 */
export function dayNotesFor(notes: DayNotes | undefined, date: Date): readonly string[] {
  return notes?.[localISODate(date)] ?? NONE;
}

/** True when any of `dates` has a note: a calendar with no events but a note in view still draws its view. */
export function hasDayNoteIn(notes: DayNotes, dates: readonly Date[]): boolean {
  if (notes === NO_DAY_NOTES) return false;
  return dates.some((date) => notes[localISODate(date)] !== undefined);
}

/** The notes written for one day, in order. */
export function notesOnDay(data: DayNotesData, date: string): DayNote[] {
  return data.notes.filter((note) => note.date === date);
}

function checkWords(text: unknown): string {
  if (typeof text !== 'string') throw new DayNotesError(400, 'A day note needs some words.');
  const words = normalizeDayNoteText(text);
  if (dayNoteLength(words) > DAY_NOTES_LIMITS.maxTextLength) {
    throw new DayNotesError(400, `Keep it to ${DAY_NOTES_LIMITS.maxTextLength} letters or fewer.`);
  }
  return words;
}

function checkWritableDay(date: unknown, today: string): string {
  if (!isIsoDate(date)) throw new DayNotesError(400, 'That is not a day on the calendar.');
  if (date < today) throw new DayNotesError(400, 'That day is over. Pick today or a day after it.');
  if (date > addIsoDays(today, DAY_NOTES_LIMITS.aheadDays)) throw new DayNotesError(400, 'That day is too far away. Pick a day within a year.');
  return date;
}

/**
 * Write a new note for `date`. `today` is the household's calendar day: a day
 * already gone cannot take a note, and neither can one more than `aheadDays`
 * out. A day holds up to `maxPerDay` notes.
 */
export function addDayNote(data: DayNotesData, input: { id: string; date: unknown; text: unknown }, today: string): DayNotesData {
  const date = checkWritableDay(input.date, today);
  const words = checkWords(input.text);
  if (!words) throw new DayNotesError(400, 'A day note needs some words.');
  if (data.notes.some((note) => note.id === input.id)) throw new DayNotesError(409, 'That note is already there.');
  if (notesOnDay(data, date).length >= DAY_NOTES_LIMITS.maxPerDay) {
    throw new DayNotesError(409, `A day holds ${DAY_NOTES_LIMITS.maxPerDay} notes. Change or remove one first.`);
  }
  if (data.notes.length >= DAY_NOTES_LIMITS.maxNotes) throw new DayNotesError(409, 'There are too many day notes. Remove some first.');
  return { ...data, notes: [...data.notes, { id: input.id, date, text: words }] };
}

/**
 * Change a note's words. Empty words remove it. A note on a day that is over
 * can be removed but not changed. Returns the input when nothing changes.
 */
export function updateDayNote(data: DayNotesData, id: string, text: unknown, today: string): DayNotesData {
  const note = data.notes.find((n) => n.id === id);
  if (!note) throw new DayNotesError(404, 'That note is not there any more.');
  const words = checkWords(text);
  if (!words) return removeDayNote(data, id);
  checkWritableDay(note.date, today);
  if (note.text === words) return data;
  return { ...data, notes: data.notes.map((n) => (n.id === id ? { ...n, text: words } : n)) };
}

/** Remove a note. Removing one that is already gone changes nothing, so a retried tap is harmless. */
export function removeDayNote(data: DayNotesData, id: string): DayNotesData {
  if (!data.notes.some((note) => note.id === id)) return data;
  return { ...data, notes: data.notes.filter((note) => note.id !== id) };
}

/** Drop notes more than `keepDays` before `today`. Returns the input when nothing goes. */
export function sweepDayNotes(data: DayNotesData, today: string): DayNotesData {
  const oldest = addIsoDays(today, -DAY_NOTES_LIMITS.keepDays);
  const kept = data.notes.filter((note) => note.date >= oldest);
  return kept.length === data.notes.length ? data : { ...data, notes: kept };
}

/**
 * Shape check for a document about to be written whole (a backup restore).
 * Returns a plain-language reason, or null when the shape is sound. Past days
 * are allowed: a restore brings back what the file held.
 */
export function validateDayNotesData(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Day notes must be an object with a notes list';
  const notes = (raw as Record<string, unknown>).notes;
  if (!Array.isArray(notes)) return 'Day notes must be an object with a notes list';
  if (notes.length > DAY_NOTES_LIMITS.maxNotes) return `Day notes: at most ${DAY_NOTES_LIMITS.maxNotes} notes`;
  const ids = new Set<string>();
  const perDay = new Map<string, number>();
  for (const [i, entry] of notes.entries()) {
    const where = `Day note ${i + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `${where} must be an object`;
    const note = entry as Record<string, unknown>;
    if (typeof note.id !== 'string' || !note.id) return `${where} is missing its id`;
    if (ids.has(note.id)) return `${where} repeats the id of another note`;
    ids.add(note.id);
    if (!isIsoDate(note.date)) return `${where}: "${String(note.date)}" is not a day`;
    if (typeof note.text !== 'string' || !note.text.trim()) return `${where} has no words`;
    if (dayNoteLength(note.text) > DAY_NOTES_LIMITS.maxTextLength) return `${where} is longer than ${DAY_NOTES_LIMITS.maxTextLength} characters`;
    const count = (perDay.get(note.date) ?? 0) + 1;
    if (count > DAY_NOTES_LIMITS.maxPerDay) return `Day notes: ${note.date} has more than ${DAY_NOTES_LIMITS.maxPerDay} notes`;
    perDay.set(note.date, count);
  }
  return null;
}

/**
 * The days a page of the phone's Calendar page lists: page 0 starts today,
 * every page after it 7 days later. The last page stops at the furthest day
 * a note can be written for (`aheadDays`), so it never offers a day the store
 * would refuse.
 */
export function upcomingDays(today: string, page: number): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const offset = page * 7 + i;
    if (offset > DAY_NOTES_LIMITS.aheadDays) break;
    days.push(addIsoDays(today, offset));
  }
  return days;
}

/** The last page the phone's Calendar page can reach (it ends at `aheadDays`). */
export const LAST_DAY_NOTES_PAGE = Math.floor(DAY_NOTES_LIMITS.aheadDays / 7);
