import type { MealSlotType, SavedMeal, PlannedMeal } from '@/types/config';

export const SLOT_META: Record<MealSlotType, { label: string; color: string }> = {
  breakfast: { label: 'Breakfast', color: '#f59e0b' },
  lunch:     { label: 'Lunch',     color: '#10b981' },
  dinner:    { label: 'Dinner',    color: '#6366f1' },
  snack:     { label: 'Snack',     color: '#ec4899' },
};

export const SLOT_ORDER: MealSlotType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const TAG_OPTIONS = ['Quick', 'Healthy', 'Comfort', 'Kid-Friendly', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Spicy', 'Batch Cook'];

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
      label: DAY_NAMES[i],
      shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
    });
  }
  return result;
}

export function currentSlotIndex(): number {
  const h = new Date().getHours();
  if (h < 10) return 0;   // breakfast
  if (h < 14) return 1;   // lunch
  if (h < 20) return 2;   // dinner
  return 3;                // snack
}

export const inputStyle: React.CSSProperties = {
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

export const cardStyle: React.CSSProperties = {
  background: '#171717',
  border: '1px solid #262626',
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
