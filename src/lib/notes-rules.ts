import { NOTE_LIFE_MS, NOTES_GONE_KEEP_MS, type Note, type NoteLife } from '@/types/notes';

/**
 * What the family notes board means, as pure functions: which notes are on
 * the wall, in what order, how many a view draws, when one expires, and how
 * its age reads. Every wall view, the phone tab and the store use these, so
 * a note can never be live on one surface and gone on another.
 */

/** Which notes a wall view shows: every live note, the pinned ones, or the important ones. */
export type NotesFilter = 'all' | 'pinned' | 'important';

/** ISO instant a note posted (or re-timed) at `from` with `life` leaves the wall; null for `keep`. */
export function expiryFor(life: NoteLife, from: Date): string | null {
  if (life === 'keep') return null;
  return new Date(from.getTime() + NOTE_LIFE_MS[life]).toISOString();
}

/** On the wall right now: no expiry, or one still ahead. */
export function isLive(note: Pick<Note, 'expiresAt'>, now: Date): boolean {
  if (note.expiresAt === null) return true;
  const at = Date.parse(note.expiresAt);
  return Number.isNaN(at) ? true : at > now.getTime();
}

/** Off the wall, but kept for the phone's Gone group. */
export function isGone(note: Pick<Note, 'expiresAt'>, now: Date): boolean {
  return !isLive(note, now);
}

/** Gone for longer than the keep window: the next write drops it. */
export function isSweepable(note: Pick<Note, 'expiresAt'>, now: Date): boolean {
  if (note.expiresAt === null) return false;
  const at = Date.parse(note.expiresAt);
  return !Number.isNaN(at) && now.getTime() - at > NOTES_GONE_KEEP_MS;
}

/** Milliseconds until the note leaves the wall; null for `keep`, 0 or less when gone. */
export function timeLeftMs(note: Pick<Note, 'expiresAt'>, now: Date): number | null {
  if (note.expiresAt === null) return null;
  const at = Date.parse(note.expiresAt);
  return Number.isNaN(at) ? null : at - now.getTime();
}

function createdMs(note: Pick<Note, 'createdAt'>): number {
  const at = Date.parse(note.createdAt);
  return Number.isNaN(at) ? 0 : at;
}

/**
 * Wall order: pinned first, then newest first. Stable on ties, so two notes
 * posted in the same second keep store order.
 */
export function sortForWall<T extends Pick<Note, 'pinned' | 'createdAt'>>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return createdMs(b) - createdMs(a);
  });
}

/** Newest first regardless of pin: the Timeline view's order. */
export function sortByTime<T extends Pick<Note, 'createdAt'>>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => createdMs(b) - createdMs(a));
}

/** Which notes a filter keeps. */
export function applyFilter<T extends Pick<Note, 'pinned' | 'important'>>(notes: readonly T[], filter: NotesFilter | undefined): T[] {
  if (filter === 'pinned') return notes.filter((n) => n.pinned);
  if (filter === 'important') return notes.filter((n) => n.important);
  return [...notes];
}

export interface ArrangedNotes<T> {
  /** The notes a view draws, in wall order. */
  shown: T[];
  /** How many live notes matched but were cut by `max` ("and N more"). */
  hidden: number;
  /** Every live note that matched, before the cap. */
  all: T[];
}

/**
 * The one rule every view and the phone share: live notes, filtered, in
 * wall order, capped. `max` undefined or 0 means no cap (the phone).
 */
export function arrangeNotes<T extends Pick<Note, 'pinned' | 'important' | 'createdAt' | 'expiresAt'>>(
  notes: readonly T[],
  now: Date,
  opts: { filter?: NotesFilter; max?: number } = {},
): ArrangedNotes<T> {
  const all = sortForWall(applyFilter(notes.filter((n) => isLive(n, now)), opts.filter));
  const max = opts.max && opts.max > 0 ? Math.floor(opts.max) : all.length;
  const shown = all.slice(0, max);
  return { shown, hidden: all.length - shown.length, all };
}

/** The phone's Gone group: expired notes still inside the keep window, newest expiry first. */
export function goneNotes<T extends Pick<Note, 'expiresAt' | 'createdAt'>>(notes: readonly T[], now: Date): T[] {
  return notes
    .filter((n) => isGone(n, now) && !isSweepable(n, now))
    .sort((a, b) => Date.parse(b.expiresAt ?? '') - Date.parse(a.expiresAt ?? ''));
}

/**
 * The order a stepping view (Spotlight, Strip) walks: wall order, with every
 * pinned or important note given two turns in a row, so the notices a parent
 * cared enough to flag are on screen twice as long.
 */
export function stepOrder<T extends Pick<Note, 'pinned' | 'important'>>(shown: readonly T[]): T[] {
  const out: T[] = [];
  for (const note of shown) {
    out.push(note);
    if (note.pinned || note.important) out.push(note);
  }
  return out;
}

/**
 * The Sticky view's lean for a note: a constant from its id, between
 * -1.6 and 1.6 degrees, so the same note leans the same way on every
 * render and every display and never animates.
 */
export function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const unit = ((hash % 1000) + 1000) % 1000 / 1000;
  return Math.round((unit * 3.2 - 1.6) * 10) / 10;
}

/** How many columns the Cards view draws at a width: one under 400 px, two to 900, three above. */
export function cardColumns(widthPx: number): number {
  if (widthPx < 400) return 1;
  if (widthPx < 900) return 2;
  return 3;
}

/**
 * The initial drawn in an author bubble: the first letter in the name,
 * upper-cased, so "Big Guns" is B and a name that starts with an emoji
 * ("🦄Mia") takes its M rather than half a surrogate pair, the calendar's
 * rule. A name with no letter at all gives its first whole character.
 */
export function initialOf(name: string): string {
  const letter = name.match(/\p{L}/u);
  if (letter) return letter[0].toLocaleUpperCase();
  return (Array.from(name.trim())[0] ?? '').toLocaleUpperCase();
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How old a note reads on the wall, in the household's language: "25m ago",
 * "2h ago" in English and the short relative form elsewhere, then the short
 * weekday inside the last week, then a short date. Built on the Intl formatters so no dictionary string is
 * needed per locale; `now` is the wall's clock and `timezone` the household's.
 */
/**
 * English's narrow relative form is the compact "5m ago" the wall wants. In
 * the other shipped languages narrow is either a bare negative number
 * ("-5 min" in French) or a bare letter ("vor 5 m" in German, which reads
 * as metres), so they take the short form ("il y a 5 min", "vor 5 Min.").
 */
function relativeStyle(locale: string): 'narrow' | 'short' {
  return locale.toLowerCase().startsWith('en') ? 'narrow' : 'short';
}

export function formatNoteAge(createdAt: string, now: Date, locale: string, timezone?: string): string {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return '';
  const age = Math.max(0, now.getTime() - at);
  try {
    if (age < DAY_MS) {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: relativeStyle(locale) });
      if (age < HOUR_MS) return rtf.format(-Math.max(1, Math.floor(age / MINUTE_MS)), 'minute');
      return rtf.format(-Math.floor(age / HOUR_MS), 'hour');
    }
    const when = new Date(at);
    if (age < 7 * DAY_MS) return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: timezone }).format(when);
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: timezone }).format(when);
  } catch {
    return '';
  }
}

/**
 * The phone's "time left": a rounded count of minutes, hours or days, so the
 * tab can say "22 h left" or "4 days left" with its own words. `unit` is
 * null for `keep`; `value` is 0 when the note is gone.
 */
export function timeLeftParts(note: Pick<Note, 'expiresAt'>, now: Date): { unit: 'minute' | 'hour' | 'day' | null; value: number } {
  const left = timeLeftMs(note, now);
  if (left === null) return { unit: null, value: 0 };
  if (left <= 0) return { unit: 'minute', value: 0 };
  // Rounding happens before the unit is chosen, so 59.5 minutes reads as
  // 1 hour rather than "60 min left", and 23.5 hours as 1 day.
  const minutes = Math.max(1, Math.round(left / MINUTE_MS));
  if (minutes < 60) return { unit: 'minute', value: minutes };
  const hours = Math.max(1, Math.round(left / HOUR_MS));
  if (hours < 24) return { unit: 'hour', value: hours };
  return { unit: 'day', value: Math.max(1, Math.round(left / DAY_MS)) };
}

export interface NoteDayGroup<T> {
  /** `YYYY-MM-DD` of the day in the household's zone. */
  day: string;
  notes: T[];
}

/**
 * The Timeline view's groups: notes by the household day they were posted,
 * newest day first, newest note first inside a day. `dayOf` maps an ISO
 * instant to the household's `YYYY-MM-DD` (the caller supplies it so this
 * file stays free of the time zone helpers).
 */
export function groupByDay<T extends Pick<Note, 'createdAt'>>(notes: readonly T[], dayOf: (iso: string) => string): NoteDayGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const note of sortByTime(notes)) {
    const day = dayOf(note.createdAt);
    const list = groups.get(day);
    if (list) list.push(note);
    else groups.set(day, [note]);
  }
  return [...groups.entries()].map(([day, list]) => ({ day, notes: list }));
}

/**
 * The views that bring their own surface, ink and typeface and so own the
 * card's Background, Text colour, Border and Font controls (the editor hides
 * them, the style matrix never probes them, the module overrides them the
 * way the Sticky Note module does for its paper).
 */
export const NOTES_MATERIAL_VIEWS: ReadonlySet<string> = new Set([
  'chalkboard', 'letterboard', 'whiteboard', 'fridge', 'notebook', 'receipt', 'neon', 'headline',
]);

export function isMaterialView(view: unknown): boolean {
  return typeof view === 'string' && NOTES_MATERIAL_VIEWS.has(view);
}
