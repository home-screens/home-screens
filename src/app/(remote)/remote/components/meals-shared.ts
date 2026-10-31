import type { MealCourseKind, MealSlotType, SavedMeal, PlannedMeal, MealSettings } from '@/types/config';
import { toISODate, getActiveSlot, alignToWeekStart, formatTagLabel, type ResolvedPlanEntry } from '@/lib/meal-constants';
import { isMealieMeal, splitMinutes, type ShownMinutes } from '@/lib/meal-dish-rules';
import { UI_SANS_STACK } from '@/lib/font-registry';

/**
 * Compute the 7 dates of the week containing `referenceDate`, aligned to
 * the household's `weekStartDay`. Returns each date plus its `dayIndex`
 * (0=Sun…6=Sat). Callers that need a localized day-of-week name should look
 * it up via `getLocalizedDayNames(locale)[dayIndex]`, and a short date via
 * `formatShortDayMonth(date, locale)`. Keeping locale resolution out of this
 * helper makes it usable from non-React code paths.
 *
 * `referenceDate` is read through its local getters, so "this week" must be
 * the household's clock (`useHouseholdNow`), not `new Date()`: a phone in
 * another zone is on a different day around midnight and on Sunday night a
 * different week.
 */
export function getWeekDates(
  referenceDate: Date,
  weekStartDay: 'sunday' | 'monday' = 'sunday',
): { date: string; dayIndex: number }[] {
  const start = alignToWeekStart(referenceDate, weekStartDay);
  const result: { date: string; dayIndex: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    result.push({ date: toISODate(d), dayIndex: d.getDay() });
  }
  return result;
}

/**
 * Get the currently-active meal slot based on the current hour and the
 * household's enabled slots. Returns the slot type, not an index, so callers
 * can compare directly against `slot === activeSlot` without index aliasing.
 *
 * `now` is the household's ticking wall clock (`useHouseholdNow`), so the
 * slot follows the hour at home rather than the phone's, and advances as the
 * clock crosses slot boundaries.
 */
export function currentActiveSlot(
  enabledSlots: MealSlotType[],
  now: Date,
): MealSlotType | null {
  return getActiveSlot(now.getHours(), enabledSlots);
}

// Meal forms use slightly more compact inputs than chore forms
export const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--hs-text-muted)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  marginBottom: 6,
};

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  minHeight: 44,
  fontSize: 14,
  background: 'var(--hs-bg-panel)',
  border: '1px solid var(--hs-border)',
  borderRadius: 10,
  color: 'var(--hs-text-primary)',
  outline: 'none',
  fontFamily: UI_SANS_STACK,
};

// Section heading shared by the meal-settings sheet's sections
export const SECTION_HEADING_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--hs-text-faint)',
  margin: '0 0 8px',
};

export const CARD_STYLE: React.CSSProperties = {
  background: 'var(--hs-bg-card)',
  border: '1px solid var(--hs-border)',
  borderRadius: 12,
  padding: 14,
};

/**
 * The sub-views the Meals tab switches between, in nav order. The array is the
 * source of truth: `MealsSubNav` maps over it, so a new member renders a tab
 * instead of silently existing only in the type.
 */
export const MEALS_SUB_VIEWS = ['week', 'plan', 'library', 'grocery'] as const;

export type MealsSubView = (typeof MEALS_SUB_VIEWS)[number];

/**
 * A pending destructive action awaiting confirmation. The Meals tab keeps at
 * most one of these at a time and renders it as a `ConfirmSheet`.
 */
export interface MealsConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  /** The answer button's colour; red, for something that removes meals, unless given. */
  confirmColor?: string;
  onConfirm: () => void;
}

export interface MealsViewProps {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  weekDates: ReturnType<typeof getWeekDates>;
  todayISO: string;
  /** Slot type currently in its time window (e.g. "dinner" between 5pm–9pm), or null if outside any window */
  activeSlot: MealSlotType | null;
  /**
   * One slot of the viewed week, ready to draw (`resolveMealWithEntry`): the
   * dish it leads with, its name, and the courses after it.
   */
  getMealForSlot: (date: string, slot: MealSlotType) => ResolvedPlanEntry;
  /** Shared meal settings — drives enabled slots, week start, default times */
  settings: MealSettings;
}

/**
 * What the recipe picker is choosing: the main dish, a new course, or a
 * replacement for the course at `index`. An empty slot opens the picker for
 * its main dish straight away; the meal sheet opens it for the rest.
 */
export type MealPickTarget =
  | { date: string; slot: MealSlotType; pick: 'main' }
  | { date: string; slot: MealSlotType; pick: 'add'; kind: MealCourseKind }
  | { date: string; slot: MealSlotType; pick: 'swap'; kind: MealCourseKind; index: number };

/** A planned meal, by day and slot: the one the meal sheet is open on. */
export interface MealSlotRef {
  date: string;
  slot: MealSlotType;
}

/**
 * A cooking time as the phone prints it ("45m", "1h", "2h 20m"), with the
 * words from the `remote` dictionary. A meal of the family's own says "prep"
 * where the sentence has room for it (`withPrep`).
 */
export function formatShownMinutes(
  shown: ShownMinutes,
  t: (key: string, vars?: Record<string, string | number>) => string,
  withPrep = false,
): string {
  const { hours, minutes } = splitMinutes(shown.minutes);
  const time = hours === 0
    ? t('mealsTab.duration.minutes', { minutes })
    : minutes === 0
      ? t('mealsTab.duration.hours', { hours })
      : t('mealsTab.duration.hoursMinutes', { hours, minutes });
  return withPrep && shown.kind === 'prep' ? t('mealsTab.duration.prep', { time }) : time;
}

/**
 * A tag as the phone prints it. The family's own tags are stored lowercase
 * ("kid-friendly") and are dressed up; Mealie's categories and tags are
 * names the family typed and are shown as typed.
 */
export function mealTagLabel(meal: Pick<SavedMeal, 'id'>, tag: string): string {
  return isMealieMeal(meal) ? tag : formatTagLabel(tag);
}

/** Open a page of Mealie's in a new tab, leaving the phone on the Meals tab. */
export function openOutside(url: string | undefined): void {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
