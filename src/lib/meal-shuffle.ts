import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { SLOT_TAGS } from '@/lib/meal-constants';

/** Slot tag names that restrict which slot a meal can be assigned to */
const SLOT_TAG_SET = new Set<string>(SLOT_TAGS);

/**
 * Generate a random meal plan that respects slot tags.
 *
 * - Meals tagged with slot names (breakfast, lunch, dinner, snack) only appear in matching slots
 * - Meals with no slot tags can go in any slot
 * - ~65% of slots are filled (controlled by `fillRate`)
 *
 * @param weekDates — 7 ISO date strings for the target week
 */
export function generateRandomPlan(
  savedMeals: SavedMeal[],
  slots: MealSlotType[],
  weekDates: string[],
  fillRate = 0.65,
): PlannedMeal[] {
  if (savedMeals.length === 0) return [];

  const plan: PlannedMeal[] = [];
  for (const date of weekDates) {
    for (const slot of slots) {
      if (Math.random() > fillRate) continue;

      const eligible = savedMeals.filter((m) => {
        const mealSlotTags = m.tags?.filter((t) => SLOT_TAG_SET.has(t.toLowerCase()));
        if (!mealSlotTags || mealSlotTags.length === 0) return true;
        return mealSlotTags.some((t) => t.toLowerCase() === slot);
      });

      if (eligible.length > 0) {
        const meal = eligible[Math.floor(Math.random() * eligible.length)];
        plan.push({ date, slot, mealId: meal.id });
      }
    }
  }
  return plan;
}
