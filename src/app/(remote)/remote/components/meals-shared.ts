import type { MealSlotType, SavedMeal, PlannedMeal } from '@/types/config';
import { SLOT_ORDER, SLOT_WINDOWS, DAY_NAMES_FULL, toISODate } from '@/lib/meal-constants';

export function getWeekDates(startDate?: Date): { date: string; dayIndex: number; label: string; shortDate: string }[] {
  const now = startDate ?? new Date();
  const currentDay = now.getDay(); // 0=Sun
  const result: { date: string; dayIndex: number; label: string; shortDate: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - currentDay + i);
    const isoDate = toISODate(d);
    result.push({
      date: isoDate,
      dayIndex: i,
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
  todayISO: string;
  currentSlot: number;
  getMealForSlot: (date: string, slot: MealSlotType) => { planned: PlannedMeal | undefined; meal: SavedMeal | undefined };
}
