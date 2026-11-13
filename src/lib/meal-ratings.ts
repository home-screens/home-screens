import type { PlannedMeal, SavedMeal } from '@/types/config';
import type { FamilyMealRating } from '@/types/meal-ratings';

export const MEAL_RATINGS_URL = '/api/meals/ratings';
export const MEAL_RATINGS_POLL_MS = 15_000;

export function validMealVote(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function validateFamilyMealRatings(value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return 'Family meal ratings must be a list.';
  const keys = new Set<string>();
  for (const vote of value) {
    if (!vote || typeof vote !== 'object' || typeof vote.mealId !== 'string' || !vote.mealId || vote.mealId.length > 200
      || typeof vote.memberId !== 'string' || !vote.memberId || vote.memberId.length > 200 || !validMealVote(vote.rating)
      || typeof vote.updatedAt !== 'string' || !Number.isFinite(Date.parse(vote.updatedAt))) return 'Each family meal rating needs a meal, a person, 1–5 stars and an edit date.';
    const key = JSON.stringify([vote.mealId, vote.memberId]);
    if (keys.has(key)) return 'A person can have only one rating for a recipe.';
    keys.add(key);
  }
  return null;
}

export function setFamilyMealRating(votes: FamilyMealRating[], mealId: string, memberId: string, rating: number | null, updatedAt: string): FamilyMealRating[] {
  const previous = votes.find((v) => v.mealId === mealId && v.memberId === memberId);
  if (previous?.rating === rating || (!previous && rating === null)) return votes;
  const rest = votes.filter((v) => v.mealId !== mealId || v.memberId !== memberId);
  return rating === null ? rest : [...rest, { mealId, memberId, rating, updatedAt }];
}

export function familyMealAverage(votes: readonly FamilyMealRating[], mealId: string, memberIds: ReadonlySet<string>): { average: number | null; count: number } {
  const own = votes.filter((v) => v.mealId === mealId && memberIds.has(v.memberId));
  return { average: own.length ? own.reduce((sum, v) => sum + v.rating, 0) / own.length : null, count: own.length };
}

export function dinnerRatingMeals(plan: PlannedMeal[], meals: SavedMeal[], date: string): SavedMeal[] {
  const ids = new Set<string>();
  for (const entry of plan) {
    if (entry.date !== date || entry.slot !== 'dinner') continue;
    if (entry.mealId) ids.add(entry.mealId);
    for (const course of entry.courses ?? []) if (course.mealId) ids.add(course.mealId);
  }
  return [...ids].flatMap((id) => { const meal = meals.find((m) => m.id === id); return meal ? [meal] : []; });
}
