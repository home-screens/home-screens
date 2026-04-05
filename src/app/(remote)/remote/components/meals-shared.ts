import type { MealSlotType, SavedMeal, PlannedMeal } from '@/types/config';
import { MEAL_TAGS, SLOT_TAGS, SLOT_ORDER, SLOT_WINDOWS, DAY_NAMES_FULL } from '@/lib/meal-constants';

/** Meal tags for the remote form — excludes slot tags (breakfast/lunch/dinner/snack) */
export const TAG_OPTIONS = (MEAL_TAGS as readonly string[])
  .filter((t) => !(SLOT_TAGS as readonly string[]).includes(t));

export function getWeekDates(): { day: number; date: Date; label: string; shortDate: string }[] {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun
  const result: { day: number; date: Date; label: string; shortDate: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - currentDay + i);
    result.push({
      day: i,
      date: d,
      label: DAY_NAMES_FULL[i],
      shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
    });
  }
  return result;
}

export function currentSlotIndex(): number {
  const h = new Date().getHours();
  // Derive thresholds from SLOT_WINDOWS so they stay in sync
  for (let i = 0; i < SLOT_ORDER.length; i++) {
    const w = SLOT_WINDOWS[SLOT_ORDER[i]];
    if (h < w.end) return i;
  }
  return SLOT_ORDER.length - 1;
}

// Meal forms use slightly more compact inputs than chore forms
export const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#a3a3a3',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  marginBottom: 6,
};

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  minHeight: 44,
  fontSize: 14,
  background: '#171717',
  border: '1px solid #262626',
  borderRadius: 10,
  color: '#fafafa',
  outline: 'none',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export const CARD_STYLE: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  padding: 14,
};

export interface MealsViewProps {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  weekDates: ReturnType<typeof getWeekDates>;
  today: number;
  currentSlot: number;
  getMealForSlot: (day: number, slot: MealSlotType) => { planned: PlannedMeal | undefined; meal: SavedMeal | undefined };
}
