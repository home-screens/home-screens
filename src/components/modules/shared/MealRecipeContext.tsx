'use client';

import { createContext, useContext } from 'react';
import type { MealSettings, MealSlotType, PlannedMeal, SavedMeal, TimeFormat } from '@/types/config';
import type { ResolvedCourse } from '@/lib/meal-courses';
import { currentMealSlot, minutesOfDay, resolveMealWithEntry, resolvePlannedMealTime, toISODate } from '@/lib/meal-constants';
import type { RecipeServing } from './RecipeSheet';

/**
 * What a recipe card opened from any meal view needs beyond the meal itself:
 * the plan it was tapped in (for the badge and the courses), the household's
 * time format, and the full-screen theme the card is drawn in. Provided by
 * both Meal Planner modules around their views, so the nine views never pass
 * it down by hand.
 */
export interface MealRecipeContextValue {
  /** The display's full-screen theme (Settings > Screen), or the module's own. */
  theme: string | undefined;
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  settings: MealSettings;
  timeFormat: TimeFormat;
  now: Date;
}

export const MealRecipeContext = createContext<MealRecipeContextValue | null>(null);

export function useMealRecipeContext(): MealRecipeContextValue | null {
  return useContext(MealRecipeContext);
}

/** The day and meal a tapped dish was planned for. */
export interface MealServingRef {
  date: string;
  slot: MealSlotType;
}

/**
 * The badge, the other dishes and the batch for `meal` as planned at `at`.
 * For the dish the meal leads with, its courses; for one of its courses (a
 * dessert opened from the card), the main dish and the other courses, so the
 * card can go back. "Now" only while that meal is being served.
 */
export function recipeServingAt(
  ctx: MealRecipeContextValue | null,
  at: MealServingRef | undefined,
  meal: SavedMeal,
): { serving: RecipeServing | null; courses: ResolvedCourse[]; scale: number } {
  if (!ctx || !at) return { serving: null, courses: [], scale: 1 };
  const resolved = resolveMealWithEntry(at.date, at.slot, ctx.plan, ctx.savedMeals);
  const defaults = ctx.settings.defaultSlotTimes;
  const today = toISODate(ctx.now);
  const now = at.date === today
    && currentMealSlot(today, minutesOfDay(ctx.now), ctx.settings.enabledSlots, ctx.plan, ctx.savedMeals, defaults) === at.slot;
  const time = resolvePlannedMealTime(resolved.planned, at.slot, defaults);
  const serving = { slot: at.slot, ...(time ? { time } : {}), now };
  if (resolved.meal?.id === meal.id) return { serving, courses: resolved.courses, scale: resolved.scale };
  const course = resolved.courses.find((c) => c.meal?.id === meal.id);
  if (!course) return { serving, courses: [], scale: 1 };
  // The dish the meal leads with goes back in as what it is (a side, when the
  // meal has no main) and with its own batch.
  const lead: ResolvedCourse[] = resolved.name
    ? [{ kind: resolved.kind, meal: resolved.meal, name: resolved.name, ...(resolved.scale !== 1 ? { scale: resolved.scale } : {}) }]
    : [];
  return { serving, courses: [...lead, ...resolved.courses.filter((c) => c !== course)], scale: course.scale ?? 1 };
}
