import type { MealCourseKind, MealSlotType, SavedMeal, PlannedMeal, MealSettings } from '@/types/config';
import { toISODate, fromISODate, alignToWeekStart, type ResolvedPlanEntry } from '@/lib/meal-constants';
import { splitMinutes, type ShownMinutes } from '@/lib/meal-dish-rules';
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
 * Where the Meals tab was left, kept in the address beside the tab itself
 * (`?tab=meals&meals=plan&week=2026-11-02`), so a reload or a detour through
 * another tab comes back to it. `week` is the first day of the week shown,
 * null for the week holding today, which is where the tab opens anyway.
 */
export interface MealsPlace {
  view: MealsSubView;
  week: string | null;
}

/** The place an address keeps. Anything missing or not understood is This Week. */
export function readMealsPlace(search: string): MealsPlace {
  const params = new URLSearchParams(search);
  const view = MEALS_SUB_VIEWS.find((v) => v === params.get('meals')) ?? 'week';
  const week = params.get('week');
  return { view, week: week && toISODate(fromISODate(week)) === week ? week : null };
}

/** Write `place` into `url`, leaving This Week out. True when the address changed. */
export function writeMealsPlace(url: URL, place: MealsPlace): boolean {
  const before = url.search;
  if (place.view === 'week') url.searchParams.delete('meals');
  else url.searchParams.set('meals', place.view);
  if (place.week) url.searchParams.set('week', place.week);
  else url.searchParams.delete('week');
  return url.search !== before;
}

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
  /** Today's slot whose meal is being served now (`currentMealSlot`), or null between meals */
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

/** Open a page of Mealie's in a new tab, leaving the phone on the Meals tab. */
export function openOutside(url: string | undefined): void {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
