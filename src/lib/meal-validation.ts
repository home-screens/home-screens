import { validateFamilyMealRatings } from './meal-ratings';
import { isRecord } from './member-references/contract';

/**
 * The shape rules for what `meals.json` holds, shared by the meal save route
 * and a backup restore so a restored file is one every later save accepts.
 * Pure: `meal-data.ts` owns the file and its migrations.
 */

/** Why a saved meal list cannot be written, or null. */
export function validateSavedMeals(meals: unknown): string | null {
  if (!Array.isArray(meals)) return 'Meals need a list of saved meals.';
  if (meals.some((meal) => !isRecord(meal) || typeof meal.id !== 'string' || !meal.id || typeof meal.name !== 'string')) {
    return 'Each saved meal needs an id and a name.';
  }
  // An ingredient is `{ name, amount? }`. A bare string was stored once by a
  // hand-written import and then counted as no recipe at all: the recipe book
  // left the meal out under a hint saying meals with ingredients show there.
  if (meals.some((meal) => isRecord(meal) && meal.ingredients !== undefined
    && (!Array.isArray(meal.ingredients) || meal.ingredients.some((i) => !isRecord(i) || typeof i.name !== 'string')))) {
    return 'Each ingredient needs a name, written as { "name": "Flour", "amount": "2 cups" }.';
  }
  return null;
}

/** Why a meal plan cannot be written, or null. An entry from an older build keeps a day number; the store turns it into a date on read. */
export function validateMealPlan(plan: unknown): string | null {
  if (!Array.isArray(plan)) return 'Meals need a plan.';
  if (plan.some((entry) => !isRecord(entry) || (typeof entry.date !== 'string' && typeof entry.day !== 'number'))) {
    return 'Each planned meal needs a day.';
  }
  return null;
}

/**
 * Why a whole meals file cannot be written, or null. Grocery ticks and
 * settings are not checked: the store keeps only a map of week to ticked
 * names and reads anything else as nothing ticked, which is how the single
 * list in a backup from an older build restores, and settings are filled in
 * on read.
 */
export function validateMealData(raw: unknown): string | null {
  if (!isRecord(raw)) return 'Meals need saved meals and a plan.';
  // Ratings are optional in older backups, but malformed votes must not be restored.
  return validateSavedMeals(raw.savedMeals) ?? validateMealPlan(raw.plan) ?? validateFamilyMealRatings(raw.familyRatings);
}
