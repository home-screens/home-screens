import type { MealSlotType, SavedMeal, PlannedMeal, MealSettings } from '@/types/config';
import { toISODate, getActiveSlot, alignToWeekStart } from '@/lib/meal-constants';

/**
 * Compute the 7 dates of the week containing `referenceDate`, aligned to
 * the household's `weekStartDay`. Returns each date plus its `dayIndex`
 * (0=Sun…6=Sat) and a `shortDate` like "4/8". Callers that need a localized
 * day-of-week name should look it up via `getLocalizedDayNames(locale)[dayIndex]`
 * — keeping locale resolution out of this helper makes it usable from
 * non-React code paths.
 */
export function getWeekDates(
  referenceDate?: Date,
  weekStartDay: 'sunday' | 'monday' = 'sunday',
): { date: string; dayIndex: number; shortDate: string }[] {
  const start = alignToWeekStart(referenceDate ?? new Date(), weekStartDay);
  const result: { date: string; dayIndex: number; shortDate: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayIdx = d.getDay();
    result.push({
      date: toISODate(d),
      dayIndex: dayIdx,
      shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
    });
  }
  return result;
}

/**
 * Get the currently-active meal slot based on the current hour and the
 * household's enabled slots. Returns the slot type, not an index, so callers
 * can compare directly against `slot === activeSlot` without index aliasing.
 *
 * Callers that care about the slot advancing as the wall clock crosses
 * slot boundaries should pass a tick-driven `now` (e.g. via `useState` +
 * `setInterval`). The default `new Date()` is only correct at first render.
 */
export function currentActiveSlot(
  enabledSlots: MealSlotType[],
  now: Date = new Date(),
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
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
  onConfirm: () => void;
}

export interface MealsViewProps {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  weekDates: ReturnType<typeof getWeekDates>;
  todayISO: string;
  /** Slot type currently in its time window (e.g. "dinner" between 5pm–9pm), or null if outside any window */
  activeSlot: MealSlotType | null;
  /** Current wall-clock hour (0–23). Driven by a tick in the parent so views
   *  can fade out past slots without reading `new Date()` at render time. */
  currentHour: number;
  getMealForSlot: (date: string, slot: MealSlotType) => { planned: PlannedMeal | undefined; meal: SavedMeal | undefined };
  /** Shared meal settings — drives enabled slots, week start, default times */
  settings: MealSettings;
}
