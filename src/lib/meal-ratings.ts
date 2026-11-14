import type { PlannedMeal, SavedMeal, MealSlotType } from '@/types/config';
import type { FamilyMealRating } from '@/types/meal-ratings';
import { fromISODate, mealServingTime, toISODate } from './meal-constants';
import { claimsMealieId } from './mealie-map';

export const MEAL_RATINGS_URL = '/api/meals/ratings';

export function validMealVote(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isVote(vote: unknown): vote is FamilyMealRating {
  if (!vote || typeof vote !== 'object') return false;
  const v = vote as Record<string, unknown>;
  return typeof v.mealId === 'string' && !!v.mealId && v.mealId.length <= 200
    && typeof v.memberId === 'string' && !!v.memberId && v.memberId.length <= 200
    && validMealVote(v.rating)
    && typeof v.updatedAt === 'string' && Number.isFinite(Date.parse(v.updatedAt));
}

const voteKey = (mealId: string, memberId: string) => JSON.stringify([mealId, memberId]);

/**
 * What a backup has to hold to be restored: every vote whole, one per person
 * and recipe. Reading the stored file is more forgiving (see
 * `normalizeFamilyMealRatings`).
 */
export function validateFamilyMealRatings(value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return 'Family meal ratings must be a list.';
  const keys = new Set<string>();
  for (const vote of value) {
    if (!isVote(vote)) return 'Each family meal rating needs a meal, a person, 1 to 5 stars and an edit date.';
    const key = voteKey(vote.mealId, vote.memberId);
    if (keys.has(key)) return 'A person can have only one rating for a recipe.';
    keys.add(key);
  }
  return null;
}

/**
 * The stored votes as every reader takes them: a row that is not a vote is
 * left out, and a person's second vote for one recipe gives way to the newer
 * one. Like the rest of meals.json, a bad row never makes the file
 * unreadable. Hands back the list it was given when nothing had to change.
 */
export function normalizeFamilyMealRatings(value: unknown): FamilyMealRating[] {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, FamilyMealRating>();
  for (const vote of value) {
    if (!isVote(vote)) continue;
    const key = voteKey(vote.mealId, vote.memberId);
    const kept = byKey.get(key);
    if (!kept || Date.parse(vote.updatedAt) > Date.parse(kept.updatedAt)) byKey.set(key, vote);
  }
  const kept = new Set(byKey.values());
  return kept.size === value.length ? (value as FamilyMealRating[]) : value.filter((vote) => kept.has(vote));
}

/**
 * The votes left once a family recipe is deleted: its votes go with it. A
 * Mealie recipe is never in the saved meals, so its votes stay. Hands back
 * the list it was given when nothing had to go.
 */
export function pruneFamilyMealRatings(votes: FamilyMealRating[], savedMeals: readonly Pick<SavedMeal, 'id'>[]): FamilyMealRating[] {
  const saved = new Set(savedMeals.map((m) => m.id));
  const kept = votes.filter((v) => claimsMealieId(v.mealId) || saved.has(v.mealId));
  return kept.length === votes.length ? votes : kept;
}

export function setFamilyMealRating(votes: FamilyMealRating[], mealId: string, memberId: string, rating: number | null, updatedAt: string): FamilyMealRating[] {
  const previous = votes.find((v) => v.mealId === mealId && v.memberId === memberId);
  if (previous?.rating === rating || (!previous && rating === null)) return votes;
  const rest = votes.filter((v) => v.mealId !== mealId || v.memberId !== memberId);
  return rating === null ? rest : [...rest, { mealId, memberId, rating, updatedAt }];
}

/** A vote made on this page and not yet in what the page loaded; `rating: null` takes the vote away. */
export interface MealVoteChange {
  mealId: string;
  memberId: string;
  rating: number | null;
  updatedAt: string;
}

/** The loaded votes with this page's own changes on top. Hands back `loaded` when there are none. */
export function applyMealVoteChanges(loaded: readonly FamilyMealRating[], changes: Iterable<MealVoteChange>): readonly FamilyMealRating[] {
  let votes = loaded as FamilyMealRating[];
  for (const change of changes) votes = setFamilyMealRating(votes, change.mealId, change.memberId, change.rating, change.updatedAt);
  return votes;
}

/** Whether the loaded votes already say what a change made here says. */
export function mealVoteChangeLanded(loaded: readonly FamilyMealRating[], change: MealVoteChange): boolean {
  const stored = loaded.find((v) => v.mealId === change.mealId && v.memberId === change.memberId);
  return (stored?.rating ?? null) === change.rating;
}

/**
 * The family's average for one recipe. Votes only ever name people in the
 * family: removing a person takes their votes along (see
 * `member-references/meal-ratings.ts`).
 */
export function familyMealAverage(votes: readonly FamilyMealRating[], mealId: string): { average: number | null; count: number } {
  const own = votes.filter((v) => v.mealId === mealId);
  return { average: own.length ? own.reduce((sum, v) => sum + v.rating, 0) / own.length : null, count: own.length };
}

/** "18:30" as minutes after midnight. */
function clockMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

const DINNER: MealSlotType = 'dinner';

/**
 * The day whose dinner "Rate Dinner" is about: the last dinner the family
 * sat down to. That is tonight's from the minute it is served, and last
 * night's until then, so the button means the same dinner all evening and
 * the next morning. It never follows the day a view happens to lead with: a
 * Today view that has turned to tomorrow would offer a dinner nobody has
 * eaten yet.
 */
export function dinnerRatingDate(
  todayISO: string,
  nowMinutes: number,
  plan: readonly PlannedMeal[],
  defaults: Partial<Record<MealSlotType, string>>,
): string {
  const tonight = plan.find((p) => p.date === todayISO && p.slot === DINNER);
  if (nowMinutes >= clockMinutes(mealServingTime(tonight, DINNER, defaults))) return todayISO;
  const yesterday = fromISODate(todayISO);
  yesterday.setDate(yesterday.getDate() - 1);
  return toISODate(yesterday);
}

export function dinnerRatingMeals(plan: readonly PlannedMeal[], meals: readonly SavedMeal[], date: string): SavedMeal[] {
  const ids = new Set<string>();
  for (const entry of plan) {
    if (entry.date !== date || entry.slot !== DINNER) continue;
    if (entry.mealId) ids.add(entry.mealId);
    for (const course of entry.courses ?? []) if (course.mealId) ids.add(course.mealId);
  }
  return [...ids].flatMap((id) => { const meal = meals.find((m) => m.id === id); return meal ? [meal] : []; });
}

/**
 * The dishes of a day's dinner that were typed in rather than picked from the
 * recipes ("Leftovers", "Garlic bread"), in the order the dinner lists them.
 * They have no recipe for a vote to belong to, and the board names them.
 */
export function dinnerTypedDishes(plan: readonly PlannedMeal[], date: string): string[] {
  const names: string[] = [];
  for (const entry of plan) {
    if (entry.date !== date || entry.slot !== DINNER) continue;
    for (const text of [entry.customText, ...(entry.courses ?? []).map((course) => course.customText)]) {
      const name = text?.trim();
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** What a dinner's rating board has to say when there is nothing to put stars on. */
export type DinnerRatingGap = 'noDinner' | 'typed' | 'unavailable' | null;

/**
 * Why a day's dinner has dishes without stars: nothing is planned, a dish was
 * typed in rather than picked from the recipes, or its recipe is gone.
 */
export function dinnerRatingGap(plan: readonly PlannedMeal[], meals: readonly SavedMeal[], date: string): DinnerRatingGap {
  const entries = plan.filter((p) => p.date === date && p.slot === DINNER);
  if (entries.length === 0) return 'noDinner';
  if (entries.some((p) => p.customText || p.courses?.some((c) => c.customText))) return 'typed';
  return dinnerRatingMeals(plan, meals, date).length === 0 ? 'unavailable' : null;
}
