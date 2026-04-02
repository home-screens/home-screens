import type { FullscreenMealPlannerConfig, SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

export interface MealPlannerViewProps {
  config: FullscreenMealPlannerConfig;
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  now: Date;
  slots: MealSlotType[];
  activeSlot: MealSlotType | null;
  bu: number;
  s: number;
  pad: number;
  showEmoji: boolean;
  showPrepTime: boolean;
  showTags: boolean;
  showDifficulty: boolean;
  headerFont: string;
  bodyFont: string;
}

export const SLOT_META: Record<MealSlotType, { label: string; color: string }> = {
  breakfast: { label: 'Breakfast', color: '#f59e0b' },
  lunch:     { label: 'Lunch',     color: '#10b981' },
  dinner:    { label: 'Dinner',    color: '#6366f1' },
  snack:     { label: 'Snack',     color: '#ec4899' },
};

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const SLOT_ORDER: MealSlotType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const SLOT_WINDOWS: Record<MealSlotType, { start: number; end: number }> = {
  breakfast: { start: 5, end: 10 },
  lunch:     { start: 10, end: 14 },
  snack:     { start: 14, end: 17 },
  dinner:    { start: 17, end: 21 },
};

export function getDifficultyColor(difficulty: string | undefined): string | undefined {
  if (difficulty === 'easy') return '#10b981';
  if (difficulty === 'medium') return '#f59e0b';
  if (difficulty === 'hard') return '#ef4444';
  return undefined;
}

export function getOrderedDays(weekStartDay: 'sunday' | 'monday'): number[] {
  if (weekStartDay === 'monday') return [1, 2, 3, 4, 5, 6, 0];
  return [0, 1, 2, 3, 4, 5, 6];
}

export function resolveMeal(
  day: number,
  slot: MealSlotType,
  planArr: PlannedMeal[],
  meals: SavedMeal[],
): SavedMeal | null {
  const planned = planArr.find((p) => p.day === day && p.slot === slot);
  if (!planned) return null;
  if (planned.mealId) {
    return meals.find((m) => m.id === planned.mealId) ?? null;
  }
  return null;
}

export function getActiveSlot(hour: number, slots: MealSlotType[]): MealSlotType | null {
  const active = SLOT_ORDER.filter((s) => slots.includes(s));
  for (const s of active) {
    const w = SLOT_WINDOWS[s];
    if (hour >= w.start && hour < w.end) return s;
  }
  return null;
}

export function getNextMeal(
  now: Date,
  planArr: PlannedMeal[],
  meals: SavedMeal[],
  slots: MealSlotType[],
): { meal: SavedMeal; slot: MealSlotType; context: 'now' | 'upcoming' | 'tomorrow'; day: number } | null {
  const hour = now.getHours();
  const today = now.getDay();
  const activeOrder = SLOT_ORDER.filter((s) => slots.includes(s));
  if (activeOrder.length === 0) return null;

  // Currently in a slot window
  for (const s of activeOrder) {
    const w = SLOT_WINDOWS[s];
    if (hour >= w.start && hour < w.end) {
      const meal = resolveMeal(today, s, planArr, meals);
      if (meal) return { meal, slot: s, context: 'now', day: today };
    }
  }

  // Next upcoming slot today
  for (const s of activeOrder) {
    if (hour < SLOT_WINDOWS[s].start) {
      const meal = resolveMeal(today, s, planArr, meals);
      if (meal) return { meal, slot: s, context: 'upcoming', day: today };
    }
  }

  // First slot tomorrow
  const tomorrow = (today + 1) % 7;
  for (const s of activeOrder) {
    const meal = resolveMeal(tomorrow, s, planArr, meals);
    if (meal) return { meal, slot: s, context: 'tomorrow', day: tomorrow };
  }

  return null;
}

export function countPlanned(
  planArr: PlannedMeal[],
  totalSlots: number,
): { filled: number; total: number; pct: number } {
  const filled = planArr.filter((p) => p.mealId).length;
  return { filled, total: totalSlots, pct: totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 0 };
}
