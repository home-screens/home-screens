/**
 * The whole layout brain of the School Timetable module, as pure functions.
 *
 * A week card is a lot of small decisions: which periods get a row, which
 * afternoon is worth folding away, which day is lit, how wide that day is, and
 * which of the three treatments each cell gets. All of them are made here, so
 * the React component renders a `TimetableCardModel` straight out and decides
 * nothing itself: every row, every cell, every grid span and every flag is
 * settled before the component sees it.
 *
 * Two rules shape the API:
 *
 * - **No words.** The model carries data and booleans, never sentences. "free",
 *   "lunch", "home at 13:15" and "room 204" are composed by the component in
 *   the display's language. Times, room codes, subject names and care names are
 *   user data and do come through as-is.
 * - **No clocks.** Every function that needs the date takes `now` and the
 *   display's IANA time zone, so a Pi whose OS is stuck on UTC still turns the
 *   right page, and so the tests can stand anywhere in the year.
 *
 * And one rule about width and height, which is the whole of what the card
 * gets wrong when it gets anything wrong:
 *
 * - **Every piece of furniture is measured, and everything has a shorter
 *   form.** The pill on the lit day, the child's name, the care band, the
 *   going-home line, the A/B footnote, the break labels, the folded
 *   afternoon's time, the course badge: each of them takes part in the budget
 *   for the box it sits in, and each has a ladder of forms it sheds down
 *   before an `overflow: hidden` decides for it. They are all held to pixel
 *   floors so they stay legible on a five-across card, and those floors are
 *   capped at the card's own size so they can never out-grow the lessons they
 *   annotate. Being wrong about a width has to cost a word, a line break or a
 *   whole line, and never a letter or a digit: "Do 1" on Thursday the 10th and
 *   "s 16:0" for a pick-up at 16:00 are not small text, they are wrong text.
 */

import type { TimeFormat, TimetableDetail } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import type {
  DayKey,
  Timetable,
  TimetableCell,
  TimetableSchool,
  TimetableSlot,
  TimetableSubject,
  WeekLetter,
} from '@/types/timetables';
import { DAY_KEYS } from '@/types/timetables';
import { initialsOf } from '@/lib/calendar-people';
import { parseTimeToMinutes } from '@/lib/sleep-timeline';
import { isoDateInTZ, toTZWallTime } from '@/lib/timezone';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** A period starting at or after this reads as afternoon and can be folded away. */
export const AFTERNOON_FOLD_FROM = '13:00';

/**
 * Fold the afternoon only when it is this sparse. Three or more busy afternoons
 * are a real part of the week and get their own rows, which is why the sixth
 * former's card runs to period 10 while his siblings stop at 6.
 */
export const AFTERNOON_FOLD_MAX_DAYS = 2;

/**
 * How much wider the focus column is than a quiet one, before the card's own
 * width has a say. Less shows bare codes in the quiet columns so the focus
 * column can take more than twice their width; from Some upwards the quiet
 * columns carry full names themselves and the gap narrows.
 */
const FOCUS_RATIO_BY_DETAIL: Record<TimetableDetail, number> = {
  less: 2.25,
  some: 1.55,
  more: 1.45,
};

/** Below this a quiet column cannot hold its own label, so the focus column stops taking width. */
const QUIET_COLUMN_MIN_EM: Record<TimetableDetail, number> = {
  less: 2.2,
  some: 3.4,
  more: 3.4,
};

/** A focus column narrower than this cannot fit a subject name, so it falls back to codes. */
const RICH_FOCUS_MIN_EM = 5.5;

/** Under this the focus column is not worth a different treatment at all. */
const WIDE_FOCUS_MIN_RATIO = 1.2;

/** A focus column that only holds a code needs a nudge of extra width, not a doubling. */
const QUIET_FOCUS_MAX_RATIO = 1.3;

/** Quiet columns tighter than this drop their decorations: chips, course badges, long codes. */
const NARROW_QUIET_EM = 2.4;

/**
 * How wide a subject code is, in em of the size it is drawn at.
 *
 * Codes are Titlecase and drawn bold, so they run wider per character than a
 * name does: "WiPo" is about 2.4em where four lowercase letters are 2.0. The
 * bound sits above the plain one on purpose, because a code that steps down a
 * size loses nothing and a code cut at both ends is unreadable.
 */
const CODE_WIDTH = { perChar: 0.6, plus: 0.15 } as const;

/**
 * The sizes a code may be drawn at, as a fraction of the card's own, largest
 * first.
 *
 * A code is one short word with nothing shorter behind it: there is no second
 * line to break onto and no shorter form to fall back to, so the only thing
 * left is to draw it smaller. Steps rather than a fitted fraction, so a column
 * of codes has at most a couple of sizes in it instead of one per word, and a
 * floor at two thirds, under which a code stops being worth drawing at all.
 */
const CODE_STEPS = [1, 0.85, 0.72, 0.62] as const;

/** Width of the period gutter, in em of the card's base size. Times take a wider one. */
const GUTTER_EM = { start: 2.3, range: 2.6 } as const;

/** Breathing room between the gutter's times and the first day column. */
const GUTTER_PAD_PX = 3;

/**
 * The most of the card the gutter may take before the times inside it have to
 * give way instead. A 12-hour clock writes "12:45 PM" where a 24-hour one
 * writes "12:45", and on a five-across card that is worth more width than the
 * day columns can spare.
 */
const GUTTER_MAX_SHARE = 0.28;

/** Small print never goes under this, whatever the gutter has room for. */
const GUTTER_MIN_TIME_PX = 10;

/**
 * The gutter's own line height, and the gaps above its two times. The stack
 * has to fit the row it sits in: a gutter taller than its row loses the period
 * number, which is the one thing in it a reader cannot work out for themselves.
 */
const GUTTER_LINE = 1.02;
const GUTTER_TIME_GAP = { start: 0.12, end: 0.02 } as const;

/** What column one shows under a period number: both times, the start, or neither. */
export type GutterTimes = 'range' | 'start' | 'none';

/** Card padding in CSS pixels. */
const CARD_PADDING_PX = 16;

/**
 * The gap between day columns, in CSS pixels. A tight card gives some of it
 * back to the columns, which is why there are two: the card is drawn with
 * whichever of them its own metrics report, so the width a cell is measured
 * against is the width it is drawn in.
 */
export const COLUMN_GAP_PX = { normal: 6, narrow: 4 } as const;

/**
 * How much of the card's height one line of type is, and how many em of width
 * the card wants for a gutter and five day columns, per Detail setting.
 *
 * Between them they are the card's taste. A card that is wide and short has
 * height to spare and width to fill; a tall narrow one the other way round.
 * Taking the middle of the two keeps five columns legible on both shapes,
 * which a height-only rule cannot: five cards across a television would each
 * draw type twice as wide as their column.
 *
 * They only ever say what the card would LIKE. What it may actually have is
 * settled against its own rows and cells in `cardBaseFontSize`.
 */
const HEIGHT_SHARE: Record<TimetableDetail, number> = { less: 0.032, some: 0.03, more: 0.028 };
const WIDTH_EM: Record<TimetableDetail, number> = { less: 22, some: 26, more: 29 };

/**
 * The row tracks that are a fixed height rather than a share of what is left,
 * in em, and the share a folded afternoon gets of a full row. `WeekCard` draws
 * the grid from these, and the height budget divides the card up by them, so
 * the two cannot drift apart.
 *
 * They are a floor rather than the answer: the labels inside them have pixel
 * floors of their own, and an em track is shorter than a floored label below a
 * base of about 19px. `bandTrackPx` is what both sides use.
 */
export const ROW_TRACK_EM = { break: 0.8, care: 1.45 } as const;
export const FOLD_ROW_FR = 0.9;
export const ROW_GAP_PX = 5;

/**
 * The card's own furniture: the line with the person's name on it, the row of
 * day names inside the grid, and the packing footer under it. Measured off the
 * rendered card, in em of its base size, with the pixel floors the small print
 * is held to: on a five-across card it is the floor that decides the height,
 * not the em.
 */
const CARD_HEADER_EM = 2.3;
export const DAY_ROW = { em: 0.72, px: 17, lines: 1.7, padEm: 0.3 };
export const FOOTER_ROW = { em: 0.66, px: 17, lines: 2.1, gapEm: 0.55 };

/**
 * The header row above the grid, in em of the card's base size: the initials
 * dot and its gap, the name's own size, and the gap before anything after it.
 *
 * The row is one flex line holding the name and a sentence about the day, and
 * flexbox splits a shortfall between them, so on a five-across card both lost
 * text at once and five cards carried five single initials. The row is
 * measured here instead, and the sentence sheds words.
 */
const HEADER_ROW = { dotEm: 1.7 * 0.88, gapEm: 0.42, nameEm: 1.25, classEm: 0.72, badgeEm: 0.7, nameShare: 0.6 };

/** The pill around the lit day's name: horizontal padding, and the gap inside it. */
const PILL = { pad: 1.24, tightPad: 0.6, gapEm: 0.25 };

/**
 * The heading above the cards: its size as a multiple of a card's own, its
 * line box and the gap under it in em of itself, and the most of the module's
 * height the whole band may take.
 *
 * It used to be a flat 16px on every canvas, because it fell back to the Style
 * panel's pixel size, so at 4K it was 16px over cards drawn at 53px and on a
 * 420x300 box a long heading wrapped to two lines, took a fifth of the module
 * and left the cards 7px. It is drawn at the size a card's own name is drawn
 * at instead, so the heading and the row of names below it read as one
 * hierarchy, and it is one line: a heading is a line above the cards, and it
 * was the second line that cost a small box a fifth of its height.
 */
const HEADING = { em: 1.25, line: 1.5, padEm: 0.5, maxShare: 0.12 };

/**
 * Rounds the heading takes to settle.
 *
 * The band it asks for is height the cards do not get, and the cards are what
 * its size comes from, so the two chase each other. They converge fast: the
 * band is at most an eighth of the box and a card's size goes as the square
 * root of its height, so each round moves the answer by about a fifteenth of
 * the last one. Whole pixels, so it stops moving rather than settling on a
 * jitter below the eye that would make two screenshots of one wall differ.
 */
const HEADING_ROUNDS = 3;

/** The gap the module leaves between its cards, in CSS pixels. */
export const CARD_GAP_PX = 20;

/** The gap between a quiet day's name and its date. */
const DAY_GAP_EM = 0.35;

/**
 * A little more than the estimate, for the day header only, in em of the size
 * it is drawn at.
 *
 * The header is drawn at weight 650 and its date in tabular figures, both a
 * shade wider per character than the bound the rest of the card is measured
 * with. Without this, "Fr 11" came out one or two pixels past its column, and
 * two pixels of a day number is a digit.
 */
const DAY_HEAD_SLACK_EM = 0.2;

/** What the header row draws: how much of the day line, and which chips. */
interface HeaderForm {
  /** The day line: with the care clause, whole, times only, or nothing. */
  meta: 'care' | 'full' | 'compact' | 'none';
  className: boolean;
  badge: boolean;
}

/** What a day header draws: the pieces it kept, in the column it has. */
interface DayHead {
  pill: 'full' | 'tight' | 'none';
  showDate: boolean;
  showMonth: boolean;
  word: boolean;
}

/** The " · " the day line hangs its care clause off. */
const SEPARATOR_CHARS = 3;

/**
 * What a cell is made of, in em of the card's base size.
 *
 * `CARD_TEXT` is shared with the cells themselves so the height a card budgets
 * for a line is the height that line is drawn at. The rest mirrors the boxes in
 * `cells.tsx`: the line height inside a cell, the smaller type a subject name
 * takes in a quiet column, and the padding the lit column's name sits inside.
 *
 * The budget counts lines, never the padding above and below them: a cell
 * centres what it holds, so that padding is breathing room it gives back
 * before a single word is lost. `RICH_PAD_EM` is the other axis and is real
 * width, which is why it does count against the name beside it.
 */
const CELL_LINE = 1.08;
/** A subject name in a quiet column is drawn a size down from the card's own. */
const NAME_SIZE_EM = 0.8;
const NAME_LINE_EM = NAME_SIZE_EM * 1.06;

/** A quiet cell's own horizontal padding, in em of the card, tight card or not. */
const QUIET_CELL_PAD_EM = { normal: 0.18 * 2, narrow: 0.03 * 2 } as const;

/** The care cell's indent on the day it names the care, in em of its own type. */
const CARE_NAME_PAD_EM = 0.6;
const RICH_PAD_EM = 0.9;
const RICH_ICON_EM = 1.14;

/**
 * A quiet cell's subject picture, in em of the card: the icon box and the gap
 * under it, which is measured in em of that box's own smaller type.
 */
const QUIET_ICON_EM = 0.78 * (1 + 0.14);

export const CARD_TEXT = {
  /** The room and the times under a name in the lit column, and in the gutter. */
  detail: { em: 0.6, px: 16, gapEm: 0.1 },
  /** The room under a name in a quiet column, and the folded row's start time. */
  room: { em: 0.56, px: 15, gapEm: 0.12 },
  /** What to pack, on a chip under a lit lesson. */
  chip: { em: 0.58, px: 16, gapEm: 0.24, lines: 1.6 },
  /** The break and care band labels, in the gutter. */
  band: { em: 0.55, px: 15 },
  /** The after-school care band's own cells. */
  care: { em: 0.6, px: 16 },
  /** The going-home line under the lit column's last lesson. */
  tail: { em: 0.6, px: 16 },
  /** The line at the top right of the card: when this day starts and ends. */
  meta: { em: 0.68, px: 17 },
  /** The school-holiday sentence, on its own line under the name. */
  holiday: { em: 0.72, px: 17 },
  /** "not until 08:40", under a first-period gap. */
  late: { em: 0.6, px: 16 },
  /** The course group badge beside a subject name. */
  badge: { em: 0.5, px: 15 },
  /** The A/B footnote in the footer. */
  legend: { em: 0.62, px: 16 },
} as const;

/**
 * How wide text is, in em of the size it is drawn at.
 *
 * A card has to know whether a subject name fits its column before anything
 * has been drawn, and a pure function cannot measure text. These are upper
 * bounds for mixed-case Latin text in the card's face, taken from the names a
 * school week actually uses and rounded up, so a name that is really narrower
 * only ever gets more room than it needs. Being wrong here costs a line break,
 * never a letter.
 */
const NAME_WIDTH = { perChar: 0.5, plus: 0.8 };

/**
 * How wide a clock time is, in em, and the one estimate here that has to be an
 * over-estimate rather than a good guess: the gutter is built to this number,
 * and a time wider than its gutter is painted straight across the first lesson
 * of every row.
 *
 * Measured at weight 400 with tabular figures across every face the Font
 * control offers, over the widest time each format can produce ("12:45 PM",
 * "12:45"). The widest was System Mono at 4.816em and 3.010em, which the old
 * 4.8 and 2.9 did not cover: a household on either mono font overflowed on
 * every row. A tenth on top covers a face the registry does not ship and the
 * substitutions a Pi's fontconfig makes for one it cannot find.
 */
const TIME_WIDTH_EM: Record<TimeFormat, number> = { '24h': 3.3, '12h': 5.3 };

/**
 * How wide a clock time is for the furniture around the grid, in em.
 *
 * The gutter's budget above carries a tenth over the widest face on purpose,
 * because a gutter built too narrow paints its times across the first lesson
 * of every row. Every other time on the card is clipped with an ellipsis
 * instead, so those are measured against the widest face itself: a tenth of
 * slack there is the difference between a card showing a 16:00 pick-up and a
 * card showing nothing at all.
 */
const TIME_FIT_EM: Record<TimeFormat, number> = { '24h': 3.01, '12h': 4.82 };

/**
 * How long the words the component wraps a value in are, in characters, and
 * how long the strings it composes come out.
 *
 * "Ends at 13:15", "Room 204" and "Today Thu 10." are sentences the card has
 * to leave room for and cannot read: they are composed at render time in the
 * display's language, where "Today" runs from three characters to eleven and a
 * date may name its month. The component hands their lengths down in `words`;
 * these are the en-US lengths, used when it has not.
 */
export interface TimetableWords {
  /** "Ends at ", around the going-home time. */
  endCap: number;
  /** "Room ", before a room code. */
  room: number;
  /** The care clause with the name in it, and without: " until " / "until ". */
  careFull: number;
  careShort: number;
  /** "not until ", before the time school starts on a late morning. */
  lateStart: number;
  /** What joins the two ends of the day line: " to ", " bis ". */
  timeRange: number;
  /** The word before the lit day: "Today", or the day's own name. */
  focusWord: number;
  /**
   * The widest day header this week prints: the short weekday on its own, the
   * bare day of the month beside it, and the two together where the week
   * crosses a month and the header has to name it. The gaps between the pieces
   * are the card's own and are added where they are used, not counted here.
   */
  dayName: number;
  dayNumber: number;
  dayHead: number;
  /**
   * The three forms of the school-holiday line: the whole sentence with the
   * long date, the whole sentence with a short one, and the two facts on their
   * own, with no sentence around them.
   */
  holidayFull: number;
  holidayShort: number;
  holidayBrief: number;
}

const DEFAULT_WORDS: TimetableWords = {
  endCap: 'Ends at '.length,
  room: 'Room '.length,
  careFull: ' until '.length,
  careShort: 'until '.length,
  lateStart: 'not until '.length,
  timeRange: ' to '.length,
  focusWord: 'Today'.length,
  dayName: 'Th'.length,
  dayNumber: '10'.length,
  dayHead: 'ThOct 1'.length,
  holidayFull: 'Autumn Holidays, back to school on Monday, November 2'.length,
  holidayShort: 'Autumn Holidays, back to school on Nov 2'.length,
  holidayBrief: 'Autumn Holidays, back Nov 2'.length,
};

/**
 * The course badge's own margin and padding, in em of the card's base size.
 * Its padding is in em of the badge's own smaller type, which is where the
 * halving comes from.
 */
const BADGE_FURNITURE_EM = 0.25 + 0.35 * 2 * CARD_TEXT.badge.em;

/**
 * The end cap's furniture, in em of the size it is drawn at: the house, the gap
 * beside it, and the padding either side of the whole line.
 */
const END_CAP_FURNITURE_EM = 1 + 0.3 + 0.45 * 2;

/** The same line with the house taken off it, which is the last rung but one. */
const END_CAP_BARE_EM = 0.45 * 2;

/** Lines a quiet column's label may take: a code stays on one, a name wraps. */
const QUIET_LABEL_LINES: Record<TimetableDetail, number> = { less: 1, some: 2, more: 2 };

/**
 * The fewest lines a folded afternoon's label ever gets: its row always has
 * room for one, whatever else is in it.
 */
const FOLD_LABEL_LINES = 1;

/** The gap between two lessons sharing one folded row, in em of the card. */
export const FOLD_GAP_EM = 0.15;

/** The name length a card assumes when nobody has told it what it is printing. */
const REFERENCE_LABEL_CHARS = 10;

/** Nothing is drawn smaller than this, however little room there is. */
const MIN_BASE_PX = 6;

/** Rounds of halving the size search takes; the bracket is exact long before. */
const FIT_STEPS = 16;

// ---------------------------------------------------------------------------
// Calendar arithmetic
// ---------------------------------------------------------------------------

/**
 * Dates move around as 'YYYY-MM-DD' strings and the arithmetic runs in UTC, so
 * no clock change in the host or the display zone can ever add or drop a day.
 * The one place a real instant is read is `toTZWallTime`, which shifts it to
 * the display's wall clock first.
 */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function utcOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoOf(utcMs: number): string {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const DAY_MS = 86_400_000;

/** `isoDate` shifted by whole days. Negative counts move backwards. */
export function addDays(isoDate: string, days: number): string {
  return isoOf(utcOf(isoDate) + days * DAY_MS);
}

/** 0 = Sunday through 6 = Saturday. */
function weekdayOf(isoDate: string): number {
  return new Date(utcOf(isoDate)).getUTCDay();
}

/** The day column this date belongs in, or null at the weekend. */
export function dayKeyOf(isoDate: string): DayKey | null {
  const index = weekdayOf(isoDate);
  return index >= 1 && index <= 5 ? DAY_KEYS[index - 1] : null;
}

/** The Monday of this date's week. Saturday and Sunday belong to the week that just ended. */
export function mondayOf(isoDate: string): string {
  const index = weekdayOf(isoDate);
  return addDays(isoDate, index === 0 ? -6 : 1 - index);
}

/**
 * The ISO 8601 week number: weeks start on Monday and week 1 is the one holding
 * the first Thursday of the year. This is the number German schools print as
 * "KW 37", and the A/B cycle is read straight off its parity.
 */
export function isoWeekNumber(isoDate: string): number {
  const thursday = new Date(utcOf(isoDate));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** The display's calendar date for an instant, as 'YYYY-MM-DD'. */
export function dateInZone(now: Date, timeZone?: string): string {
  return isoDateInTZ(now, timeZone);
}

/** Minutes past midnight on the display's clock. */
export function minutesInZone(now: Date, timeZone?: string): number {
  const wall = toTZWallTime(now, timeZone);
  return wall.getHours() * 60 + wall.getMinutes();
}

// ---------------------------------------------------------------------------
// A and B weeks
// ---------------------------------------------------------------------------

/** Which of the school's two week plans a date falls in. */
export function weekLetterOn(school: TimetableSchool, isoDate: string): WeekLetter {
  if (school.weekCycle.mode !== 'parity') return 'A';
  const odd = isoWeekNumber(isoDate) % 2 === 1;
  const oddLetter = school.weekCycle.oddWeek;
  if (odd) return oddLetter;
  return oddLetter === 'A' ? 'B' : 'A';
}

/**
 * The week letter for an instant, read on the display's clock.
 *
 * Parity is the whole rule, so the alternation is not guaranteed to hold across
 * a new year: 2026 has 53 ISO weeks, and week 53 and the following week 1 are
 * both odd. Schools that publish their own week list are the reason
 * `weekCycle` is a union rather than a boolean.
 */
export function weekLetter(school: TimetableSchool, now: Date, timeZone?: string): WeekLetter {
  return weekLetterOn(school, dateInZone(now, timeZone));
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** One row of the card's grid, top to bottom. */
export type TimetableRow =
  | { kind: 'period'; n: number; start: string; end: string }
  | { kind: 'break'; label: string }
  /** Every period past the fold, drawn as one short row. */
  /** A folded afternoon. The start time goes where its short row cannot hold it. */
  | { kind: 'fold'; periods: number[]; start?: string }
  /** After-school care, always the bottom row. */
  | { kind: 'care'; label: string };

export interface BuiltRows {
  rows: TimetableRow[];
  /** The last period drawn on its own row, or null when nothing is folded. */
  foldAfter: number | null;
}

type PeriodSlot = Extract<TimetableSlot, { kind: 'period' }>;

function periodSlots(school: TimetableSchool): PeriodSlot[] {
  return school.slots.filter((s): s is PeriodSlot => s.kind === 'period');
}

/** Every week this person actually has. B is optional and most people do not need one. */
function weeksOf(timetable: Timetable) {
  return timetable.weeks.B ? [timetable.weeks.A, timetable.weeks.B] : [timetable.weeks.A];
}

function cellAt(timetable: Timetable, week: WeekLetter, day: DayKey, period: number): TimetableCell | undefined {
  const plan = (week === 'B' ? timetable.weeks.B : undefined) ?? timetable.weeks.A;
  return plan[day]?.[period];
}

function isLesson(cell: TimetableCell | undefined): cell is { subjectId: string; room?: string; course?: string } {
  return !!cell && !('lunch' in cell);
}

/**
 * The highest period this person uses in either week, counting lunch.
 *
 * Lunch counts because an empty tray row still has to be drawn between the
 * morning and the afternoon; only a genuinely unused period is trimmed away.
 */
function lastUsedPeriod(timetable: Timetable): number {
  let last = 0;
  for (const week of weeksOf(timetable)) {
    for (const day of DAY_KEYS) {
      for (const key of Object.keys(week[day] ?? {})) {
        const n = Number(key);
        if (Number.isFinite(n) && n > last) last = n;
      }
    }
  }
  return last;
}

/** Which days carry a lesson in each period, across both weeks. Lunch does not count. */
function lessonDaysByPeriod(timetable: Timetable): Map<number, Set<DayKey>> {
  const byPeriod = new Map<number, Set<DayKey>>();
  for (const week of weeksOf(timetable)) {
    for (const day of DAY_KEYS) {
      for (const [key, cell] of Object.entries(week[day] ?? {})) {
        if (!isLesson(cell)) continue;
        const n = Number(key);
        if (!Number.isFinite(n)) continue;
        const days = byPeriod.get(n) ?? new Set<DayKey>();
        days.add(day);
        byPeriod.set(n, days);
      }
    }
  }
  return byPeriod;
}

/**
 * Whether this week has a lesson in it anywhere.
 *
 * Pressing Add in the editor saves a timetable with a school, a class and
 * nothing else, and autosaves it, so the first thing a household ever sees
 * from this feature is a week nobody has filled in. That is not a holiday and
 * not a mistake, and the card says so in words rather than drawing an empty
 * grid with the day names pinned to its bottom edge.
 */
export function hasLessons(timetable: Timetable): boolean {
  return lessonDaysByPeriod(timetable).size > 0;
}

/**
 * Where the afternoon fold goes, or null when the week does not want one.
 *
 * The run being folded is the trailing stretch of afternoon periods, so a gap
 * in the middle of the day is never swallowed. It folds only when that stretch
 * is nearly empty: a card that shows five all-but-blank rows so one violin
 * lesson can sit in the last of them wastes half its height, while a week with
 * lessons on three afternoons is simply a long week and deserves the rows.
 */
function findFoldAfter(periods: PeriodSlot[], timetable: Timetable): number | null {
  const threshold = parseTimeToMinutes(AFTERNOON_FOLD_FROM);
  if (threshold === null) return null;

  let first = periods.length;
  while (first > 0) {
    const start = parseTimeToMinutes(periods[first - 1].start);
    if (start === null || start < threshold) break;
    first--;
  }
  // Nothing late, or nothing but late: there is no morning left to fold under.
  if (first === 0 || first === periods.length) return null;

  const byPeriod = lessonDaysByPeriod(timetable);
  const busyDays = new Set<DayKey>();
  for (let i = first; i < periods.length; i++) {
    for (const day of byPeriod.get(periods[i].n) ?? []) busyDays.add(day);
  }
  if (busyDays.size === 0 || busyDays.size > AFTERNOON_FOLD_MAX_DAYS) return null;

  return periods[first - 1].n;
}

/**
 * The card's rows: the periods this person uses, the named breaks between them,
 * a folded afternoon when the week earns one, and a care band at the bottom.
 *
 * The rows are the same in an A week and a B week on purpose. Both weeks use
 * the same bell schedule and the card must not reshape itself when the letter
 * flips, so the period range and the fold are decided across both plans at once.
 */
export function buildRows(
  timetable: Timetable,
  school: TimetableSchool,
  detail: TimetableDetail,
): BuiltRows {
  const maxPeriod = lastUsedPeriod(timetable);
  const used = periodSlots(school).filter((p) => p.n <= maxPeriod);
  const foldAfter = findFoldAfter(used, timetable);

  // Slots in bell order, keeping every break between the periods that survive.
  let rows: TimetableRow[] = [];
  for (const slot of school.slots) {
    if (slot.kind === 'break') {
      rows.push({ kind: 'break', label: slot.label });
    } else if (slot.n <= maxPeriod && (foldAfter === null || slot.n <= foldAfter)) {
      rows.push({ kind: 'period', n: slot.n, start: slot.start, end: slot.end });
    }
  }
  while (rows.length && rows[rows.length - 1].kind === 'break') rows.pop();

  if (foldAfter !== null) {
    const folded = used.filter((p) => p.n > foldAfter);
    if (folded.length) rows.push({ kind: 'fold', periods: folded.map((p) => p.n), start: folded[0].start });
  }

  // Two breaks back to back are one band on the wall. More has room to name both.
  const merged: TimetableRow[] = [];
  for (const row of rows) {
    const prev = merged[merged.length - 1];
    if (row.kind === 'break' && prev?.kind === 'break') {
      if (detail === 'more') prev.label = `${prev.label} · ${row.label}`;
      continue;
    }
    merged.push(row);
  }
  rows = merged;

  if (detail === 'more' && school.care) rows.push({ kind: 'care', label: school.care.name });

  return { rows, foldAfter };
}

// ---------------------------------------------------------------------------
// Day blocks
// ---------------------------------------------------------------------------

/**
 * Why a period is not happening: the day is cut short by a dated exception at
 * the school, or the lesson was cancelled by a note on the timetable.
 */
export type OffReason = 'short' | 'cancelled';

export interface LessonBlock {
  kind: 'lesson';
  periods: number[];
  start: string;
  end: string;
  subject: TimetableSubject;
  course?: string;
  room?: string;
  /** The same subject twice in a row, drawn as one tall block. */
  double: boolean;
  /** Not happening today. Drawn faded, and never counted towards the day's start or end. */
  off?: OffReason;
}

export type TimetableBlock =
  | LessonBlock
  | { kind: 'free'; periods: number[]; start: string; end: string; off?: OffReason }
  | { kind: 'lunch'; periods: number[]; start: string; end: string; off?: OffReason }
  | { kind: 'care'; label: string; start: string; end: string };

/** What the notes on a timetable say about one date. */
export interface DayNotes {
  /** The subjects with a test that day, each with the name the note gave it, if any. */
  tests: Map<string, string | undefined>;
  /** One-off things to bring, in the order they were written. */
  bring: string[];
  /** The periods that are off. */
  cancelled: Set<number>;
}

/** The notes a timetable carries for one date, read into the three things the wall draws. */
export function notesOn(timetable: Timetable, date: string): DayNotes {
  const out: DayNotes = { tests: new Map(), bring: [], cancelled: new Set() };
  for (const note of timetable.notes ?? []) {
    if (note.date !== date) continue;
    if (note.kind === 'test' && note.subjectId) {
      if (!out.tests.has(note.subjectId) || note.text) out.tests.set(note.subjectId, note.text);
    } else if (note.kind === 'bring' && note.text) {
      out.bring.push(note.text);
    } else if (note.kind === 'cancelled') {
      for (const n of note.periods ?? []) out.cancelled.add(n);
    }
  }
  return out;
}

/** Whether a date has any note on it at all. */
export function hasNotes(notes: DayNotes): boolean {
  return notes.tests.size > 0 || notes.bring.length > 0 || notes.cancelled.size > 0;
}

type BlockOrBreak = TimetableBlock | { kind: 'break' };

/**
 * One day as time-ordered blocks.
 *
 * Back-to-back lessons of the same subject and course become one block, so a
 * double period reads as one lesson rather than the same name twice. Free
 * periods merge the same way. Nothing after the day's last lesson survives, so
 * a week that ends at noon on Friday does not draw four empty afternoon cells.
 *
 * A break is never a cell: the grid draws break bands across the whole card.
 * They still take part here as boundaries, which is what stops a subject either
 * side of the long break from merging into a double.
 */
export function dayBlocks(
  timetable: Timetable,
  school: TimetableSchool,
  subjects: readonly TimetableSubject[],
  day: DayKey,
  week: WeekLetter,
  /**
   * A period the day stops after, so nothing is merged across it.
   *
   * Two lessons in the same subject are drawn as one double. On a day a dated
   * exception cuts short, a double straddling the cut would be one block whose
   * first period still happens, so the whole thing - including the half that
   * does not - was drawn as a lesson going ahead. Splitting at the boundary lets
   * the part that is off be dimmed on its own.
   */
  splitAfterPeriod?: number,
  /** Periods a note says are off that day. Marked `off` and never merged with a period that is on. */
  cancelled?: ReadonlySet<number>,
): TimetableBlock[] {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const offReason = (n: number): OffReason | undefined => {
    if (splitAfterPeriod !== undefined && n > splitAfterPeriod) return 'short';
    if (cancelled?.has(n)) return 'cancelled';
    return undefined;
  };

  let last = 0;
  for (const slot of school.slots) {
    if (slot.kind !== 'period') continue;
    const cell = cellAt(timetable, week, day, slot.n);
    if (isLesson(cell)) last = Math.max(last, slot.n);
  }
  if (last === 0) return [];

  const out: BlockOrBreak[] = [];
  for (const slot of school.slots) {
    if (slot.kind === 'break') {
      out.push({ kind: 'break' });
      continue;
    }
    if (slot.n > last) continue;

    const cell = cellAt(timetable, week, day, slot.n);
    // A subject the catalogue no longer holds reads as a free period. The store
    // keeps the two in step, so this only shows up in a hand-edited file.
    const subject = isLesson(cell) ? byId.get(cell.subjectId) : undefined;

    const off = offReason(slot.n);
    let block: TimetableBlock;
    if (isLesson(cell) && subject) {
      block = {
        kind: 'lesson',
        periods: [slot.n],
        start: slot.start,
        end: slot.end,
        subject,
        course: cell.course,
        room: cell.room ?? timetable.usualRoom,
        double: false,
        ...(off ? { off } : {}),
      };
    } else if (cell && 'lunch' in cell) {
      block = { kind: 'lunch', periods: [slot.n], start: slot.start, end: slot.end, ...(off ? { off } : {}) };
    } else {
      block = { kind: 'free', periods: [slot.n], start: slot.start, end: slot.end, ...(off ? { off } : {}) };
    }

    const prev = out[out.length - 1];
    // A period that is on and one that is off are never one block: a double
    // whose second half is cancelled has to be two cells before the half that
    // is not happening can be dimmed on its own.
    const crossesCut =
      prev !== undefined &&
      prev.kind !== 'break' &&
      prev.kind !== 'care' &&
      prev.off !== block.off;
    if (!crossesCut && prev?.kind === 'free' && block.kind === 'free') {
      prev.periods.push(slot.n);
      prev.end = block.end;
      continue;
    }
    if (
      !crossesCut &&
      prev?.kind === 'lesson' &&
      block.kind === 'lesson' &&
      prev.subject.id === block.subject.id &&
      prev.course === block.course
    ) {
      prev.periods.push(slot.n);
      prev.end = block.end;
      prev.double = true;
      continue;
    }
    out.push(block);
  }

  const blocks = out.filter((b): b is TimetableBlock => b.kind !== 'break');

  const careUntil = school.care?.until[day];
  const dayEnd = blocks[blocks.length - 1]?.end;
  if (school.care && careUntil && dayEnd && careUntil > dayEnd) {
    blocks.push({ kind: 'care', label: school.care.name, start: dayEnd, end: careUntil });
  }
  return blocks;
}

/**
 * When the school's bell for `period` goes, which is when a day cut short after
 * it is over. Null when the school has no such period.
 *
 * Read off the bell schedule rather than off the day's blocks on purpose. Two
 * lessons in the same subject are merged into one double, so a block can
 * straddle the cut - four periods of Mathe with lessons stopping after the
 * second is one block ending at fourth period's bell. Asking the block when it
 * ends gives the wrong answer by two periods; asking the school gives the right
 * one whatever the week happens to look like.
 */
export function periodEndTime(school: TimetableSchool, period: number): string | null {
  let end: string | null = null;
  for (const slot of school.slots) {
    if (slot.kind !== 'period' || slot.n > period) continue;
    if (end === null || slot.end > end) end = slot.end;
  }
  return end;
}

/**
 * What to pack for a day: each subject's `bring` item, in lesson order, once
 * each. The Week footer and the Day view's packing strip both read this, so
 * the two cannot disagree about a bag.
 */
export function bringFor(blocks: readonly TimetableBlock[]): string[] {
  const seen = new Set<string>();
  return blocks
    .filter((b): b is LessonBlock => b.kind === 'lesson' && !b.off)
    .map((b) => b.subject.bring)
    .filter((item): item is string => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

/** When the lessons of a day start and end, ignoring care. Null on a day with none. */
export function daySpan(
  blocks: readonly TimetableBlock[],
): { start: string; end: string; firstPeriod: number } | null {
  // A lesson that is off does not start or end the day: the last lessons
  // cancelled move the end forward, the first ones move the start back.
  const lessons = blocks.filter((b): b is LessonBlock => b.kind === 'lesson' && !b.off);
  if (!lessons.length) return null;
  return {
    start: lessons[0].start,
    end: lessons[lessons.length - 1].end,
    firstPeriod: lessons[0].periods[0],
  };
}

// ---------------------------------------------------------------------------
// Which week and which day the card shows
// ---------------------------------------------------------------------------

/** A stretch of days off, both ends inclusive. */
export interface TimetableHoliday {
  name: string;
  start: string;
  end: string;
}

/** A single day school is shut, such as a public holiday. */
export interface TimetableClosure {
  date: string;
  name: string;
}

/**
 * How the focus day should be named.
 *
 * `today` is the ordinary case. `weekday` names the day ("Monday") because the
 * card has run on to next week. `date` spells the date out, because after a
 * holiday the next school day is far enough away that its name alone would be
 * ambiguous.
 */
export type FocusLabelKind = 'today' | 'weekday' | 'date';

export interface FocusContext {
  school: TimetableSchool;
  /** Used to find the last lesson of the week, which is when the card turns the page. */
  timetable: Timetable;
  /** Needed to read the lessons, so the last one of the week can be found. */
  subjects: readonly TimetableSubject[];
  schoolHolidays?: readonly TimetableHoliday[];
  publicHolidays?: readonly TimetableClosure[];
  /** Turn the page once the school week is over. Omitted = on. */
  nextWeekFromFriday?: boolean;
}

export interface FocusResolution {
  /** Monday of the week the card draws. */
  weekStart: string;
  weekNumber: number;
  weekLetter: WeekLetter;
  focusDay: DayKey;
  focusDate: string;
  focusLabelKind: FocusLabelKind;
  /** The card is showing the week `now` falls in. */
  currentWeek: boolean;
  dayDates: Record<DayKey, string>;
  /** Columns school is shut, each with the name of the day off. */
  closedDays: Partial<Record<DayKey, string>>;
  /** Columns that finish early, with the last period that still happens. */
  shortDays: Partial<Record<DayKey, { label: string; endsAfterPeriod: number }>>;
  /** The notes on each day of the shown week, for the days that have any. */
  notes: Partial<Record<DayKey, DayNotes>>;
  /** Set while the household is in the middle of a school holiday. */
  holiday?: { name: string; backOn: string };
}

export function holidayOn(date: string, ctx: FocusContext): TimetableHoliday | undefined {
  return ctx.schoolHolidays?.find((h) => date >= h.start && date <= h.end);
}

/** The period a dated exception cuts this day short after, when one does. */
export function endsAfterOn(date: string, ctx: FocusContext): number | undefined {
  const short = ctx.school.specialDays.find(
    (day) => day.date === date && day.kind === 'ends-after' && day.period !== undefined,
  );
  return short?.period;
}

/** The name of the day off, when school is shut on this date for any reason. */
export function closureOn(date: string, ctx: FocusContext): string | undefined {
  const special = ctx.school.specialDays.find((d) => d.date === date && d.kind === 'off');
  if (special) return special.label;
  const holiday = holidayOn(date, ctx);
  if (holiday) return holiday.name;
  return ctx.publicHolidays?.find((h) => h.date === date)?.name;
}

/** The first weekday after `date` on which school is actually open. */
function nextSchoolDay(date: string, ctx: FocusContext): string {
  let probe = addDays(date, 1);
  // A year of walking is far past any real holiday; the guard is only here so a
  // household that somehow marks every day off still gets a card.
  for (let i = 0; i < 370; i++) {
    if (dayKeyOf(probe) && !closureOn(probe, ctx)) return probe;
    probe = addDays(probe, 1);
  }
  return date;
}

/** The last day of this week with lessons on it and school open. */
function lastSchoolDayOfWeek(
  weekStart: string,
  week: WeekLetter,
  ctx: FocusContext,
): { day: DayKey; date: string } | null {
  for (let i = DAY_KEYS.length - 1; i >= 0; i--) {
    const day = DAY_KEYS[i];
    const date = addDays(weekStart, i);
    if (closureOn(date, ctx)) continue;
    const blocks = dayBlocks(ctx.timetable, ctx.school, ctx.subjects, day, week, endsAfterOn(date, ctx), notesOn(ctx.timetable, date).cancelled);
    if (daySpan(blocks)) return { day, date };
  }
  return null;
}

/**
 * Which week the card draws and which column is lit.
 *
 * The order of the questions is what makes it read right on the wall. Holidays
 * come first, because during them nothing else about the week matters. Then the
 * weekend, which always looks forward: nobody wants a Saturday screen showing
 * the week that just finished. Then the end of the school week, which turns the
 * page early on Friday afternoon so the evening already shows Monday. Otherwise
 * the card stays on today, even when today is a public holiday, because a
 * dimmed column saying "Ascension Day" is the answer somebody walking past
 * wants.
 */
export function resolveFocus(now: Date, timeZone: string | undefined, ctx: FocusContext): FocusResolution {
  const today = dateInZone(now, timeZone);
  const todayKey = dayKeyOf(today);

  let focusDate: string;
  let labelKind: FocusLabelKind;
  let holiday: { name: string; backOn: string } | undefined;

  const current = holidayOn(today, ctx);
  if (current) {
    focusDate = nextSchoolDay(current.end, ctx);
    labelKind = 'date';
    holiday = { name: current.name, backOn: focusDate };
  } else if (!todayKey) {
    focusDate = addDays(mondayOf(today), 7);
    labelKind = 'weekday';
  } else {
    const thisMonday = mondayOf(today);
    const week = weekLetterOn(ctx.school, thisMonday);
    const last = lastSchoolDayOfWeek(thisMonday, week, ctx);
    // Read with the day's cut and cancellations, so a week whose last lesson
    // is off turns the page when the one before it ends.
    const lastLessons = last
      ? daySpan(dayBlocks(ctx.timetable, ctx.school, ctx.subjects, last.day, week, endsAfterOn(last.date, ctx), notesOn(ctx.timetable, last.date).cancelled))
      : null;
    // A day cut short by a dated exception is over when its last surviving
    // period is. Reading the whole grid's end kept the card on a finished week
    // until the afternoon it was never going to have.
    const endsAfter = last ? endsAfterOn(last.date, ctx) : undefined;
    const cut = endsAfter === undefined ? null : periodEndTime(ctx.school, endsAfter);
    // Whichever comes first: the day's own last lesson, or the bell the
    // exception stops it at.
    const clipped = cut && lastLessons ? (cut < lastLessons.end ? cut : lastLessons.end) : lastLessons?.end;
    const overFor = clipped ? parseTimeToMinutes(clipped) : null;
    const rollOver =
      ctx.nextWeekFromFriday !== false &&
      last?.date === today &&
      overFor !== null &&
      minutesInZone(now, timeZone) >= overFor;

    if (rollOver) {
      focusDate = addDays(thisMonday, 7);
      labelKind = 'weekday';
    } else {
      focusDate = today;
      labelKind = 'today';
    }
  }

  // A week the card jumped to can itself be holiday; skip on to the far side.
  const landed = holidayOn(focusDate, ctx);
  if (landed) {
    focusDate = nextSchoolDay(landed.end, ctx);
    labelKind = 'date';
    holiday = { name: landed.name, backOn: focusDate };
  }

  const weekStart = mondayOf(focusDate);
  const dayDates = {} as Record<DayKey, string>;
  const closedDays: Partial<Record<DayKey, string>> = {};
  const shortDays: Partial<Record<DayKey, { label: string; endsAfterPeriod: number }>> = {};
  const notes: Partial<Record<DayKey, DayNotes>> = {};
  DAY_KEYS.forEach((day, i) => {
    const date = addDays(weekStart, i);
    dayDates[day] = date;
    const closed = closureOn(date, ctx);
    if (closed) closedDays[day] = closed;
    const onDay = notesOn(ctx.timetable, date);
    if (hasNotes(onDay)) notes[day] = onDay;
    const short = ctx.school.specialDays.find(
      (d) => d.date === date && d.kind === 'ends-after' && d.period !== undefined,
    );
    if (short?.period !== undefined) shortDays[day] = { label: short.label, endsAfterPeriod: short.period };
  });

  return {
    weekStart,
    weekNumber: isoWeekNumber(weekStart),
    weekLetter: weekLetterOn(ctx.school, weekStart),
    focusDay: dayKeyOf(focusDate) ?? 'mon',
    focusDate,
    focusLabelKind: labelKind,
    currentWeek: weekStart === mondayOf(today),
    dayDates,
    closedDays,
    shortDays,
    notes,
    holiday,
  };
}

// ---------------------------------------------------------------------------
// Detail presets
// ---------------------------------------------------------------------------

export interface TimetableDetailPreset {
  /** `all` prints full subject names in the quiet columns too, not just codes. */
  names: 'focus' | 'all';
  /** Where a room is printed: nowhere, the focus column only, or every cell. */
  rooms: false | 'focus' | 'all';
  /** The gutter and the focus column show a start time, or a start and an end. */
  times: 'start' | 'range';
  /** Where the packing line goes: a chip on the lesson, or the card footer. */
  pack: 'cell' | 'foot';
  /** The going-home time under the focus column's last lesson. */
  endCap: boolean;
  /** Care gets its own bottom row instead of a clause in the header. */
  careRow: boolean;
  foot: boolean;
  /** The week letter on lessons that change between A and B, plus the footer note. */
  ab: boolean;
  /** The "not until 08:40" line under a late start. */
  late: boolean;
}

/**
 * What each Detail setting turns on.
 *
 * Dated notes (a test flag on a cell, a "tomorrow" pill in the footer) are not
 * in this version, so no preset carries a switch for them yet.
 */
export const TIMETABLE_PRESETS: Record<TimetableDetail, TimetableDetailPreset> = {
  less: { names: 'focus', rooms: false, times: 'start', pack: 'cell', endCap: false, careRow: false, foot: false, ab: false, late: false },
  some: { names: 'all', rooms: 'focus', times: 'start', pack: 'cell', endCap: true, careRow: false, foot: false, ab: false, late: false },
  more: { names: 'all', rooms: 'all', times: 'range', pack: 'foot', endCap: true, careRow: true, foot: true, ab: true, late: true },
};

/**
 * What a card gives up when it is asked to draw bigger than its cells can
 * hold: the room under a name first, then the name itself.
 *
 * Text size and the pixel floor are the household's say over the size the card
 * worked out for itself, and both of them can ask for a size the cells have no
 * height for. Asked for one, the card used to draw it anyway: every cell clips
 * its own contents, so nothing overflowed anywhere the card could see it and
 * the room simply went off the bottom of the cell it belonged to. So the size
 * is honoured and the contents are shed instead, which is the same ladder of
 * shorter forms the rest of the card follows.
 *
 * 0 is what the Detail setting asked for, 1 is that without the rooms, 2 is
 * that with the quiet columns back on the codes the catalogue carries.
 */
export type TimetableShed = 0 | 1 | 2;

/** What the card really prints: its Detail setting, less whatever it has shed. */
export function shedPreset(detail: TimetableDetail, shed: TimetableShed = 0): TimetableDetailPreset {
  const preset = TIMETABLE_PRESETS[detail];
  if (shed >= 2) return { ...preset, rooms: false, names: 'focus' };
  if (shed >= 1) return { ...preset, rooms: false };
  return preset;
}

// ---------------------------------------------------------------------------
// Card geometry
// ---------------------------------------------------------------------------

export interface CardMetricsInput {
  /** Card width in CSS pixels, padding included. */
  cardWidth: number;
  /**
   * Card height in CSS pixels, in the same box the width is measured in.
   * Without it the card has no height to divide and sizes itself on width
   * and taste alone.
   */
  cardHeight?: number;
  /**
   * The card's own font size in pixels; every em below is relative to it.
   * Omitted, the card derives the size its box and its rows can hold.
   */
  baseFontSize?: number;
  detail: TimetableDetail;
  /** Padding on one side of the card. Omitted = the card's usual 16px. */
  padding?: number;
  /** Day columns drawn. Omitted = the five school days. */
  dayCount?: number;
  /** The gutter carries end times too, which makes it wider. */
  showStartTimes?: boolean;
  /** The rows the week has, from `buildRows`: what the card's height goes into. */
  rows?: readonly TimetableRow[];
  /** The longest subject name this card may print, in characters. */
  longestLabelChars?: number;
  /** The longest course badge this card may print beside a name, in characters. */
  courseChars?: number;
  /** The lit column draws each subject's picture beside its name. */
  focusIcon?: boolean;
  /** This person's subjects carry pictures, so a quiet cell draws one too. */
  icons?: boolean;
  /** The footer also says which weeks differ, which usually takes a second line. */
  hasLegend?: boolean;
  /** The household's clock. A 12-hour time is half as wide again. */
  timeFormat: TimeFormat;
  /**
   * What the card has given up to draw at the size it was asked for. Omitted,
   * it has given up nothing, which is the case whenever the card chose its own
   * size.
   */
  shed?: TimetableShed;
}

/** What the card prints at this Detail, less whatever it has shed. */
function presetOf(input: Pick<CardMetricsInput, 'detail' | 'shed'>): TimetableDetailPreset {
  return shedPreset(input.detail, input.shed);
}

// ---------------------------------------------------------------------------
// What the row of cards agrees on
// ---------------------------------------------------------------------------

/**
 * The header row the whole row of cards is measured against: the longest name
 * in it, the longest class, the longest care word, and a week badge if any one
 * of them carries one.
 *
 * Every card settles its day line against this rather than against its own
 * contents, because settling it card by card had five cards of the same size
 * disagreeing: Mia kept "Today 08:15 to 12:45" while Leon beside her showed
 * bare times, on the strength of three characters of name. It is one
 * hypothetical card rather than the worst real one, so a row whose longest
 * name and longest class are on different children can come down a rung
 * earlier than either of them needs. That is the right direction to be wrong
 * in: the point of the row is that it reads as a set.
 */
export interface TimetableRowFacts {
  nameChars: number;
  classChars: number;
  badge: boolean;
  careChars: number;
  /** The lit day's word, which is "Today" on some cards and a weekday on others. */
  focusWordChars: number;
}

export interface TimetableRowCard {
  name: string;
  className?: string;
  /** The school runs A and B weeks, so this card carries a letter badge. */
  parity: boolean;
  care?: string;
  focusWord: string;
}

export function rowFacts(cards: readonly TimetableRowCard[]): TimetableRowFacts {
  const most = (pick: (card: TimetableRowCard) => number): number =>
    cards.reduce((max, card) => Math.max(max, pick(card)), 0);
  return {
    nameChars: most((card) => card.name.length),
    classChars: most((card) => card.className?.length ?? 0),
    badge: cards.some((card) => card.parity),
    careChars: most((card) => card.care?.length ?? 0),
    focusWordChars: most((card) => card.focusWord.length),
  };
}

export interface CardMetrics {
  /** The size the card draws at, in CSS pixels. */
  baseFontSize: number;
  /** The focus column's share of the grid, as a multiple of a quiet column. */
  focusRatio: number;
  /** The focus column is wide enough for the full-name treatment. */
  wideFocus: boolean;
  /** The card is tight: no chips, no course badges, long codes step down. */
  narrow: boolean;
  focusColumnEm: number;
  quietColumnEm: number;
  /** Width the day columns share, in em, after the gutter and the gaps. */
  availableEm: number;
  /** The gap the card draws between its day columns, in CSS pixels. */
  columnGapPx: number;
  /** The card's own width in CSS pixels, its padding already taken off. */
  widthPx: number;
  /** The period gutter, in CSS pixels: as wide as the times it has to hold. */
  gutterPx: number;
  /** The size those times are drawn at, in CSS pixels. */
  gutterTimePx: number;
  /** How many of its times a period row has the height to show. */
  gutterTimes: GutterTimes;
  /**
   * The folded afternoon's row has the height for its start time as well as
   * its period range. It is a short row by design, so on a small card the two
   * together are taller than it is.
   */
  gutterFoldTime: boolean;
  /** Lines the lit column's subject name may take before it is cut. */
  focusLabelLines: number;
  /** Lines a quiet column's label is budgeted for. */
  quietLabelLines: number;
  /**
   * Lines a label is held to when it is drawn, per kind of column.
   *
   * Never fewer than the budget above, and more wherever the cell turned out
   * to have the height: the budget is what the card was sized against, and a
   * card sized by something else (its width, another cell) leaves room a name
   * may as well use. Clamping to the budget alone cut "Sachunterricht" to
   * "Sach-unter..." in a cell with room for the third line.
   *
   * `fold` is the one of the three the card also chooses its words against: a
   * folded afternoon has one short row and nothing shorter to fall back to
   * than its code, so how many lines that row really has is what decides
   * whether the name goes in at all.
   */
  labelClamp: { focus: number; quiet: number; fold: number };
  /** A lit lesson has room under it for a packing chip. */
  packChip: boolean;
  /**
   * The card's box has been measured. Until it has, every column width below is
   * a minimum standing in for a number nobody knows yet, and a decision taken
   * against one of them is a guess rather than a fit.
   */
  measured: boolean;
}

/**
 * How much width a cell in one of the two kinds of column has, in pixels,
 * once the cell's own padding is off.
 *
 * Before the card's box has been measured this is unbounded, so every decision
 * taken against it comes out as the roomiest answer: a card that is about to
 * have the width for a word does not draw one frame without it.
 */
export function cellWidthPx(metrics: CardMetrics, rich: boolean): number {
  if (!metrics.measured) return Infinity;
  const pad = rich ? RICH_PAD_EM : (metrics.narrow ? QUIET_CELL_PAD_EM.narrow : QUIET_CELL_PAD_EM.normal);
  const columnEm = (rich ? metrics.focusColumnEm : metrics.quietColumnEm) - pad;
  return columnEm <= 0 ? Infinity : columnEm * metrics.baseFontSize;
}

/** The year and month of an ISO date, for telling one month from the next. */
function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * A size in em with a pixel floor under it and the card's own size over it,
 * exactly as the card draws it.
 *
 * The floor is there so small print still reads from a few steps away on a
 * five-across card, where an em of the card's type is a couple of pixels. The
 * ceiling is there because a floor with no ceiling took over: on a short card
 * the day names were drawn at their 17px floor beside lessons at 6px, nearly
 * three times the size of the thing they annotate, so the card's least
 * important text was its biggest.
 */
export function smallPrintPx(base: number, size: { em: number; px: number }): number {
  return Math.max(Math.min(size.px, base), size.em * base);
}

/**
 * How wide a subject name is at the size it is drawn, in em of that size. The
 * codes a quiet column prints are not measured here: a code too wide for its
 * column steps down a size instead, which is what `narrow` already does.
 */
function nameWidthEm(chars: number): number {
  return Math.max(1, chars) * NAME_WIDTH.perChar + NAME_WIDTH.plus;
}

/**
 * How wide a subject name is on a line it has no way off, in em of the size it
 * is drawn at.
 *
 * Neither of the other two bounds belongs here, and both were wrong by about
 * three pixels at a wall size, in opposite directions. `nameWidthEm` carries
 * most of a character of slack, which is what a name wants where being wrong
 * costs it a second line: on one line it over-charges, and a 41px folded
 * afternoon printed "Ku" for a "Kunst" that measures 38px. `labelWidthEm`
 * carries none, so a 34px cell passed a "Geige" that measures 36px and lost
 * its tail to an ellipsis. Half the slack is about the difference between this
 * face's widest and its narrowest letter rather than a whole character, which
 * is the error a five-letter name really carries, and it settles both cells
 * the right way round.
 */
function oneLineNameWidthEm(chars: number): number {
  return Math.max(1, chars) * NAME_WIDTH.perChar + NAME_WIDTH.plus / 2;
}

/**
 * How wide a short run of furniture text is, in em of the size it is drawn at.
 *
 * `nameWidthEm` carries most of a character's worth of slack, which is right
 * for a subject name: the cost of being wrong there is a line break. None of
 * the card's furniture has a second line to break onto, so the same slack
 * costs a day its date or a card its pick-up time. These are estimated with
 * the per-character bound and a tenth on top, and every one of them is drawn
 * with an ellipsis so that being wrong still costs one end and never a
 * leading digit.
 */
function labelWidthEm(chars: number): number {
  return Math.max(0, chars) * NAME_WIDTH.perChar + 0.1;
}

/**
 * How wide a word drawn at the header's own weight is, in em of its size.
 *
 * Measured off the rendered day row rather than reasoned about: "Heute" comes
 * to 0.56em a character at weight 700 and "Vandaag" to 0.605, where the
 * tabular digits beside them run 0.44. A bound of its own keeps the "today"
 * word from being dropped on a card that would have held it, and from being
 * kept on one that would not.
 */
function wordWidthEm(chars: number): number {
  return Math.max(0, chars) * 0.62 + 0.1;
}

/**
 * The furniture estimate in pixels, for a component deciding how to draw a
 * label rather than whether it fits at all.
 *
 * The tighter of the two bounds on purpose: it decides whether a compound's
 * own halves fit their column, and answering "no" when they would have fitted
 * hands the name back to the browser's dictionary, which then breaks it into
 * three lines where the seam needed two.
 */
export function estimateTextPx(chars: number, fontPx: number): number {
  return labelWidthEm(chars) * fontPx;
}

/**
 * The height of the break band's row: its em track, or the line box of the
 * label inside it.
 *
 * The label carries a pixel floor and the track an em, and below a base of
 * about 19px the floor is the taller of the two: the band's own name was drawn
 * at 15px inside a 13px track, which the row then centred, shaving the
 * ascenders off "Pause" on every card. The label is drawn with the same
 * leading this counts, so the two cannot drift apart.
 */
export const BAND_LINE = 1.2;

export function bandTrackPx(base: number): number {
  return Math.max(ROW_TRACK_EM.break * base, smallPrintPx(base, CARD_TEXT.band) * BAND_LINE);
}

/** The height of the care band's row, which holds a time as well as a label. */
export function careTrackPx(base: number): number {
  return Math.max(ROW_TRACK_EM.care * base, smallPrintPx(base, CARD_TEXT.care) * CARE_LINE);
}

/** The care cell's line box, a little over its type so a descender is not shaved. */
const CARE_LINE = 1.25;

/**
 * The gutter, and the times inside it.
 *
 * The times are held to a pixel floor so they still read from a few steps
 * away, which means that on a tight card they stop shrinking while the gutter
 * around them carries on. The gutter widens for them instead: four day columns
 * give up about a pixel each, against a start time clipped on every row of
 * every card. Only when that would cost more than a quarter of the card does
 * the floor give way, and the times step down rather than lose their last
 * digits.
 */
function gutterMetrics(input: CardMetricsInput, base: number, times: GutterTimes): { px: number; timePx: number } {
  const wanted = (times === 'range' ? GUTTER_EM.range : GUTTER_EM.start) * base;
  let timePx = smallPrintPx(base, CARD_TEXT.detail);

  // A folded afternoon carries its start time whatever the setting says, since
  // a row standing for periods 7 to 10 is unreadable without one. With no
  // times on the period rows and nothing folded the gutter holds numbers alone.
  const folded = input.rows?.some((row) => row.kind === 'fold') ?? false;
  if (times === 'none' && !folded) return { px: wanted, timePx };

  // The clock the component formats with, resolved once by the module. A
  // fallback here that disagreed with the component's was a bug: a household
  // that never touched the clock setting drew "12:45 PM" in a gutter budgeted
  // for "12:45", so every row lost its last characters.
  const width = TIME_WIDTH_EM[input.timeFormat];
  let px = Math.max(wanted, timePx * width + GUTTER_PAD_PX);
  const cap = Math.max(wanted, input.cardWidth * GUTTER_MAX_SHARE);
  if (px > cap) {
    px = cap;
    timePx = Math.max(GUTTER_MIN_TIME_PX, (px - GUTTER_PAD_PX) / width);
  }
  return { px, timePx };
}

/**
 * The gutter's own stack for one period row: the number that identifies the
 * row, and the times under it.
 */
function gutterRowPx(base: number, timePx: number, times: GutterTimes): number {
  const number = GUTTER_LINE * base;
  const start = times === 'none' ? 0 : GUTTER_TIME_GAP.start * base + GUTTER_LINE * timePx;
  const end = times === 'range' ? GUTTER_TIME_GAP.end * base + GUTTER_LINE * timePx : 0;
  return number + start + end;
}

/**
 * How much of that stack a row this tall can hold.
 *
 * The times are held to a pixel floor, so on a short card a number and two
 * times come to more than the row they sit in, and the gutter centres them:
 * the number was clipped away entirely while halves of both times survived. A
 * row is identified by its number, so the times give way instead, the end one
 * first.
 */
function gutterFormAt(input: CardMetricsInput, base: number, rowPx: number, timePx: number): GutterTimes {
  const wanted: GutterTimes = input.showStartTimes === false
    ? 'none'
    : presetOf(input).times === 'range' ? 'range' : 'start';
  const ladder: GutterTimes[] = ['range', 'start', 'none'];
  for (const times of ladder.slice(ladder.indexOf(wanted))) {
    if (gutterRowPx(base, timePx, times) <= rowPx) return times;
  }
  return 'none';
}

/** The gutter, its times and how many of them a row of this card can hold. */
function gutterFor(input: CardMetricsInput, base: number, rowPx: number) {
  // Two passes: the times' size can be capped by `GUTTER_MAX_SHARE`, and a
  // smaller time changes how many of them fit the row.
  const wanted = gutterMetrics(input, base, presetOf(input).times === 'range' ? 'range' : 'start');
  const times = gutterFormAt(input, base, rowPx, wanted.timePx);
  return { times, ...gutterMetrics(input, base, times) };
}

/** The day columns, once the gutter and the gaps have taken their share. */
function columnMetrics(input: CardMetricsInput, base: number, gutterPx: number) {
  const days = Math.max(1, input.dayCount ?? DAY_KEYS.length);
  const padding = input.padding ?? CARD_PADDING_PX;

  const share = (gapPx: number) => {
    const gridPx = input.cardWidth - padding * 2 - gutterPx - gapPx * days;
    const availableEm = Math.max(0, gridPx) / base;
    const quietMin = QUIET_COLUMN_MIN_EM[input.detail];
    const affordable = availableEm / quietMin - (days - 1);
    let focusRatio = Math.min(FOCUS_RATIO_BY_DETAIL[input.detail], Math.max(1, affordable));

    let focusColumnEm = (availableEm * focusRatio) / (days - 1 + focusRatio);
    const wideFocus = focusRatio > WIDE_FOCUS_MIN_RATIO && focusColumnEm >= RICH_FOCUS_MIN_EM;
    if (!wideFocus) {
      // A column of codes gains nothing from the extra width, so hand it back
      // to the quiet columns that are already short of it.
      focusRatio = Math.min(focusRatio, QUIET_FOCUS_MAX_RATIO);
      focusColumnEm = (availableEm * focusRatio) / (days - 1 + focusRatio);
    }
    return {
      focusRatio,
      wideFocus,
      focusColumnEm,
      quietColumnEm: availableEm / (days - 1 + focusRatio),
      availableEm,
      columnGapPx: gapPx,
    };
  };

  // A tight card draws narrower gaps between its columns, which is two pixels
  // a column the card had and did not know about: measured against the roomy
  // gap, every cell on a five-across card was told it was narrower than it is,
  // and a folded afternoon 41px wide gave up a name that fits 38px of it.
  //
  // Whether the card is tight is decided on the roomy gap and then left alone.
  // Deciding it again on the narrow one would let a card that is tight at one
  // gap and roomy at the other flip between the two for ever.
  const roomy = share(COLUMN_GAP_PX.normal);
  const narrow = roomy.quietColumnEm < NARROW_QUIET_EM;
  return { ...(narrow ? share(COLUMN_GAP_PX.narrow) : roomy), narrow };
}

/** What the card's rows come to: shares of the height, fixed tracks, and gaps. */
interface RowShape {
  /** Flexible rows as their share: a period is one, a folded afternoon 0.9. */
  units: number;
  /** Rows drawn at a fixed height: a break band, and the care band. */
  breaks: number;
  cares: number;
  /** Gaps between rows, the day-name row included. */
  gaps: number;
  /** The week folds its afternoon into one short row. */
  fold: boolean;
}

function rowShape(rows: readonly TimetableRow[]): RowShape {
  let units = 0;
  let breaks = 0;
  let cares = 0;
  let fold = false;
  for (const row of rows) {
    if (row.kind === 'period') units += 1;
    else if (row.kind === 'fold') { units += FOLD_ROW_FR; fold = true; }
    else if (row.kind === 'break') breaks += 1;
    else cares += 1;
  }
  return { units, breaks, cares, gaps: rows.length, fold };
}

/** The fixed tracks, at the height the labels inside them are really drawn at. */
function fixedRowsPx(shape: RowShape, base: number): number {
  return shape.breaks * bandTrackPx(base) + shape.cares * careTrackPx(base);
}

/** Everything above, below and between the rows, in CSS pixels. */
function chromePx(input: CardMetricsInput, shape: RowShape, base: number): number {
  const footer = presetOf(input).foot
    ? FOOTER_ROW.gapEm * base
      + (input.hasLegend ? 2 : 1) * FOOTER_ROW.lines * smallPrintPx(base, FOOTER_ROW)
    : 0;
  const dayRow = DAY_ROW.lines * smallPrintPx(base, DAY_ROW) + DAY_ROW.padEm * base;
  return CARD_HEADER_EM * base + footer + dayRow + fixedRowsPx(shape, base) + shape.gaps * ROW_GAP_PX;
}

/** The height one share of the grid gets at this size, in CSS pixels. */
function flexRowPx(input: CardMetricsInput, shape: RowShape, base: number): number {
  if (shape.units <= 0) return 0;
  return Math.max(0, (input.cardHeight ?? 0) - chromePx(input, shape, base)) / shape.units;
}

/**
 * Whether a quiet cell and a folded one draw the subject's picture above the
 * name, which is height the cell needs and nobody was counting: a picture that
 * is not in the budget is not clipped, it is drawn entirely outside the cell
 * and is therefore invisible.
 */
function quietIcon(input: CardMetricsInput): boolean {
  const preset = presetOf(input);
  return (input.icons ?? false) || (preset.names === 'all' && input.detail === 'more');
}

function foldedIcon(input: CardMetricsInput): boolean {
  return (input.icons ?? false) && input.detail !== 'less';
}

/** The height a lesson cell needs for what its Detail puts in it. */
function lessonCellPx(
  preset: TimetableDetailPreset,
  base: number,
  rich: boolean,
  labelLines: number,
  icon: boolean,
): number {
  if (rich) {
    const subLines = (preset.rooms ? 1 : 0) + (preset.times === 'range' ? 1 : 0);
    return labelLines * CELL_LINE * base
      + subLines * (CARD_TEXT.detail.gapEm * base + CELL_LINE * smallPrintPx(base, CARD_TEXT.detail));
  }
  const label = preset.names === 'all' ? NAME_LINE_EM * base : CELL_LINE * base;
  const room = preset.rooms === 'all'
    ? CARD_TEXT.room.gapEm * base + CELL_LINE * smallPrintPx(base, CARD_TEXT.room)
    : 0;
  return (icon ? QUIET_ICON_EM * base : 0) + labelLines * label + room;
}

/** The line a folded afternoon's own start time takes under its label. */
function foldTimePx(base: number): number {
  return CARD_TEXT.room.gapEm * base + CELL_LINE * smallPrintPx(base, CARD_TEXT.room);
}

/** The height a folded afternoon needs: its picture, its label and its time. */
function foldedCellPx(preset: TimetableDetailPreset, base: number, icon: boolean): number {
  const label = preset.names === 'all' ? NAME_LINE_EM * base : CELL_LINE * base;
  return (icon ? QUIET_ICON_EM * base : 0) + label + foldTimePx(base);
}

/**
 * Lines a folded afternoon's label may take.
 *
 * It was one, on the grounds that the row is a fraction of a full one and
 * carries a start time as well. The row is nine tenths of a full one, though,
 * and a quiet cell of the same Detail budgets two: a 90px row holding a 14px
 * line was turning "Kunst" into the catalogue code "Ku" in a cell with room
 * for four of them. So the lines are counted, the way every other cell's are,
 * and held to what a quiet cell gets so that a long name cannot draw a folded
 * afternoon as a paragraph.
 */
function foldLabelLines(input: CardMetricsInput, base: number, rowPx: number): number {
  const most = QUIET_LABEL_LINES[input.detail];
  if (!Number.isFinite(rowPx)) return FOLD_LABEL_LINES;
  const line = (presetOf(input).names === 'all' ? NAME_LINE_EM : CELL_LINE) * base;
  if (line <= 0) return FOLD_LABEL_LINES;
  const room = rowPx * FOLD_ROW_FR - foldTimePx(base) - (foldedIcon(input) ? QUIET_ICON_EM * base : 0);
  return Math.max(FOLD_LABEL_LINES, Math.min(most, Math.floor(room / line)));
}

/**
 * How much width one entry of a folded afternoon really has, in CSS pixels.
 *
 * Two lessons on the same afternoon share the row side by side with a gap
 * drawn between them, and an entry carries a quiet cell's own padding whichever
 * column it is in. Measured against a share of the column instead, an entry in
 * the lit column was charged the roomy cell's padding it does not have, and an
 * afternoon with one lesson in it was charged for a gap that is not there.
 */
export function foldEntryWidthPx(metrics: CardMetrics, rich: boolean, entries: number): number {
  if (!metrics.measured) return Infinity;
  const count = Math.max(1, entries);
  const column = rich ? metrics.focusColumnEm : metrics.quietColumnEm;
  const pad = metrics.narrow ? QUIET_CELL_PAD_EM.narrow : QUIET_CELL_PAD_EM.normal;
  const em = (column - FOLD_GAP_EM * (count - 1)) / count - pad;
  return Math.max(0, em * metrics.baseFontSize);
}

/** The height a packing chip adds under a lit lesson. */
function chipPx(base: number): number {
  return CARD_TEXT.chip.gapEm * base + CARD_TEXT.chip.lines * smallPrintPx(base, CARD_TEXT.chip);
}

/** The tallest cell the card draws at this size, with the lit one on `labelLines`. */
function tallestCellPx(
  input: CardMetricsInput,
  base: number,
  wideFocus: boolean,
  labelLines: number,
): number {
  const preset = presetOf(input);
  const quiet = lessonCellPx(preset, base, false, QUIET_LABEL_LINES[input.detail], quietIcon(input));
  return wideFocus
    ? Math.max(quiet, lessonCellPx(preset, base, true, labelLines, false))
    : quiet;
}

/**
 * How much width the lit column's name has to itself, in em of the card.
 *
 * The padding, the subject's picture and the course badge all sit on the same
 * line as the name and all take width off it. The badge was the one nobody
 * counted, so a six-character course code pushed the name onto a line the cell
 * had not budgeted for and the room under it went past the bottom edge.
 */
function richLabelEm(input: CardMetricsInput, base: number, focusColumnEm: number): number {
  const badge = input.courseChars
    ? labelWidthEm(input.courseChars) * (smallPrintPx(base, CARD_TEXT.badge) / base) + BADGE_FURNITURE_EM
    : 0;
  return focusColumnEm - RICH_PAD_EM - (input.focusIcon ? RICH_ICON_EM : 0) - badge;
}

/**
 * Whether a card drawn this big still holds together: every cell inside its
 * row, the folded afternoon inside its short one, and the lit column's longest
 * name inside the lines it is allowed.
 */
function fitsAt(
  input: CardMetricsInput,
  shape: RowShape,
  base: number,
  labelLines: number,
): boolean {
  const row = flexRowPx(input, shape, base);
  if (row <= 0) return false;
  // Column one was never in this test. Its times give way one at a time when
  // the row is short, but the period number cannot: it is what says which row
  // this is, and the gutter centres its column, so a stack taller than its row
  // loses the number first and keeps halves of both times.
  if (gutterRowPx(base, 0, 'none') > row) return false;
  const gutter = gutterFor(input, base, row);
  const columns = columnMetrics(input, base, gutter.px);
  if (columns.wideFocus) {
    const inner = richLabelEm(input, base, columns.focusColumnEm);
    const label = nameWidthEm(input.longestLabelChars ?? REFERENCE_LABEL_CHARS);
    if (label > inner * labelLines) return false;
  }
  if (tallestCellPx(input, base, columns.wideFocus, labelLines) > row) return false;
  if (shape.fold && foldedCellPx(presetOf(input), base, foldedIcon(input)) > row * FOLD_ROW_FR) return false;
  return true;
}

/**
 * The largest size at or below `wanted` that holds together, or 0 for none.
 *
 * `floor` is a size already known to hold, which is what makes the search
 * honest where it is used to climb: whether a card holds together is not quite
 * monotone in its size, because the lit column gives up its roomy treatment
 * at a size where its own name stops fitting, and a bisection from the bottom
 * can land the wrong side of that. Bracketed between a size that holds and one
 * that does not, it cannot.
 */
function largestFitting(
  input: CardMetricsInput,
  shape: RowShape,
  wanted: number,
  labelLines: number,
  floor = MIN_BASE_PX,
): number {
  if (fitsAt(input, shape, wanted, labelLines)) return wanted;
  if (!fitsAt(input, shape, floor, labelLines)) return 0;
  let lo = floor;
  let hi = wanted;
  for (let step = 0; step < FIT_STEPS; step++) {
    const mid = (lo + hi) / 2;
    if (fitsAt(input, shape, mid, labelLines)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The size a card draws itself at.
 *
 * Taste alone (the shape of the box) says what would look right; it has no
 * idea what is going into the box. So the size it asks for is then held
 * against the card's own contents: the rows this week has, the lines each of
 * their cells carries, and the longest subject name the lit column may have to
 * print. Whatever the card cannot hold at the size it wanted, it comes down
 * to the size it can.
 *
 * A name too long for the lit column is the one case with two answers: shrink
 * the whole card until it fits on one line, or give that name a second line
 * and keep the card readable. Both are worked out and the card takes the
 * larger size of the two, which is nearly always the second.
 */
export function cardBaseFontSize(input: CardMetricsInput): number {
  const wanted = tasteFontSize(input);
  const height = Math.max(0, input.cardHeight ?? 0);
  if (wanted <= 0 || !input.rows || height <= 0) return wanted;

  const shape = rowShape(input.rows);
  // A week with no periods in it has no grid to hold together, so there is
  // nothing to hold the shape of the box against. Pressing Add in the editor
  // saves exactly that, and the fit read it as a card that cannot hold six
  // pixels: the first card a household ever sees was drawn at the floor
  // beside a sibling half as big again.
  if (shape.units <= 0) return wanted;

  const onOneLine = largestFitting(input, shape, wanted, 1);
  const onTwo = largestFitting(input, shape, wanted, 2);
  return Math.max(MIN_BASE_PX, onOneLine, onTwo);
}

/**
 * The size the shape of the box alone asks for, before the week in it is
 * counted: taste, with no idea what is going in.
 */
function tasteFontSize(input: Pick<CardMetricsInput, 'cardWidth' | 'cardHeight' | 'detail' | 'padding'>): number {
  const padding = input.padding ?? CARD_PADDING_PX;
  const width = Math.max(0, input.cardWidth - padding * 2);
  const height = Math.max(0, input.cardHeight ?? 0);
  if (width <= 0) return 0;
  return height > 0
    ? Math.sqrt(HEIGHT_SHARE[input.detail] * height * (width / WIDTH_EM[input.detail]))
    : width / WIDTH_EM[input.detail];
}

/**
 * Whether a card drawn this big holds together at all, on either of the line
 * counts the lit column is allowed.
 */
function holdsAt(input: CardMetricsInput, shape: RowShape, base: number): boolean {
  return fitsAt(input, shape, base, 1) || fitsAt(input, shape, base, 2);
}

/**
 * How much a card has to give up to be drawn at the size it was asked for.
 *
 * Text size and the pixel floor both override the size the card worked out for
 * itself, and neither of them knows what is in the cells. Asked for more than
 * the cells can hold the card used to draw it and let every cell clip its own
 * contents, which is invisible to the card and to anybody reading it: the room
 * under a name was simply not there. So it comes down the ladder instead, one
 * rung at a time, and stops at the first rung that holds.
 */
export function shedFor(input: CardMetricsInput, wanted: number): TimetableShed {
  return resolveCardFontSize(input, wanted).shed;
}

/**
 * What the card can actually draw when it is asked for a size.
 *
 * Text size and the pixel floor both ask for one, and the card used to draw
 * whatever it was handed: every cell clips its own contents, so nothing the
 * card could see ever overflowed, and the room under a name simply went off
 * the bottom of the cell. What it does instead is come down the ladder of
 * shorter forms, and only where even the shortest of them will not go in does
 * it decline the size itself and come down to one that holds.
 *
 * Declining matters for more than the cells: a card drawn at a size it cannot
 * hold used to be rescued afterwards by a fit that measured the drawn card and
 * shrank it, one card at a time, which is how five cards in one module ended
 * up at 6.8px, 6.8px, 9.2px, 12.2px and 14.3px. The answer is worked out here
 * instead, before anything is drawn, so the whole row can share it.
 */
export function resolveCardFontSize(
  input: CardMetricsInput,
  wanted: number,
): { fontSize: number; shed: TimetableShed } {
  if (!input.rows || (input.cardHeight ?? 0) <= 0 || wanted <= 0) {
    return { fontSize: Math.max(0, wanted), shed: 0 };
  }
  const shape = rowShape(input.rows);
  // A week with no lessons has no grid to hold together, so there is nothing
  // to hold a size against and nothing to shed.
  if (shape.units <= 0) return { fontSize: wanted, shed: 0 };

  for (const shed of [0, 1, 2] as const) {
    if (holdsAt({ ...input, shed }, shape, wanted)) return { fontSize: wanted, shed };
  }

  // Nothing holds the size that was asked for, so the card comes down to the
  // largest it can hold with everything shed. Never below the size it would
  // have chosen for itself: declining a request must not leave a card smaller
  // than it would have been if nobody had made one.
  const own = Math.max(MIN_BASE_PX, cardBaseFontSize(input));
  const pressed = { ...input, shed: 2 as TimetableShed };
  const fontSize = Math.max(
    own,
    largestFitting(pressed, shape, wanted, 1, own),
    largestFitting(pressed, shape, wanted, 2, own),
  );
  // Give back whatever the size it settled on can afford to keep.
  for (const shed of [0, 1] as const) {
    if (holdsAt({ ...input, shed }, shape, fontSize)) return { fontSize, shed };
  }
  return { fontSize, shed: 2 };
}

// ---------------------------------------------------------------------------
// The module's own box: the cards in it, and the heading over them
// ---------------------------------------------------------------------------

export interface TimetableRowBox {
  /** The module's own box, inside whatever padding the wall gives it. */
  width: number;
  height: number;
  cardCount: number;
  stacked: boolean;
  /** One card's padding plus its border, on one side, in CSS pixels. */
  inset: number;
  /** Height already spent on the heading above the cards. */
  bandPx?: number;
}

/**
 * The box one card is handed inside the module.
 *
 * The cards share the module's box in equal tracks with one gap between each
 * pair, and each of them then sits inside its own card's padding and border.
 * The module works this out rather than waiting for the cards to report their
 * own boxes back, because the size the whole row agrees on has to be settled
 * before any of them is drawn, and a row that measured itself first and agreed
 * afterwards would take its answer a frame late, in a screenshot.
 */
export function cardBoxIn(box: TimetableRowBox): { width: number; height: number } {
  const count = Math.max(1, box.cardCount);
  const gaps = CARD_GAP_PX * (count - 1);
  const grid = Math.max(0, box.height - (box.bandPx ?? 0));
  const width = box.stacked ? box.width : (box.width - gaps) / count;
  const height = box.stacked ? (grid - gaps) / count : grid;
  return {
    width: Math.max(0, width - box.inset * 2),
    height: Math.max(0, height - box.inset * 2),
  };
}

export interface TimetableHeading {
  /** The size the heading is drawn at, in whole CSS pixels. */
  fontPx: number;
  /** The band it takes above the cards, in CSS pixels. */
  bandPx: number;
}

/**
 * The heading above the cards, sized off the cards below it.
 *
 * Its band is height the cards do not get, and its size comes from theirs, so
 * the two are settled together here: a few rounds of asking what the cards
 * would be at the band the heading last wanted. Whole pixels, and it converges
 * long before the rounds run out, so the answer for one wall is one number
 * rather than a jitter two screenshots apart.
 *
 * `fixedPx` is the Style panel's own Title size where a household has set one:
 * an explicit request, honoured, and still held to the band's share of the box
 * so a 72px title cannot take half the module.
 */
export function resolveHeading(
  box: TimetableRowBox,
  detail: TimetableDetail,
  fixedPx?: number,
): TimetableHeading {
  if (box.width <= 0 || box.height <= 0) {
    return { fontPx: Math.max(0, Math.round(fixedPx ?? 0)), bandPx: 0 };
  }
  // The tallest band allowed, and therefore the largest one-line heading.
  const cap = Math.max(1, Math.floor((HEADING.maxShare * box.height) / (HEADING.line + HEADING.padEm)));
  let fontPx = 0;
  for (let round = 0; round < HEADING_ROUNDS; round++) {
    const bandPx = Math.ceil((HEADING.line + HEADING.padEm) * fontPx);
    const card = cardBoxIn({ ...box, bandPx });
    const wanted = fixedPx ?? HEADING.em * tasteFontSize({ cardWidth: card.width, cardHeight: card.height, detail, padding: 0 });
    const next = Math.max(1, Math.min(cap, Math.round(wanted)));
    if (next === fontPx) break;
    fontPx = next;
  }
  return { fontPx, bandPx: Math.ceil((HEADING.line + HEADING.padEm) * fontPx) };
}

/**
 * How wide to draw the focus column, how wide the gutter has to be, and
 * whether the card can afford its rich treatment at all.
 *
 * All of it comes out of one measurement rather than a setting, because a
 * module can be dropped into any box: a quiet column has a floor it cannot go
 * under and still be readable, so the focus column takes its preferred share
 * only while four legible quiet columns fit beside it. Once the focus column
 * is too narrow for a subject name it stops pretending and shows a code like
 * the others, which is what a card five across a wall ends up doing.
 */
export function cardMetrics(input: CardMetricsInput): CardMetrics {
  const base = Math.max(1, input.baseFontSize ?? cardBaseFontSize(input));

  // The row's height first, because how much of its stack the gutter can show
  // depends on it, and how wide the gutter comes out depends on that.
  const rowPx = input.rows && (input.cardHeight ?? 0) > 0
    ? flexRowPx(input, rowShape(input.rows), base)
    : Infinity;
  const gutter = gutterFor(input, base, rowPx);
  const columns = columnMetrics(input, base, gutter.px);

  // What the lit column can print on one line at the size that was settled on.
  // A name wider than that takes a second line rather than an ellipsis.
  const inner = richLabelEm(input, base, columns.focusColumnEm);
  const label = nameWidthEm(input.longestLabelChars ?? REFERENCE_LABEL_CHARS);
  const focusLabelLines = label <= inner ? 1 : 2;

  // How many lines of label the cells can really hold at this size, which is
  // what the drawn label is clamped to.
  const preset = presetOf(input);
  const quietRoom = preset.rooms === 'all'
    ? CARD_TEXT.room.gapEm * base + CELL_LINE * smallPrintPx(base, CARD_TEXT.room)
    : 0;
  const quietLine = (preset.names === 'all' ? NAME_LINE_EM : CELL_LINE) * base;
  const richSub = ((preset.rooms ? 1 : 0) + (preset.times === 'range' ? 1 : 0))
    * (CARD_TEXT.detail.gapEm * base + CELL_LINE * smallPrintPx(base, CARD_TEXT.detail));
  // The lines a cell can really hold, floored at one and never at the budget.
  // Flooring at the budget was right while the card chose its own size, since
  // the budget is then what it was sized against, and wrong the moment
  // something else chose: at Text size 160% a two-line budget was forced into
  // a cell with room for one, and "Ge-schich / te" was cut off at the bottom
  // edge rather than giving up its tail where a reader can see it.
  const linesIn = (available: number, line: number, least: number): number =>
    Number.isFinite(available) ? Math.max(1, Math.floor(available / line)) : least;
  const labelClamp = {
    focus: linesIn(rowPx - richSub, CELL_LINE * base, focusLabelLines),
    quiet: linesIn(rowPx - quietRoom - (quietIcon(input) ? QUIET_ICON_EM * base : 0), quietLine, QUIET_LABEL_LINES[input.detail]),
    fold: foldLabelLines(input, base, rowPx),
  };

  // A chip is the first thing to go when a lit lesson is short of height: the
  // packing line is worth less than the lesson it would be painted over.
  const packChip =
    lessonCellPx(preset, base, columns.wideFocus, focusLabelLines, quietIcon(input)) + chipPx(base)
      <= rowPx;

  return {
    baseFontSize: base,
    ...columns,
    widthPx: Math.max(0, input.cardWidth - (input.padding ?? CARD_PADDING_PX) * 2),
    gutterPx: gutter.px,
    gutterTimePx: gutter.timePx,
    gutterTimes: gutter.times,
    gutterFoldTime: gutterRowPx(base, gutter.timePx, 'start') <= rowPx * FOLD_ROW_FR,
    focusLabelLines,
    quietLabelLines: QUIET_LABEL_LINES[input.detail],
    labelClamp,
    packChip,
    measured: input.cardWidth > 0,
  };
}

// ---------------------------------------------------------------------------
// The card model
// ---------------------------------------------------------------------------

export interface LessonCardCell {
  kind: 'lesson';
  periods: number[];
  start: string;
  end: string;
  subject: TimetableSubject;
  /** What to print: the short code, or the subject's name. */
  label: string;
  labelStyle: 'code' | 'name';
  /**
   * The size to draw it at, as a fraction of the card's own. A name is always
   * 1: it has lines to break onto. A code steps down instead, because there is
   * nothing shorter behind it and half a code is not a subject.
   */
  labelScale: number;
  /** The course group worth pointing out, such as an advanced course. */
  course?: string;
  /** The room, on its own line under the name. */
  room?: string;
  /**
   * Whether the room is worth naming ("Room 204") or has to stand on its own
   * ("204"). The column is measured for the word; a column too tight for it
   * keeps the number, which is the half that carries the information.
   */
  roomWord?: boolean;
  /** The lesson's own start and end, under the name in the wide focus column. */
  timeRange?: { start: string; end: string };
  /** The roomy left-aligned treatment the focus column gets when it has the width. */
  rich: boolean;
  /**
   * Lines the name may take in that treatment. One keeps it on a single line;
   * two lets a name too long for the column wrap instead of being cut, and the
   * card has already left the height for the second line.
   */
  labelLines: number;
  /** What to pack for this lesson, shown as a chip. */
  bring?: string;
  showIcon: boolean;
  /** The week letter, on lessons the other week changes. */
  weekBadge?: WeekLetter;
  double: boolean;
  /**
   * A test that day in this subject: the name the note gave it, or '' for a
   * test with no name, which the component prints as the plain word.
   */
  test?: string;
  /** The lesson is off by a note, and says so in a word; a short day's cut says it in the header instead. */
  cancelled?: boolean;
}

export interface FreeCardCell {
  kind: 'free';
  periods: number[];
  /** The roomy left-aligned treatment of the focus column. */
  rich: boolean;
  /** School does not start until this time, shown under a first-period gap. */
  lateStart?: string;
  /**
   * Whether the column can hold the words around that time. Spanish writes
   * "empieza a las 08:40", the longest of the seven, and unmeasured it lost
   * the last digit of the time instead of the sentence around it.
   */
  lateStartWord?: boolean;
}

export interface LunchCardCell {
  kind: 'lunch';
  periods: number[];
  /** There is room to name it, not just draw the tray. */
  showLabel: boolean;
}

export interface CareCardCell {
  kind: 'care';
  careName: string;
  until: string;
  /**
   * How much of the clause the column can hold: the name and the word around
   * the time, the word alone, the bare time, or nothing.
   *
   * The band's own label in the gutter already names the care, so the name is
   * the first thing to go and the time is the last: a cell that centres
   * "OGS bis 16:00" in a 47px column drew "s 16:0", which is not a time.
   */
  form: 'full' | 'short' | 'time' | 'none';
}

export interface FoldedCardCell {
  kind: 'folded';
  entries: {
    periods: number[];
    start: string;
    subject: TimetableSubject;
    label: string;
    labelStyle: 'code' | 'name';
    labelScale: number;
    showIcon: boolean;
    /**
     * The entry has the width for its own start time. Two lessons share this
     * cell side by side, so each gets half a column: centred and clipped, a
     * 12-hour time came out as ":10 PM", with its hour gone.
     */
    showTime: boolean;
    bring?: string;
  }[];
  /**
   * The width one entry is drawn in, in CSS pixels, and the lines its label
   * may take. Both are on the cell rather than worked out again where it is
   * drawn: what the words were chosen against and what they are drawn in have
   * to be the same number.
   */
  widthPx: number;
  labelLines: number;
}

export type TimetableCardCell = LessonCardCell | FreeCardCell | LunchCardCell | CareCardCell | FoldedCardCell;

export interface PlacedCell {
  /** Index into `rows` of the first row this cell covers. */
  rowStart: number;
  /** One past the last row it covers, so `rowEnd - rowStart` is its height. */
  rowEnd: number;
  /** The day finishes before this lesson, so it is drawn as not happening. */
  faded: boolean;
  cell: TimetableCardCell;
}

export interface DayColumn {
  day: DayKey;
  date: string;
  isFocus: boolean;
  /** Everything in this column is drawn dimmed; the value names the day off. */
  closedLabel?: string;
  /** The day stops after this period. */
  endsAfterPeriod?: number;
  /** What the short day is called, for example a report-card morning. */
  shortLabel?: string;
  /**
   * The header prints the day of the month beside the weekday.
   *
   * The setting asks for it, and then the column is measured for it: a date
   * cut in half is a different date, so a column too tight keeps the weekday
   * and gives the number up whole. This is the lit column's answer as much as
   * a quiet one's, since the lit column is the narrowest one on a
   * five-across card.
   */
  showDate: boolean;
  /**
   * The header names the month as well as the day number.
   *
   * Only where a reader would otherwise have to guess it: the day a week
   * crosses into a new month, and the lit day when the card has jumped to a
   * date. Naming it in all five columns spells November five times across a
   * row that already has five columns to fit.
   */
  showMonth: boolean;
  cells: PlacedCell[];
}

export type GutterCell =
  | { kind: 'period'; n: number; start?: string; end?: string }
  /** A folded afternoon. The start time goes where its short row cannot hold it. */
  | { kind: 'fold'; periods: number[]; start?: string }
  /** A break or the care band: drawn right across the card, not in column one. */
  | { kind: 'band'; label: string };

/** One stretch of periods where the two weeks disagree. */
export interface WeekDifference {
  day: DayKey;
  periods: number[];
  /** What happens in the A week, or null when the period is free or lunch. */
  a: TimetableSubject | null;
  b: TimetableSubject | null;
}

export interface TimetableCardModel {
  member: { id: string; name: string; color: string; initials: string };
  className?: string;
  detail: TimetableDetail;
  metrics: CardMetrics;
  /**
   * The week has no lessons in it at all: a timetable somebody added and has
   * not filled in yet. The card says so in a line of its own instead of
   * drawing a grid with nothing in it.
   */
  emptyWeek: boolean;
  weekLetter: WeekLetter;
  weekNumber: number;
  header: {
    focusDay: DayKey;
    focusDate: string;
    labelKind: FocusLabelKind;
    /** When the focus day's lessons start and end. Absent on a day with none. */
    span?: { start: string; end: string };
    /** Set when the focus day is closed; it replaces the times. */
    closedLabel?: string;
    /** After-school care, until Detail gives it a row of its own. */
    care?: { name: string; until: string };
    /** Shrink the line to just the times: a tight card has room for nothing else. */
    compact: boolean;
    /**
     * The day line is gone altogether, for a row that cannot hold even two
     * times. The card keeps the name, which is what tells it from its
     * neighbours, and the lit column's pill still says which day it is.
     */
    hideMeta: boolean;
    /**
     * The class and the week letter beside the name. They are the two things
     * worth less than the times, so they are what the row gives up to keep
     * them whole.
     */
    showClass: boolean;
    showBadge: boolean;
    /**
     * The lozenge around the lit day's name: its usual padding, a tighter one,
     * or none at all. A fifth of the pill's width is padding, so giving that up
     * is what buys the date another card size.
     */
    pill: 'full' | 'tight' | 'none';
    /** "Today" before the lit day's pill, which only a wide column has room for. */
    focusWord: boolean;
  };
  rows: TimetableRow[];
  /** Column one, one entry per row and in the same order. */
  gutter: GutterCell[];
  days: DayColumn[];
  focusIndex: number;
  /** Show the date beside every quiet day name, not just the focus one. */
  showDayDates: boolean;
  /**
   * The going-home line, under the lit day's last lesson, and how much of it
   * the column can hold: the sentence, the time beside the house, or the time
   * alone. Absent where even the time does not fit, because the line above the
   * grid already says when the day ends and "13:1" is not a time.
   */
  tail?: {
    /** Absent where the Detail draws no going-home line and the tail holds chips alone. */
    endTime?: string;
    rowStart: number;
    rowEnd: number;
    form: 'sentence' | 'time' | 'bare';
    /** One-off things to bring on the lit day, from its notes, as chips under the line. */
    bring?: string[];
  };
  footer?: {
    /**
     * What to pack for the focus day, in lesson order and without repeats,
     * the subjects' items first and then the day's one-off notes. Absent on a
     * day school is shut: there is nothing to pack for a day that is not
     * happening, and "nothing special" is still an instruction.
     */
    bring?: string[];
    /** The lit day's tests, as the note named them ('' for a test with no name). */
    tests?: string[];
    /**
     * Tomorrow's notes, when the card is on today: a test named as the note
     * named it, and the periods that are off. Only the More footer has the
     * words for them.
     */
    tomorrow?: { tests: string[]; cancelled: number[] };
    legend: WeekDifference[];
  };
  /**
   * School is out, in the longest of three forms of the same fact the card has
   * the width for. The date is one of the two facts the line carries, so the
   * line drops the sentence around it before it shortens the date, and is
   * absent altogether rather than cut: see `holidayForm`.
   */
  holiday?: { name: string; backOn: string; form: HolidayLineForm };
}

/**
 * How much of the school-holiday line a card can hold: the sentence with the
 * long date, the sentence with a short one, or the holiday's name and the day
 * school is back with no sentence around them.
 */
export type HolidayLineForm = 'full' | 'short' | 'brief';

/** 'Violin (JeKits)' reads as 'Violin' in a cell; the bracketed half is for the settings list. */
function shortName(subject: TimetableSubject): string {
  return subject.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || subject.name;
}

/**
 * The longest subject name this week can put in a cell, in characters.
 *
 * The card sizes its lit column against this rather than against the day it
 * happens to be lighting, because the lit column moves every morning: a size
 * that only fitted Thursday's names would come apart on Friday.
 */
export function longestSubjectLabel(
  timetable: Timetable,
  subjects: readonly TimetableSubject[],
): number {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  let longest = 0;
  for (const week of weeksOf(timetable)) {
    for (const day of DAY_KEYS) {
      for (const cell of Object.values(week[day] ?? {})) {
        if (!isLesson(cell)) continue;
        const subject = byId.get(cell.subjectId);
        if (subject) longest = Math.max(longest, shortName(subject).length);
      }
    }
  }
  return longest;
}

/**
 * The course badge is a contrast marker, not a label: it points out the lessons
 * that differ from the course this person is mostly in. A sixth former taking
 * one advanced subject among a dozen ordinary ones sees that subject flagged;
 * somebody whose whole week is one course sees no badges at all, because there
 * would be nothing to tell apart.
 */
export function usualCourse(timetable: Timetable): string | undefined {
  const counts = new Map<string, number>();
  for (const week of weeksOf(timetable)) {
    for (const day of DAY_KEYS) {
      for (const cell of Object.values(week[day] ?? {})) {
        if (!isLesson(cell) || !cell.course) continue;
        counts.set(cell.course, (counts.get(cell.course) ?? 0) + 1);
      }
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  let tied = false;
  for (const [course, count] of counts) {
    if (count > bestCount) {
      best = course;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }
  return tied ? undefined : best;
}

/**
 * The longest course badge this card may draw beside a name, in characters.
 *
 * Only a course that differs from the one this person is mostly in is badged,
 * so a week that is all one course answers zero and nothing comes off the
 * name's width.
 */
export function longestCourseBadge(timetable: Timetable): number {
  const usual = usualCourse(timetable);
  let longest = 0;
  for (const week of weeksOf(timetable)) {
    for (const day of DAY_KEYS) {
      for (const cell of Object.values(week[day] ?? {})) {
        if (!isLesson(cell) || !cell.course || cell.course === usual) continue;
        longest = Math.max(longest, cell.course.length);
      }
    }
  }
  return longest;
}

/**
 * Every stretch of the week where the A plan and the B plan disagree, which is
 * what the More footer lists so nobody has to compare two grids by eye.
 */
export function weekDifferences(
  timetable: Timetable,
  school: TimetableSchool,
  subjects: readonly TimetableSubject[],
): WeekDifference[] {
  if (!timetable.weeks.B) return [];
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const periods = periodSlots(school)
    .filter((p) => p.n <= lastUsedPeriod(timetable))
    .map((p) => p.n);

  const key = (cell: TimetableCell | undefined) =>
    isLesson(cell) ? `${cell.subjectId}|${cell.course ?? ''}` : cell ? 'lunch' : 'free';
  const subjectOf = (cell: TimetableCell | undefined) =>
    (isLesson(cell) ? byId.get(cell.subjectId) : undefined) ?? null;

  const out: WeekDifference[] = [];
  for (const day of DAY_KEYS) {
    let run: (WeekDifference & { keyA: string; keyB: string }) | null = null;
    for (const n of periods) {
      const a = cellAt(timetable, 'A', day, n);
      const b = cellAt(timetable, 'B', day, n);
      const keyA = key(a);
      const keyB = key(b);
      if (keyA === keyB) {
        run = null;
        continue;
      }
      if (run && run.keyA === keyA && run.keyB === keyB) {
        run.periods.push(n);
        continue;
      }
      run = { day, periods: [n], a: subjectOf(a), b: subjectOf(b), keyA, keyB };
      out.push(run);
    }
  }
  return out.map(({ day, periods: ps, a, b }) => ({ day, periods: ps, a, b }));
}

export interface TimetableCardInput {
  member: Pick<FamilyMember, 'id' | 'name' | 'color'>;
  timetable: Timetable;
  school: TimetableSchool;
  subjects: readonly TimetableSubject[];
  detail: TimetableDetail;
  focus: FocusResolution;
  metrics: CardMetrics;
  /** Module setting: the time each period starts, beside its number. Omitted = shown. */
  showStartTimes?: boolean;
  /** The household's clock, which decides how wide every time on the card is. */
  timeFormat: TimeFormat;
  /**
   * The length of the words the component will put around a time, a room or a
   * date, and of the sentences it composes out of them, in characters.
   * Omitted falls back to the en-US lengths.
   */
  words?: TimetableWords;
  /**
   * The header row the whole module is measured against. Omitted, the card
   * settles its day line against its own name and class, which is right for a
   * card drawn on its own and wrong for one of several.
   */
  row?: TimetableRowFacts;
  /** What the card has given up to be drawn at the size it was asked for. */
  shed?: TimetableShed;
}

/**
 * Everything one week card draws, settled.
 *
 * The component that renders this decides nothing: it reads `rows` for the grid
 * template, `gutter` for column one, `days` for the cells and their spans, and
 * the flags on each cell for which treatment to give it. The only thing it adds
 * is words, in the display's language.
 */
export function cardModel(input: TimetableCardInput): TimetableCardModel {
  const { timetable, school, subjects, detail, focus, metrics } = input;
  const preset = shedPreset(detail, input.shed);
  const week = focus.weekLetter;
  const { rows, foldAfter } = buildRows(timetable, school, detail);
  const wide = metrics.wideFocus;
  const icons = timetable.icons === true;
  const badgedCourse = usualCourse(timetable);
  const words = input.words ?? DEFAULT_WORDS;
  const format = input.timeFormat;

  /**
   * How much width a cell in one of the two kinds of column has, in pixels.
   *
   * Nothing measured yet means every answer below comes out as the roomiest
   * one, so a card that is about to have the width for a word does not draw
   * one frame without it.
   */
  const columnPx = (rich: boolean): number => cellWidthPx(metrics, rich);

  /**
   * The same width without a cell's own padding taken off, for the things
   * drawn straight into a column rather than inside a lesson cell: the day
   * header and the care band.
   */
  const columnRawPx = (rich: boolean): number => {
    if (!metrics.measured) return Infinity;
    const columnEm = rich ? metrics.focusColumnEm : metrics.quietColumnEm;
    return columnEm <= 0 ? Infinity : columnEm * metrics.baseFontSize;
  };

  /** The size a piece of small print is drawn at on this card, in pixels. */
  const printPx = (size: { em: number; px: number }): number => smallPrintPx(metrics.baseFontSize, size);

  /**
   * Whether a room can be named in the column it is drawn in, and whether it
   * fits there at all.
   *
   * A quiet column is usually too tight for the word and keeps the bare code;
   * the lit column has the width and says "Room 204" in full. A 16-character
   * room, which the editor accepts, does not fit a quiet column either way,
   * and a room cut at both ends ("turwetensch") is worse than no room.
   */
  const roomForm = (chars: number, rich: boolean): 'word' | 'bare' | 'none' => {
    const px = printPx(rich ? CARD_TEXT.detail : CARD_TEXT.room);
    const available = columnPx(rich);
    // The word is decided on the subject-name bound, which is the one the
    // signed-off frames named their rooms under. The bare code is decided on
    // the tighter one, because there is nothing shorter to fall back to.
    if (nameWidthEm(chars + words.room) * px <= available) return 'word';
    if (labelWidthEm(chars) * px <= available) return 'bare';
    return 'none';
  };

  /**
   * Whether this column has to say which month it is in: the day the week
   * crosses into a new one, or the lit day of a card that has jumped to a date
   * rather than to a weekday.
   */
  const namesMonth = (day: DayKey): boolean => {
    const index = DAY_KEYS.indexOf(day);
    if (index === 0) return day === focus.focusDay && focus.focusLabelKind === 'date';
    const previous = focus.dayDates[DAY_KEYS[index - 1]];
    const crosses = monthOf(focus.dayDates[day]) !== monthOf(previous);
    return crosses || (day === focus.focusDay && focus.focusLabelKind === 'date');
  };

  /**
   * How much of the going-home line the lit column can hold.
   *
   * The sentence, then the bare time beside the house, then the time on its
   * own: the line is clipped to its column, and the ladder used to stop after
   * the first rung, so a column too tight for "13:15" printed "13:1". Nothing
   * is lost by dropping it altogether, because the line above the grid says
   * when the day ends too.
   */
  const endCapForm = (): 'sentence' | 'time' | 'bare' | 'none' => {
    const px = printPx(CARD_TEXT.tail);
    const available = columnRawPx(true);
    const time = TIME_FIT_EM[format];
    if ((END_CAP_FURNITURE_EM + labelWidthEm(words.endCap) + time) * px <= available) return 'sentence';
    if ((END_CAP_FURNITURE_EM + time) * px <= available) return 'time';
    if ((END_CAP_BARE_EM + time) * px <= available) return 'bare';
    return 'none';
  };

  /**
   * How much of the after-school care clause a column can hold.
   *
   * Both ends of this one were being cut, because the cell centres its text:
   * "OGS bis 16:00" in a 47px column drew "s 16:0", and on the lit day, where
   * the name is printed, the time went altogether. The gutter's band label
   * already names the care, so the name is the first thing dropped.
   */
  const careForm = (name: string, rich: boolean, withName: boolean): CareCardCell['form'] => {
    const px = printPx(CARD_TEXT.care);
    const available = columnRawPx(rich);
    const time = TIME_FIT_EM[format];
    if (withName && (labelWidthEm(name.length + words.careFull) + time + CARE_NAME_PAD_EM) * px <= available) {
      return 'full';
    }
    if ((labelWidthEm(words.careShort) + time) * px <= available) return 'short';
    if (time * px <= available) return 'time';
    return 'none';
  };

  /**
   * What a day header may print, against the column it sits in.
   *
   * The pill is about 75px at every card size, because its type has a pixel
   * floor and it carries a fifth of its width in padding, and the lit column
   * is under 50px on a five-across card. Sliced, "Do 10." reads as Thursday
   * the 1st, so the padding gives way first, then the month, then the number,
   * and the weekday is what always survives.
   */
  const dayHead = (rich: boolean, isFocus: boolean, wantsMonth: boolean): DayHead => {
    const px = printPx(DAY_ROW);
    const available = columnRawPx(isFocus);
    const canWord = isFocus && rich && focus.focusLabelKind === 'today';
    const wordEm = wordWidthEm(words.focusWord) + DAY_GAP_EM;

    // Most informative first, and each rung gives up the least it can: the
    // "today" word, then a fifth of the pill's width in padding, then the
    // month, then the day number, then the lozenge itself. The weekday is
    // what always survives.
    const full = isFocus ? PILL.pad : 0;
    const tight = isFocus ? PILL.tightPad : 0;
    const ladder: DayHead[] = [];
    if (canWord) ladder.push({ pill: 'full', showDate: true, showMonth: wantsMonth, word: true });
    ladder.push({ pill: 'full', showDate: true, showMonth: wantsMonth, word: false });
    if (isFocus) ladder.push({ pill: 'tight', showDate: true, showMonth: wantsMonth, word: false });
    if (wantsMonth) {
      ladder.push({ pill: 'full', showDate: true, showMonth: false, word: false });
      if (isFocus) ladder.push({ pill: 'tight', showDate: true, showMonth: false, word: false });
    }
    ladder.push({ pill: 'full', showDate: false, showMonth: false, word: false });
    if (isFocus) {
      ladder.push({ pill: 'tight', showDate: false, showMonth: false, word: false });
      ladder.push({ pill: 'none', showDate: false, showMonth: false, word: false });
    }

    for (const form of ladder) {
      const chars = form.showDate
        ? (form.showMonth ? words.dayHead : words.dayName + words.dayNumber)
        : words.dayName;
      const pill = form.pill === 'full' ? full : form.pill === 'tight' ? tight : 0;
      const wanted = pill
        + (form.showDate ? PILL.gapEm : 0)
        + labelWidthEm(chars) + DAY_HEAD_SLACK_EM
        + (form.word ? wordEm : 0);
      if (wanted * px <= available) return form;
    }
    return ladder[ladder.length - 1];
  };

  /**
   * Whether a quiet column can hold a subject's name in the lines it is
   * allowed, or has to fall back to the code the catalogue carries for exactly
   * this.
   *
   * Nothing measured a quiet label before: the only width test in the file was
   * guarded on the lit column, so "Physical Education" came out as
   * "Physi / cal / Educa / tion" with no hyphen, and "Sozialwissenschaften"
   * took six lines in a cell budgeted for two. "PE" and "Sowi" read from
   * across a room; the fragments do not.
   */
  const quietNameFits = (chars: number, available: number, lines: number): boolean => {
    const px = NAME_SIZE_EM * metrics.baseFontSize;
    // A name with a second line to break onto is measured with the generous
    // bound, where being wrong costs it that break and nothing else. A name on
    // one line has no break to give, so it is measured with the bound written
    // for exactly that: the furniture bound carries no slack and passed names
    // the cell then cut, the generous one carries a whole character and shed
    // names the cell had room for.
    const width = lines > 1 ? nameWidthEm(chars) : oneLineNameWidthEm(chars);
    return width * px <= available * lines;
  };

  /** The largest of the code sizes that holds this many characters. */
  const codeScale = (chars: number, available: number): number => {
    const wanted = (chars * CODE_WIDTH.perChar + CODE_WIDTH.plus) * metrics.baseFontSize;
    return CODE_STEPS.find((step) => wanted * step <= available) ?? CODE_STEPS[CODE_STEPS.length - 1];
  };

  /**
   * What a cell prints and how: the subject's name where the column can hold
   * it, the short code the catalogue carries for narrow cells where it cannot,
   * and a size down for a code that is still too wide for its column.
   */
  const labelOf = (
    subject: TimetableSubject,
    rich: boolean,
    /**
     * The width this label is drawn in and the lines it may take. A folded
     * afternoon passes the width its own entry gets, which is not a share of
     * the column when one lesson has the row to itself.
     */
    available = columnPx(false),
    lines = metrics.quietLabelLines,
  ) => {
    const name = shortName(subject);
    const asName = rich || (preset.names === 'all' && quietNameFits(name.length, available, lines));
    return {
      label: asName ? name : subject.code,
      labelStyle: (asName ? 'name' : 'code') as 'code' | 'name',
      labelScale: asName ? 1 : codeScale(subject.code.length, available),
    };
  };

  /**
   * Whether a course badge fits beside the label it is drawn after.
   *
   * It is two or three characters and it used to be suppressed only on a card
   * the metrics called narrow, which a five-across card at More is not: the
   * badge then wrapped between its own letters and the two halves were painted
   * over the subject name above them.
   */
  const badgeFits = (badgeChars: number, labelChars: number, asName: boolean, rich: boolean): boolean => {
    const badge = labelWidthEm(badgeChars) * printPx(CARD_TEXT.badge) + BADGE_FURNITURE_EM * metrics.baseFontSize;
    const lines = rich ? metrics.focusLabelLines : metrics.quietLabelLines;
    const labelPx = asName ? NAME_SIZE_EM * metrics.baseFontSize : metrics.baseFontSize;
    const label = (asName ? nameWidthEm(labelChars) : labelWidthEm(labelChars)) * labelPx;
    // The badge sits after the label's last line, so the label's width is
    // spread over the lines it is allowed and only that line shares the row.
    return badge + label / Math.max(1, lines) <= columnPx(rich);
  };

  /** Whether the words around a late start fit the cell the note is drawn in. */
  const lateStartWordFits = (rich: boolean): boolean =>
    (labelWidthEm(words.lateStart) + TIME_FIT_EM[format]) * printPx(CARD_TEXT.late) <= columnPx(rich);

  /**
   * How much of the day line the header row has the width for.
   *
   * The row holds the initials dot, the name, the class, the week badge and
   * then a sentence about the day, and flexbox splits a shortfall between the
   * name and the sentence, so both lost text at once: at five cards not one of
   * five names was legible. The name is the only thing that tells five cards
   * apart, so the sentence is what gives way, and it gives way by measurement:
   * the flag that used to do this read a column width in em, which barely
   * changes with the card and so never tripped.
   */
  const headerForm = (): HeaderForm => {
    const most: HeaderForm = { meta: 'care', className: true, badge: true };
    if (!metrics.measured) return most;
    const base = metrics.baseFontSize;
    const metaPx = printPx(CARD_TEXT.meta);
    const gap = HEADER_ROW.gapEm * base;
    const chip = (chars: number, em: number) => gap + labelWidthEm(chars) * em * base;
    // Measured against the row's own header row where there is one, so every
    // card in a module comes down the same rung at the same moment rather
    // than one of them keeping a sentence its neighbours have lost.
    const row = input.row;
    const nameChars = row?.nameChars ?? input.member.name.length;
    const classChars = row?.classChars ?? timetable.className?.length ?? 0;
    const badge = row ? row.badge : school.weekCycle.mode === 'parity';
    const careChars = row?.careChars ?? school.care?.name.length ?? 0;
    const focusWordChars = row?.focusWordChars ?? words.focusWord;
    // The name is capped in the row the same way it is drawn, so one long name
    // cannot take the whole ladder down with it.
    const name = Math.min(
      nameWidthEm(nameChars) * HEADER_ROW.nameEm * base,
      metrics.widthPx * HEADER_ROW.nameShare,
    );
    const fixed = (HEADER_ROW.dotEm + HEADER_ROW.gapEm) * base + name + gap;
    const classPx = classChars ? chip(classChars, HEADER_ROW.classEm) : 0;
    // The week badge is one letter inside a lozenge of its own.
    const badgePx = badge ? chip(1, HEADER_ROW.badgeEm) + HEADER_ROW.badgeEm * base : 0;
    const times = 2 * TIME_FIT_EM[format] + labelWidthEm(1);
    const meta = {
      care: (labelWidthEm(focusWordChars + words.timeRange) + times
        + labelWidthEm(careChars + words.careFull + SEPARATOR_CHARS)
        + TIME_FIT_EM[format]) * metaPx,
      full: (labelWidthEm(focusWordChars + words.timeRange) + times) * metaPx,
      compact: times * metaPx,
      none: 0,
    };

    // The times are the point of the line, so the two chips beside them give
    // way before they do: a class and a week letter are worth less than when
    // the school day starts and ends, and the times are the half that reads as
    // a different fact when it loses a digit.
    const ladder: HeaderForm[] = [
      { meta: 'care', className: true, badge: true },
      { meta: 'full', className: true, badge: true },
      { meta: 'compact', className: true, badge: true },
      { meta: 'compact', className: false, badge: true },
      { meta: 'compact', className: false, badge: false },
      { meta: 'none', className: true, badge: true },
      { meta: 'none', className: false, badge: false },
    ];
    for (const form of ladder) {
      const wanted = fixed
        + (form.className ? classPx : 0)
        + (form.badge ? badgePx : 0)
        + meta[form.meta];
      if (wanted <= metrics.widthPx) return form;
    }
    return ladder[ladder.length - 1];
  };

  /**
   * How much of the school-holiday line the card can hold.
   *
   * The line is the only thing on the card saying why the week it shows is a
   * fortnight away, and it carries two facts, which holiday it is and the day
   * school is back, so a clipped "wieder Schule am M..." is the one truncation
   * that costs everything. The short date is a card size cheaper than the long
   * one; dropping the sentence and keeping the two facts is cheaper again, and
   * is what five cards across at More needs.
   *
   * Under that there is nothing left to shorten and only the holiday's own
   * name to cut, so the line is dropped: a card that says "Herbstf..." has
   * spent a line of its height saying nothing. No frame in the matrix reaches
   * it; it is the floor of the ladder rather than a state anything draws.
   */
  const holidayForm = (): HolidayLineForm | 'none' => {
    if (!metrics.measured) return 'full';
    const px = printPx(CARD_TEXT.holiday);
    // The sun before the line, and the gap after it.
    const furniture = (1 + 0.35) * px;
    const fits = (chars: number): boolean => labelWidthEm(chars) * px + furniture <= metrics.widthPx;
    if (fits(words.holidayFull)) return 'full';
    if (fits(words.holidayShort)) return 'short';
    if (fits(words.holidayBrief)) return 'brief';
    return 'none';
  };

  const rowOfPeriod = new Map<number, number>();
  let foldRow = -1;
  let careRow = -1;
  rows.forEach((row, index) => {
    if (row.kind === 'period') rowOfPeriod.set(row.n, index);
    else if (row.kind === 'fold') foldRow = index;
    else if (row.kind === 'care') careRow = index;
  });

  const gutter: GutterCell[] = rows.map((row) => {
    if (row.kind === 'break' || row.kind === 'care') return { kind: 'band', label: row.label };
    if (row.kind === 'fold') {
      return { kind: 'fold', periods: row.periods, start: metrics.gutterFoldTime ? row.start : undefined };
    }
    // How many of its times the gutter shows is settled against the row's own
    // height: on a short card a number and two times are taller than the row,
    // and the number is the one thing in there nobody can work out.
    return {
      kind: 'period',
      n: row.n,
      start: metrics.gutterTimes === 'none' ? undefined : row.start,
      end: metrics.gutterTimes === 'range' ? row.end : undefined,
    };
  });

  const changed = preset.ab ? weekDifferences(timetable, school, subjects) : [];
  const changedPeriods = new Set(changed.flatMap((d) => d.periods.map((p) => `${d.day}:${p}`)));

  const days: DayColumn[] = [];
  let tail: TimetableCardModel['tail'];
  // Null until a day that is actually happening fills it in: a closed day has
  // nothing to pack for, which is not the same as nothing special to pack.
  let footerBring: string[] | null = null;
  let focusSpan: { start: string; end: string } | null = null;
  // A week that is not this one has to say which week it is, whatever the
  // Detail setting, or Monday could be any Monday.
  const showDayDates = detail !== 'less' || !focus.currentWeek;
  let focusHead: DayHead = { pill: 'full', showDate: true, showMonth: false, word: false };

  for (const day of DAY_KEYS) {
    const isFocus = day === focus.focusDay;
    const rich = isFocus && wide;
    const endsAfter = focus.shortDays[day]?.endsAfterPeriod;
    const onDay = focus.notes[day];
    // The cut and the cancellations are handed to `dayBlocks` so a double is
    // not merged across either: the half that still happens and the half that
    // does not have to be separate cells before either can be dimmed on its own.
    const blocks = dayBlocks(timetable, school, subjects, day, week, endsAfter, onDay?.cancelled);
    const span = daySpan(blocks);

    // Free periods after the day's last drawn lesson are a gap before something
    // that got folded away, so drawing "free" there would name a gap nobody has.
    const lastDrawn = blocks.reduce(
      (last, b) =>
        b.kind === 'lesson' && (foldAfter === null || b.periods[0] <= foldAfter)
          ? Math.max(last, b.periods[b.periods.length - 1])
          : last,
      -1,
    );

    const cells: PlacedCell[] = [];
    // The afternoon's lessons, kept as blocks until the row is complete: how
    // much of the column each entry has depends on how many there are, and
    // both the code's size and whether a time fits depend on that share.
    const folded: LessonBlock[] = [];
    let lastLessonRow = -1;
    let lastLessonEnd: string | undefined;

    // One fade rule for both reasons a period is off: `dayBlocks` marked it.
    const fade = (block: { off?: OffReason }) => block.off !== undefined;

    for (const block of blocks) {
      if (block.kind === 'care') {
        if (preset.careRow && careRow >= 0) {
          cells.push({
            rowStart: careRow,
            rowEnd: careRow + 1,
            faded: false,
            cell: {
              kind: 'care',
              careName: block.label,
              until: block.end,
              form: careForm(block.label, rich, isFocus),
            },
          });
        }
        continue;
      }

      if (foldAfter !== null && block.periods[0] > foldAfter) {
        // Only lessons survive the fold: an empty afternoon is what got folded away.
        if (block.kind !== 'lesson' || foldRow < 0) continue;
        folded.push(block);
        lastLessonRow = Math.max(lastLessonRow, foldRow);
        if (!fade(block)) lastLessonEnd = block.end;
        continue;
      }

      if (block.kind === 'free' && block.periods[0] > lastDrawn) continue;

      const placed = block.periods.filter((p) => rowOfPeriod.has(p));
      if (!placed.length) continue;
      const rowStart = rowOfPeriod.get(placed[0])!;
      const rowEnd = rowOfPeriod.get(placed[placed.length - 1])! + 1;
      const faded = fade(block);

      if (block.kind === 'free') {
        const late = preset.late && span !== null && block.periods[0] < span.firstPeriod;
        cells.push({
          rowStart,
          rowEnd,
          faded,
          cell: {
            kind: 'free',
            periods: placed,
            rich,
            lateStart: late ? span.start : undefined,
            ...(late ? { lateStartWord: lateStartWordFits(rich) } : {}),
          },
        });
        continue;
      }

      if (block.kind === 'lunch') {
        cells.push({
          rowStart,
          rowEnd,
          faded,
          cell: { kind: 'lunch', periods: placed, showLabel: detail === 'more' },
        });
        continue;
      }

      lastLessonRow = Math.max(lastLessonRow, rowEnd - 1);
      // A lesson the day no longer reaches is drawn faded and must not set the
      // going-home time: a day that ends after period 4 goes home when period 4
      // does, not when the grid happens to run out.
      if (!faded) lastLessonEnd = block.end;

      const label = labelOf(block.subject, rich);
      const showRoom = rich ? preset.rooms !== false : preset.rooms === 'all';
      const badged = block.course !== undefined && block.course !== badgedCourse;
      const room = showRoom && block.room ? roomForm(block.room.length, rich) : 'none';
      cells.push({
        rowStart,
        rowEnd,
        faded,
        cell: {
          kind: 'lesson',
          periods: placed,
          start: block.start,
          end: block.end,
          subject: block.subject,
          ...label,
          course: badged && badgeFits(block.course!.length, label.label.length, label.labelStyle === 'name', rich)
            ? block.course
            : undefined,
          ...(room !== 'none' && block.room
            ? { room: block.room, roomWord: room === 'word' }
            : {}),
          ...(rich && preset.times === 'range' ? { timeRange: { start: block.start, end: block.end } } : {}),
          rich,
          labelLines: metrics.focusLabelLines,
          bring: rich && preset.pack === 'cell' && metrics.packChip ? block.subject.bring : undefined,
          showIcon: rich ? icons || detail !== 'less' : icons || (preset.names === 'all' && detail === 'more'),
          weekBadge: preset.ab && changedPeriods.has(`${day}:${block.periods[0]}`) ? week : undefined,
          double: block.double,
          ...(onDay?.tests.has(block.subject.id) ? { test: onDay.tests.get(block.subject.id) ?? '' } : {}),
          ...(block.off === 'cancelled' ? { cancelled: true } : {}),
        },
      });
    }

    if (folded.length && foldRow >= 0) {
      // The width an entry really gets: the whole column where one lesson has
      // the afternoon to itself, and half of it less the gap between them
      // where two share the row.
      const width = foldEntryWidthPx(metrics, rich, folded.length);
      const timePx = TIME_FIT_EM[format] * printPx(CARD_TEXT.room);
      cells.push({
        rowStart: foldRow,
        rowEnd: foldRow + 1,
        faded: fade(folded[0]),
        cell: {
          kind: 'folded',
          widthPx: width,
          // Budgeted for one line, because its row is short and carries a time
          // as well, and drawn on however many that row turned out to have:
          // a name the estimate was wrong about then keeps its tail instead of
          // giving it up to an ellipsis.
          labelLines: metrics.labelClamp.fold,
          entries: folded.map((block) => ({
            periods: block.periods,
            start: block.start,
            subject: block.subject,
            ...labelOf(block.subject, rich, width, FOLD_LABEL_LINES),
            showIcon: icons && detail !== 'less',
            showTime: timePx <= width,
            bring: rich && preset.pack === 'cell' && metrics.packChip ? block.subject.bring : undefined,
          })),
        },
      });
    }

    // A day school is shut has no time to come home at and nothing to pack
    // for. Both of those are worked out from the day's blocks, which know
    // nothing about a closure, and both are drawn outside the column a closure
    // replaces, so the card told a parent to pack a PE kit for Ascension Day.
    // The dated-exception path already draws this line: a lesson the day never
    // reaches deliberately sets no going-home time.
    const closed = focus.closedDays[day] !== undefined;

    if (isFocus && !closed) {
      // A dated exception stops the day at a bell, so the going-home time is
      // that bell and not where the grid happens to run out. It has to come
      // from the school rather than from the last block drawn: two lessons in
      // one subject are merged into a double, so a block can straddle the cut
      // and report an end two periods past it.
      const cut = endsAfter === undefined ? null : periodEndTime(school, endsAfter);
      const dayEnd = cut && lastLessonEnd
        ? (cut < lastLessonEnd ? cut : lastLessonEnd)
        : cut ?? lastLessonEnd;
      focusSpan = span ? { start: span.start, end: dayEnd ?? span.end } : null;
      const capForm = endCapForm();
      // The one-off things to bring go under the going-home line at Less and
      // Some, where the footer is not drawn; at More they join the footer.
      const chips = !preset.foot && onDay?.bring.length ? onDay.bring : undefined;
      const wantsCap = preset.endCap && dayEnd && capForm !== 'none';
      if ((wantsCap || chips) && lastLessonRow >= 0) {
        let start = lastLessonRow + 1;
        while (start < rows.length && rows[start].kind === 'break') start++;
        // The care band keeps its own row; everything above it is spare.
        const end = careRow >= 0 ? careRow : rows.length;
        if (start < end) {
          tail = {
            ...(wantsCap ? { endTime: dayEnd } : {}),
            rowStart: start,
            rowEnd: end,
            form: capForm === 'none' ? 'bare' : capForm,
            ...(chips ? { bring: chips } : {}),
          };
        }
      }
      if (preset.foot) footerBring = [...bringFor(blocks), ...(onDay?.bring ?? [])];
    }

    const wantsMonth = namesMonth(day);
    const head = dayHead(rich, isFocus, wantsMonth);
    if (isFocus) focusHead = head;

    days.push({
      day,
      date: focus.dayDates[day],
      isFocus,
      showDate: (showDayDates || isFocus) && head.showDate,
      showMonth: wantsMonth && head.showMonth,
      closedLabel: focus.closedDays[day],
      endsAfterPeriod: endsAfter,
      shortLabel: focus.shortDays[day]?.label,
      cells,
    });
  }

  const careUntil = school.care?.until[focus.focusDay];
  const header = headerForm();
  // A week nobody has filled in has no day to describe, and the line that
  // describes one said "no school", which is what a closed day says. The card
  // draws the words for an empty week instead of a grid, so the line goes.
  const emptyWeek = !hasLessons(timetable);
  const holidayShape = focus.holiday ? holidayForm() : 'none';
  const holidayLine = focus.holiday && holidayShape !== 'none'
    ? { ...focus.holiday, form: holidayShape }
    : undefined;

  return {
    emptyWeek,
    member: {
      id: input.member.id,
      name: input.member.name,
      color: input.member.color,
      initials: initialsOf(input.member.name),
    },
    className: timetable.className,
    detail,
    metrics,
    weekLetter: week,
    weekNumber: focus.weekNumber,
    header: {
      focusDay: focus.focusDay,
      focusDate: focus.focusDate,
      labelKind: focus.focusLabelKind,
      span: focusSpan ?? undefined,
      closedLabel: focus.closedDays[focus.focusDay],
      care: !preset.careRow && school.care && careUntil && header.meta === 'care'
        ? { name: school.care.name, until: careUntil }
        : undefined,
      compact: header.meta === 'compact',
      // Only the times are ever worth giving up: a card whose day line says
      // school is shut, or that there are no lessons, is saying the most
      // important thing on it in a few words that fit anywhere.
      hideMeta: emptyWeek
        || (header.meta === 'none'
          && focusSpan !== null
          && focus.closedDays[focus.focusDay] === undefined),
      showClass: header.className,
      showBadge: header.badge,
      pill: focusHead.pill,
      focusWord: focusHead.word,
    },
    rows,
    gutter,
    days,
    focusIndex: DAY_KEYS.indexOf(focus.focusDay),
    // A week that is not this one has to say which week it is, whatever the
    // Detail setting, or Monday could be any Monday.
    showDayDates,
    tail,
    footer: preset.foot ? { bring: footerBring ?? undefined, ...footerNotes(), legend: changed } : undefined,
    holiday: holidayLine,
  };

  /**
   * The lit day's tests, and tomorrow's notes while the card is on today: the
   * footer is the one place with the words for "Tomorrow: maths test".
   */
  function footerNotes(): { tests?: string[]; tomorrow?: { tests: string[]; cancelled: number[] } } {
    const today = focus.notes[focus.focusDay];
    const tests = today && today.tests.size ? [...today.tests.values()].map((name) => name ?? '') : undefined;
    if (focus.focusLabelKind !== 'today') return tests ? { tests } : {};
    const next = notesOn(timetable, addDays(focus.focusDate, 1));
    const cancelled = [...next.cancelled].sort((a, b) => a - b);
    const nextTests = [...next.tests.values()].map((name) => name ?? '');
    const tomorrow = nextTests.length || cancelled.length ? { tests: nextTests, cancelled } : undefined;
    return { ...(tests ? { tests } : {}), ...(tomorrow ? { tomorrow } : {}) };
  }
}
