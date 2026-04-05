import type { FullscreenMealPlannerConfig, SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { SLOT_ORDER, SLOT_WINDOWS, resolveMeal, DIFFICULTY_COLORS } from '@/lib/meal-constants';

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

export function getDifficultyColor(difficulty: string | undefined): string | undefined {
  if (!difficulty) return undefined;
  return DIFFICULTY_COLORS[difficulty];
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
