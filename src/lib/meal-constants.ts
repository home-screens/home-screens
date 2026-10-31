import { localISODate } from './timezone';
import { formatClockTime } from './clock-time';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings, MealPlanSource, FullscreenTypographySize, TimeFormat } from '@/types/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { resolveCourses, type ResolvedCourse } from './meal-courses';

// ── Shared defaults (used across editor + remote + config sections) ────

/** Default accent color used throughout the app */
export const DEFAULT_ACCENT_COLOR = '#f59e0b';

/** Default emoji for meals with no emoji set */
export const DEFAULT_MEAL_EMOJI = '🍽️';

/**
 * A family's own picture in the compact meal grids, relative to the 0.8em an
 * emoji is drawn at there: an emoji reads at that size, a photo is a speck.
 */
export const GRID_PICTURE_SIZE = '1.4em';

/**
 * Typography size options for fullscreen modules.
 *
 * Each option carries an `i18nKey` (resolved against the `editor` namespace
 * at the call site via `tOrFallback`) plus a `label` English fallback. Both
 * fullscreen-meal-planner and fullscreen-chore-chart config sections
 * translate at render time so the dropdown reads in the active locale.
 */
export const TYPOGRAPHY_SIZES: { value: FullscreenTypographySize; label: string; i18nKey: string }[] = [
  { value: 'small',       label: 'Small',       i18nKey: 'common.typographySizes.small' },
  { value: 'medium',      label: 'Medium',      i18nKey: 'common.typographySizes.medium' },
  { value: 'large',       label: 'Large',       i18nKey: 'common.typographySizes.large' },
  { value: 'extra-large', label: 'Extra Large', i18nKey: 'common.typographySizes.extra-large' },
  { value: '2x-large',    label: '2X Large',    i18nKey: 'common.typographySizes.2x-large' },
  { value: '3x-large',    label: '3X Large',    i18nKey: 'common.typographySizes.3x-large' },
  { value: '4x-large',    label: '4X Large',    i18nKey: 'common.typographySizes.4x-large' },
];

/**
 * Default meal slots when none configured (excludes snack).
 * Internal — only used by `DEFAULT_MEAL_SETTINGS` below. Not part of the
 * module's public API; consumers should read from `DEFAULT_MEAL_SETTINGS`
 * or the household's actual `MealSettings`.
 */
const DEFAULT_SLOTS: readonly MealSlotType[] = ['breakfast', 'lunch', 'dinner'];

/** Difficulty level colors (hex) */
export const DIFFICULTY_COLORS: Record<string, string> = {
  easy:   '#10b981',
  medium: '#f59e0b',
  hard:   '#ef4444',
};

// ── Meal tags & emoji constants (shared across editor + remote) ────

/** Slot tags — meals tagged with these only appear in the matching slot during shuffle */
export const SLOT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** All available meal tags (lowercase canonical form). Slot tags first, then dietary/style. */
export const MEAL_TAGS = [
  ...SLOT_TAGS,
  'quick', 'healthy', 'vegetarian', 'vegan', 'comfort',
  'spicy', 'kid-friendly', 'meal-prep', 'gluten-free', 'dairy-free', 'batch-cook',
] as const;

/**
 * Library filter pills, in both the editor and the phone: everything, the
 * favorites, the kinds of dish that are not a main, then tags. Applied by
 * `filterLibraryMeals`.
 */
export const LIBRARY_FILTERS = [
  'all', 'favorites', 'side', 'dessert', 'drink', 'quick', 'healthy', 'comfort', 'kid-friendly',
] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

/** Emoji picker grid for meal detail form */
export const FOOD_EMOJIS = [
  '🍳', '🥞', '🧇', '🥣', '🥗', '🥪', '🌮', '🌯',
  '🍕', '🍔', '🍝', '🍜', '🍲', '🥘', '🍛', '🍣',
  '🍱', '🥩', '🍗', '🐟', '🥦', '🥕', '🌽', '🥑',
  '🍅', '🫑', '🧀', '🥚', '🍞', '🥐', '🍰', '🧁',
  '🍪', '🍩', '🍫', '🥤', '☕', '🍵', '🧃', '🥛',
  '🥧', '🍿', '🥜', '🫘', '🍓', '🍌', '🍎', '🥝',
] as const;

/** Normalize a tag to canonical form: 'Batch Cook' → 'batch-cook' */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, '-');
}

/** Capitalize a tag for display: 'kid-friendly' → 'Kid-Friendly' */
export function formatTagLabel(tag: string): string {
  return tag
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

/** Capitalize for simple labels: 'produce' → 'Produce' */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Slot visual config */
export const SLOT_META: Record<MealSlotType, { color: string; bg: string }> = {
  breakfast: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)' },
  lunch:     { color: '#10b981', bg: 'rgba(16, 185, 129, 0.10)' },
  dinner:    { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.10)' },
  snack:     { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.10)' },
};

/**
 * Translation-key helper for meal slot labels. Callers using
 * `useTranslate('modules')` pass the returned dotted path directly —
 * the namespace prefix is implicit.
 */
export function getMealSlotLabelKey(slot: MealSlotType): string {
  return `meal-planner.slots.${slot}`;
}

/** Canonical slot ordering — matches chronological time windows */
export const SLOT_ORDER: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/**
 * When a slot is usually served, for a meal with no time of its own in a
 * household that has not set one for the slot. Only the "now" rule reads
 * these (`mealServingTime`); a view prints a time only when the meal or the
 * household gave one.
 */
export const SLOT_USUAL_TIMES: Record<MealSlotType, string> = {
  breakfast: '07:30',
  lunch:     '12:00',
  snack:     '15:30',
  dinner:    '18:00',
};

/**
 * How long a meal counts as "now" around its serving time, in minutes.
 *
 * A quarter of an hour before is about when the family is called to the
 * table; before that the same meal shows as coming up, and a 5:30 dinner
 * marked now at 5:10 read as wrong. An hour and a half after covers a slow
 * meal and the clearing up, and is short enough that the 5:30 dinner hands
 * over to tomorrow's breakfast at 7 rather than holding the wall until
 * bedtime, as fixed hour windows (dinner was 5 to 9 PM whatever time it was
 * served) did. The next planned meal takes over as soon as its own quarter
 * hour starts, so two meals are never now at once (`mealPhases`).
 */
export const MEAL_NOW_WINDOW = { before: 15, after: 90 } as const;

const DAY_NAME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/**
 * Return 7 localized day-of-week names indexed 0=Sunday … 6=Saturday.
 *
 * Reads `Intl.DateTimeFormat` rather than date-fns, for two reasons that
 * only show up outside English. date-fns has no abbreviated weekday for
 * pt-BR — its `EEE` returns the whole word ("domingo"), which filled a
 * weekday column with a full word — and `formatDateSync` answers in
 * en-US when the locale's date-fns bundle has not been preloaded, so a
 * screen that rendered before the bundle landed showed English day names
 * to a household that reads none. Intl carries the CLDR abbreviations and
 * needs no preloading. Full names are identical either way in all seven
 * shipped locales.
 *
 * Formatters are cached per (locale, format): constructing one is
 * expensive enough to matter on a Pi.
 */
export function getLocalizedDayNames(
  locale: string = DEFAULT_LOCALE,
  format: 'short' | 'full' = 'full',
): string[] {
  const key = `${locale}|${format}`;
  let formatter = DAY_NAME_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { weekday: format === 'short' ? 'short' : 'long' });
    DAY_NAME_FORMATTERS.set(key, formatter);
  }
  // Anchor week: 2024-01-07 is a Sunday in every reasonable timezone
  // (it's noon UTC, well clear of the date boundary). We construct each
  // day with local-time `new Date(y, m, d)` so the result matches what
  // `Date.prototype.getDay()` would return at the consumer site.
  const result: string[] = new Array(7);
  for (let dow = 0; dow < 7; dow++) {
    const anchor = new Date(2024, 0, 7 + dow); // Sun Jan 7 + dow
    result[dow] = formatter.format(anchor);
  }
  return result;
}

/**
 * The days of `dates` in words, in calendar order and once each: "Saturday
 * and Sunday", for a notice that says which nights something changed.
 */
export function formatDayList(dates: readonly string[], locale: string = DEFAULT_LOCALE): string {
  const names = getLocalizedDayNames(locale, 'full');
  const days = [...new Set(dates)].sort().map((date) => names[dateToDayIndex(date)]);
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(days);
}

const MONTH_NAME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/**
 * Month names for a locale, index 0 = January, in the standalone form, so
 * languages that decline month names inside dates still get the dictionary
 * word. Editors that offer a month choice read this instead of carrying
 * twelve strings per locale.
 *
 * Reads `Intl.DateTimeFormat` for the same reason `getLocalizedDayNames`
 * does: the sync date-fns path answers in en-US until the locale's bundle
 * has been preloaded, which offered English month names to a non-English
 * editor. Intl needs no preloading.
 */
export function getLocalizedMonthNames(
  locale: string = DEFAULT_LOCALE,
  format: 'short' | 'full' = 'full',
): string[] {
  const key = `${locale}|${format}`;
  let formatter = MONTH_NAME_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: format === 'short' ? 'short' : 'long' });
    MONTH_NAME_FORMATTERS.set(key, formatter);
  }
  const result: string[] = new Array(12);
  for (let month = 0; month < 12; month++) {
    // Mid-month at local noon keeps the anchor clear of any date boundary.
    result[month] = formatter.format(new Date(2024, month, 15, 12));
  }
  return result;
}

const DAY_MONTH_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/**
 * A day's short numeric date for a YYYY-MM-DD string: "9/28" in en-US,
 * "28.9." in de-DE, "28/09" in fr-FR. Pass the formatting locale
 * (`useFormattingLocale`). Built by hand as month/day, "10/1" read as the
 * 10th of January in every other shipped language.
 */
export function formatShortDayMonth(date: string, locale: string = DEFAULT_LOCALE): string {
  let formatter = DAY_MONTH_FORMATTERS.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' });
    DAY_MONTH_FORMATTERS.set(locale, formatter);
  }
  return formatter.format(fromISODate(date));
}

/** Get ordered day indices based on week start */
export function getOrderedDays(weekStartDay: 'sunday' | 'monday'): number[] {
  if (weekStartDay === 'monday') return [1, 2, 3, 4, 5, 6, 0];
  return [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Align an arbitrary date to the start of its containing week, given the
 * household's `weekStartDay`. Returns a new Date — never mutates the input.
 *
 * Examples (Wed April 8 2026):
 *   alignToWeekStart(Wed Apr 8, 'sunday') → Sun Apr 5
 *   alignToWeekStart(Wed Apr 8, 'monday') → Mon Apr 6
 *
 * Idempotent for same-day-of-week inputs (a Sunday aligned to Sunday-start
 * returns the same Sunday). DST-safe — uses local-time `setDate`, which the
 * JS Date API handles correctly across spring-forward / fall-back boundaries.
 *
 * This is the canonical helper for the offset math; previously the same
 * `(dow + 6) % 7` vs `dow` calculation lived in five places across MealsTab,
 * meals-shared.ts, and the realign effect, which led to a "compounding offset"
 * bug when the math was applied to an already-aligned date.
 */
export function alignToWeekStart(date: Date, weekStartDay: 'sunday' | 'monday'): Date {
  const dow = date.getDay(); // 0 = Sunday
  const offset = weekStartDay === 'monday' ? ((dow + 6) % 7) : dow;
  const aligned = new Date(date);
  aligned.setDate(date.getDate() - offset);
  return aligned;
}

// ── Date utilities (ISO date string helpers for multi-week plans) ────

/** Format a Date as ISO date string "2026-04-04" */
export const toISODate = localISODate;

/** Parse an ISO date string back to a Date (noon local time to avoid DST boundary issues) */
export function fromISODate(s: string): Date {
  return new Date(s + 'T12:00:00');
}

/** Get the day-of-week index (0=Sun) for an ISO date string */
export function dateToDayIndex(date: string): number {
  return new Date(date + 'T12:00:00').getDay();
}

/** Get the ISO date range (start, end) for the week containing `referenceDate` */
export function getWeekRange(
  referenceDate: Date,
  weekStartDay: 'sunday' | 'monday' = 'sunday',
): { start: string; end: string } {
  const d = new Date(referenceDate);
  const dow = d.getDay();
  const startOffset = weekStartDay === 'monday' ? ((dow + 6) % 7) : dow;
  const start = new Date(d);
  start.setDate(d.getDate() - startOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

/** Return 7 ISO date strings for the week starting at `start` (already aligned) */
export function getWeekDatesForRange(
  start: string,
  weekStartDay: 'sunday' | 'monday' = 'sunday',
): string[] {
  const d = fromISODate(start);
  // If start isn't already aligned, align it
  const dow = d.getDay();
  const offset = weekStartDay === 'monday' ? ((dow + 6) % 7) : dow;
  d.setDate(d.getDate() - offset);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    dates.push(toISODate(day));
  }
  return dates;
}

/**
 * The week a planner left open should show once today rolls from `prevToday`
 * to `today`, as an aligned ISO week start. A viewer parked on the week that
 * held the old today moves with it, so a phone open past Sunday midnight lands
 * on the new week that "Clear week" and "Copy last week" will act on. A viewer
 * who navigated to another week stays there.
 */
export function weekStartAfterDayChange(
  viewedWeekStart: string,
  prevToday: string,
  today: string,
  weekStartDay: 'sunday' | 'monday' = 'sunday',
): string {
  const viewed = getWeekRange(fromISODate(viewedWeekStart), weekStartDay).start;
  if (viewed !== getWeekRange(fromISODate(prevToday), weekStartDay).start) return viewed;
  return getWeekRange(fromISODate(today), weekStartDay).start;
}

/** Filter plan entries to those within a date range (inclusive) */
export function filterPlanToWeek(
  plan: PlannedMeal[],
  start: string,
  end: string,
): PlannedMeal[] {
  return plan.filter((p) => p.date >= start && p.date <= end);
}

/** Replace one week's entries in the full plan (used for multi-week merge) */
export function replaceWeekInPlan(
  fullPlan: PlannedMeal[],
  weekDates: string[],
  newWeekEntries: PlannedMeal[],
): PlannedMeal[] {
  const weekSet = new Set(weekDates);
  const otherWeeks = fullPlan.filter((p) => !weekSet.has(p.date));
  return [...otherWeeks, ...newWeekEntries];
}

/**
 * What a slot is showing, from either kind of entry: the saved meal's name, or
 * the text somebody typed straight into the day.
 *
 * Every surface prints this rather than `meal.name`. A plan entry has always
 * been allowed to carry `customText` instead of a `mealId` — the phone writes
 * one when you type "Tacos" for tonight rather than saving it to the library —
 * and the views that read `meal.name` drew an empty slot for it, so the same
 * dinner showed on the phone and not on the wall.
 */
export function plannedMealName(
  meal: SavedMeal | null,
  planned: PlannedMeal | undefined,
): string | null {
  if (meal) return meal.name;
  const typed = planned?.customText?.trim();
  return typed ? typed : null;
}

/**
 * Resolve both the saved meal AND the planned-meal entry for a given date+slot,
 * so callers can access both the meal definition and per-instance fields like
 * `time` and `notes` without having to scan the plan twice.
 *
 * `name` is what to print; `meal` is null for a typed-in meal, which has no
 * library entry behind it and so no emoji, prep time, tags or recipe. Render
 * off `name`, and treat the extras as the optional trimmings they are.
 */
export function resolveMealWithEntry(
  date: string,
  slot: MealSlotType,
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
): ResolvedPlanEntry {
  if (!plan) return { meal: null, planned: undefined, name: null, courses: [], notes: [] };
  const planned = plan.find((p) => p.date === date && p.slot === slot);
  if (!planned) return { meal: null, planned: undefined, name: null, courses: [], notes: [] };
  const meal = planned.mealId && savedMeals
    ? savedMeals.find((m) => m.id === planned.mealId) ?? null
    : null;
  const name = plannedMealName(meal, planned);
  const courses = resolveCourses(planned, savedMeals);
  // A meal planned as only its courses (a dinner that is just a salad, or a
  // Mealie night with sides and no main) leads with its first course, so the
  // slot shows what is planned instead of looking empty.
  if (!name && courses.length > 0) {
    const [lead, ...rest] = courses;
    return { meal: lead.meal, planned, name: lead.name, courses: rest, notes: plannedMealNotes(planned, lead.meal) };
  }
  return { meal, planned, name, courses, notes: plannedMealNotes(planned, meal) };
}

/**
 * The notes a planned meal shows, the day's first: the one written on the
 * plan for that day ("Soccer practice until 6"; Mealie keeps a note on its
 * plan the same way), then the dish's own from the library ("Start it before
 * school drop-off"). One of them, or none, when that is all there is; the
 * same text twice shows once.
 */
function plannedMealNotes(planned: PlannedMeal, meal: SavedMeal | null): string[] {
  const day = planned.notes?.trim();
  const dish = meal?.notes?.trim();
  return [...new Set([day, dish].filter((note): note is string => !!note))];
}

/**
 * One slot of the plan, ready to draw: the main dish (or the first course
 * when there is none), the entry behind it, and the courses still to list.
 */
export interface ResolvedPlanEntry {
  meal: SavedMeal | null;
  planned: PlannedMeal | undefined;
  name: string | null;
  courses: ResolvedCourse[];
  /** The notes to show with it, the day's first (see `plannedMealNotes`); empty for none. */
  notes: string[];
}

export interface NextPlannedMeal {
  /** The library meal, or null when the slot holds a meal typed straight in. */
  meal: SavedMeal | null;
  /** What to print: the saved meal's name, or the typed text. */
  name: string;
  slot: MealSlotType;
  /** YYYY-MM-DD of the day the meal is planned for. */
  date: string;
  /** 0 = today, 1 = tomorrow, … */
  dayOffset: number;
  context: 'now' | 'upcoming' | 'tomorrow' | 'future';
  /** The meal's courses after the one it leads with. */
  courses: ResolvedCourse[];
  /** The notes to show with it, the day's first; empty for none. */
  notes: string[];
}

// ── Now and next, by serving time ───────────────────────────────────

/**
 * Minutes after midnight on a clock's own face. Pass the household's ticking
 * clock (`useTZClock`, `useHouseholdNow`), whose local fields are the time at
 * home.
 */
export function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** "18:30" as minutes after midnight. */
function clockMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * When a meal is served, for deciding what is on now: its own time, else the
 * household's time for the slot, else the slot's usual time.
 */
export function mealServingTime(
  planned: PlannedMeal | undefined,
  slot: MealSlotType,
  defaults: Partial<Record<MealSlotType, string>>,
): string {
  return resolvePlannedMealTime(planned, slot, defaults) ?? SLOT_USUAL_TIMES[slot];
}

/** Where a meal stands against the clock. */
export type MealTimePhase = 'later' | 'now' | 'over';

export interface ServedSlot {
  slot: MealSlotType;
  /** When it is served, in minutes after midnight (`mealServingTime`). */
  at: number;
  /** Whether a meal is planned in it. */
  planned: boolean;
}

/**
 * A day's slots in the order they are served: by serving time, so a brunch
 * set for 11:30 comes after a lunch at 11, and in the day's order when two
 * share a time.
 */
export function servingOrder(
  date: string,
  slots: readonly MealSlotType[],
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
  defaults: Partial<Record<MealSlotType, string>>,
): ServedSlot[] {
  return SLOT_ORDER.filter((slot) => slots.includes(slot))
    .map((slot) => {
      const { planned, name } = resolveMealWithEntry(date, slot, plan, savedMeals);
      return { slot, at: clockMinutes(mealServingTime(planned, slot, defaults)), planned: name !== null };
    })
    .sort((a, b) => a.at - b.at);
}

/**
 * Where each meal of `served` (in serving order) stands at `nowMinutes`, in
 * the same order. A meal is now from `MEAL_NOW_WINDOW.before` minutes before
 * its time until `.after` minutes after it, and over as soon as the next
 * one's window opens, so the next meal leads from then on.
 */
export function mealPhases(served: readonly { at: number }[], nowMinutes: number): MealTimePhase[] {
  return served.map(({ at }, i) => {
    const next = served[i + 1];
    const opens = at - MEAL_NOW_WINDOW.before;
    const closes = Math.min(at + MEAL_NOW_WINDOW.after, next ? next.at - MEAL_NOW_WINDOW.before : Infinity);
    if (nowMinutes < opens) return 'later';
    return nowMinutes < closes ? 'now' : 'over';
  });
}

/**
 * The slot of `date` whose meal is being served at `nowMinutes` (see
 * `mealPhases`), or null between meals. Only planned meals take turns, so an
 * empty lunch never holds "now" and a dinner keeps it until its own window
 * closes. The phone's This Week, the wall's Week and both Today views mark
 * their "now" with this, and `getNextPlannedMeal` leads with the same meal.
 */
export function currentMealSlot(
  date: string,
  nowMinutes: number,
  slots: readonly MealSlotType[],
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
  defaults: Partial<Record<MealSlotType, string>>,
): MealSlotType | null {
  const planned = servingOrder(date, slots, plan, savedMeals, defaults).filter((s) => s.planned);
  const now = mealPhases(planned, nowMinutes).indexOf('now');
  return now < 0 ? null : planned[now].slot;
}

/**
 * Walk forward from now to the first meal that is not over: the one being
 * served, else today's next, then up to a week ahead in serving order.
 * Both the small meal-planner card and the fullscreen Next Meal view resolve
 * through this, so the two can never disagree about what's next. Returns
 * null only when nothing is planned in the coming week.
 */
export function getNextPlannedMeal(
  todayISO: string,
  nowMinutes: number,
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
  slots: readonly MealSlotType[],
  defaults: Partial<Record<MealSlotType, string>> = {},
): NextPlannedMeal | null {
  const base = new Date(todayISO + 'T12:00:00');
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const d = new Date(base);
    d.setDate(base.getDate() + dayOffset);
    const date = toISODate(d);
    const served = servingOrder(date, slots, plan, savedMeals, defaults).filter((s) => s.planned);
    // Only today is under way; a later day starts from its first meal.
    const phases = mealPhases(served, dayOffset === 0 ? nowMinutes : -Infinity);
    for (let i = 0; i < served.length; i++) {
      if (phases[i] === 'over') continue;
      const { slot } = served[i];
      const { meal, name, courses, notes } = resolveMealWithEntry(date, slot, plan, savedMeals);
      if (!name) continue;
      const context = dayOffset === 0
        ? (phases[i] === 'now' ? 'now' : 'upcoming')
        : dayOffset === 1 ? 'tomorrow' : 'future';
      return { meal, name, slot, date, dayOffset, context, courses, notes };
    }
  }
  return null;
}

/** What a one-day view leads with; see `mealDayLead`. */
export interface MealDayLead {
  /** The day to show: today, or tomorrow once all of today is over. */
  date: string;
  /** The slot to lead with. */
  slot: MealSlotType;
  /** Whether that meal is being served now, rather than coming next. */
  now: boolean;
  /** The slots of that day already over. */
  over: MealSlotType[];
}

/**
 * What the full-screen Today view leads with at `nowMinutes`: the meal being
 * served, else today's next planned meal, else the next slot today with
 * nothing in it, so an unplanned dinner still shows as the evening's gap.
 * Once every slot of today is over the view moves on to tomorrow and leads
 * with its first meal, which is what Next meal shows by then. Null when no
 * slot is switched on.
 */
export function mealDayLead(
  todayISO: string,
  nowMinutes: number,
  slots: readonly MealSlotType[],
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
  defaults: Partial<Record<MealSlotType, string>>,
): MealDayLead | null {
  const served = servingOrder(todayISO, slots, plan, savedMeals, defaults);
  if (served.length === 0) return null;
  // Planned meals take turns as `currentMealSlot` has them; an empty slot is
  // timed on its own, as nobody's meal hands over to it.
  const planned = served.filter((s) => s.planned);
  const plannedPhases = mealPhases(planned, nowMinutes);
  const phaseOf = (s: ServedSlot) => (s.planned ? plannedPhases[planned.indexOf(s)] : mealPhases([s], nowMinutes)[0]);

  const lead = planned.find((s) => phaseOf(s) === 'now')
    ?? planned.find((s) => phaseOf(s) === 'later')
    ?? served.find((s) => phaseOf(s) !== 'over');
  if (lead) {
    return {
      date: todayISO,
      slot: lead.slot,
      now: phaseOf(lead) === 'now',
      over: served.filter((s) => phaseOf(s) === 'over').map((s) => s.slot),
    };
  }
  const next = fromISODate(todayISO);
  next.setDate(next.getDate() + 1);
  const tomorrow = toISODate(next);
  const tomorrowServed = servingOrder(tomorrow, slots, plan, savedMeals, defaults);
  const first = tomorrowServed.find((s) => s.planned) ?? tomorrowServed[0];
  return { date: tomorrow, slot: first.slot, now: false, over: [] };
}

/** Copy entries from one week to another, preserving day-of-week position */
export function copyWeekEntries(
  plan: PlannedMeal[],
  fromDates: string[],
  toDates: string[],
): PlannedMeal[] {
  const entries = filterPlanToWeek(plan, fromDates[0], fromDates[fromDates.length - 1]);
  return entries.map((entry) => {
    const idx = fromDates.indexOf(entry.date);
    return { ...entry, date: toDates[idx >= 0 ? idx : 0] };
  });
}

// ── Default MealSettings ────────────────────────────────────────────

/** Sensible defaults used when `data/meals.json` has no `settings` block yet */
export const DEFAULT_MEAL_SETTINGS: MealSettings = {
  enabledSlots: [...DEFAULT_SLOTS],
  weekStartDay: 'sunday',
  defaultSlotTimes: {},
};

// ── Settings normalization (shared by server reads and client fetches) ──

const VALID_SLOT_SET: ReadonlySet<MealSlotType> = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

/**
 * Validate an "HH:MM" 24h time string. Range-checks hours (0–23) and minutes
 * (0–59) — stricter than a regex alone, so '25:99' is rejected.
 */
function isValidTimeString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

/**
 * Coerce an unknown settings blob into a valid `MealSettings`, falling back
 * to defaults per-field. Used by both server reads (`readMealData`) and client
 * fetches (`useMealsData`) so the invariant is enforced on both sides — a
 * stale or partial API response can't crash subsequent renders.
 */
export function normalizeMealSettings(raw: unknown): MealSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_MEAL_SETTINGS, enabledSlots: [...DEFAULT_MEAL_SETTINGS.enabledSlots], defaultSlotTimes: {} };
  }
  const r = raw as Record<string, unknown>;

  const filteredSlots = Array.isArray(r.enabledSlots)
    ? r.enabledSlots.filter((s): s is MealSlotType => typeof s === 'string' && VALID_SLOT_SET.has(s as MealSlotType))
    : null;
  // Empty / all-invalid enabledSlots → fall back to defaults so the household
  // is never left with zero slots (which would silently render nothing everywhere).
  // Kept in the day's order, not the order they were switched on, so every
  // view lists a snack before dinner without sorting it itself.
  const enabledSlots: MealSlotType[] = filteredSlots && filteredSlots.length > 0
    ? SLOT_ORDER.filter((slot) => filteredSlots.includes(slot))
    : [...DEFAULT_MEAL_SETTINGS.enabledSlots];

  const weekStartDay: 'sunday' | 'monday' =
    r.weekStartDay === 'monday' || r.weekStartDay === 'sunday'
      ? r.weekStartDay
      : DEFAULT_MEAL_SETTINGS.weekStartDay;

  const defaultSlotTimes: Partial<Record<MealSlotType, string>> = {};
  if (r.defaultSlotTimes && typeof r.defaultSlotTimes === 'object') {
    for (const [k, v] of Object.entries(r.defaultSlotTimes as Record<string, unknown>)) {
      if (VALID_SLOT_SET.has(k as MealSlotType) && isValidTimeString(v)) {
        defaultSlotTimes[k as MealSlotType] = v;
      }
    }
  }

  const timeFormat: TimeFormat | undefined =
    r.timeFormat === '24h' || r.timeFormat === '12h' ? r.timeFormat : undefined;
  const planSource: MealPlanSource | undefined = r.planSource === 'mealie' ? r.planSource : undefined;

  return {
    enabledSlots,
    weekStartDay,
    defaultSlotTimes,
    ...(timeFormat ? { timeFormat } : {}),
    ...(planSource ? { planSource } : {}),
  };
}

// ── Time formatting & resolution ────────────────────────────────────

/**
 * Resolve the effective serving time for a planned meal:
 * the explicit `time` on the entry, or the default for that slot, or undefined.
 *
 * `defaults` is the household's `MealSettings.defaultSlotTimes` map (always present
 * post-normalization, may be empty `{}`).
 */
export function resolvePlannedMealTime(
  planned: PlannedMeal | undefined,
  slot: MealSlotType,
  defaults: Partial<Record<MealSlotType, string>>,
): string | undefined {
  if (planned?.time) return planned.time;
  return defaults[slot];
}

/**
 * Format an "HH:MM" 24-hour time string for display.
 * Honors the global timeFormat preference. Returns empty string for invalid input.
 *
 * Thin wrapper over the shared clock-time formatter so the meal planner and
 * every other surface that shows a time of day render it identically.
 *
 * Examples:
 *   formatMealTime('18:30', '12h') → '6:30 PM'
 *   formatMealTime('18:30', '24h') → '18:30'
 *   formatMealTime('07:00', '12h') → '7:00 AM'
 */
export function formatMealTime(
  time: string | undefined,
  format: TimeFormat,
): string {
  return formatClockTime(time, format);
}

/**
 * Effective meal time format: an explicit meal override wins, otherwise the
 * household's (already resolved, see `settingsTimeFormat`). Every
 * formatMealTime call site resolves through this so "follow global" stays
 * consistent across surfaces.
 */
export function resolveMealTimeFormat(
  meal: { timeFormat?: TimeFormat } | undefined | null,
  global: TimeFormat,
): TimeFormat {
  return meal?.timeFormat ?? global;
}

/**
 * Suggested time presets shown as quick-pick buttons in MealTimeChip.
 *
 * Hand-authored per slot to reflect realistic household eating times. Edit
 * this table directly to tune defaults per slot.
 */
export const SLOT_TIME_PRESETS: Record<MealSlotType, string[]> = {
  breakfast: ['06:00', '06:30', '07:00', '07:30'],
  lunch:     ['11:00', '11:30', '12:00', '12:30'],
  snack:     ['14:30', '15:00', '15:30', '16:00'],
  dinner:    ['17:30', '18:00', '18:30', '19:00'],
};

/**
 * Get suggested time presets for a given slot.
 * Returns 4 common eating times appropriate for the slot.
 *
 * Example: dinner → ['17:30', '18:00', '18:30', '19:00']
 */
export function getSlotTimePresets(slot: MealSlotType): string[] {
  return SLOT_TIME_PRESETS[slot];
}
