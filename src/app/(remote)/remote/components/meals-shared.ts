import type { MealSlotType, SavedMeal, PlannedMeal, MealSettings } from '@/types/config';
import { toISODate, fromISODate, type ResolvedPlanEntry } from '@/lib/meal-constants';
import { splitMinutes } from '@/lib/meal-dish-rules';
import { UI_SANS_STACK } from '@/lib/font-registry';

/**
 * One day of the week the Meals tab shows: its date and its `dayIndex`
 * (0=Sun…6=Sat), for a localized name via `getLocalizedDayNames(locale)`.
 */
export interface MealsWeekDay {
  date: string;
  dayIndex: number;
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
  weekDates: MealsWeekDay[];
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

/** A planned meal, by day and slot: the one the meal sheet is open on. */
export interface MealSlotRef {
  date: string;
  slot: MealSlotType;
}

/**
 * A cooking time (`mealShownMinutes`) as the phone prints it ("45m", "1h",
 * "2h 20m"), with the words from the `remote` dictionary.
 */
export function formatShownMinutes(
  total: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const { hours, minutes } = splitMinutes(total);
  if (hours === 0) return t('mealsTab.duration.minutes', { minutes });
  if (minutes === 0) return t('mealsTab.duration.hours', { hours });
  return t('mealsTab.duration.hoursMinutes', { hours, minutes });
}

/** Open a page of Mealie's in a new tab, leaving the phone on the Meals tab. */
export function openOutside(url: string | undefined): void {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
