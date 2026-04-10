import type { MealSlotType, SavedMeal, PlannedMeal, MealSettings } from '@/types/config';
import { DAY_NAMES_FULL, toISODate, getActiveSlot, alignToWeekStart } from '@/lib/meal-constants';

/**
 * Compute the 7 dates of the week containing `referenceDate`, aligned to
 * the household's `weekStartDay`. Labels are derived from the actual day-of-week
 * of each date so they're correct regardless of week-start day.
 */
export function getWeekDates(
  referenceDate?: Date,
  weekStartDay: 'sunday' | 'monday' = 'sunday',
): { date: string; dayIndex: number; label: string; shortDate: string }[] {
  const start = alignToWeekStart(referenceDate ?? new Date(), weekStartDay);
  const result: { date: string; dayIndex: number; label: string; shortDate: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayIdx = d.getDay();
    result.push({
      date: toISODate(d),
      dayIndex: dayIdx,
      label: DAY_NAMES_FULL[dayIdx],
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

export const CARD_STYLE: React.CSSProperties = {
  background: 'var(--hs-bg-card)',
  border: '1px solid var(--hs-border)',
  borderRadius: 12,
  padding: 14,
};

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
