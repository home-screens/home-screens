import type { MealSlotType, PlannedMeal, SavedMeal } from '@/types/config';
import { getNextPlannedMeal, type NextPlannedMeal } from './meal-constants';
import { isMealieMeal } from './meal-dish-rules';
import type { MealieRecipeDetail } from './mealie-map';

/**
 * A meal's recipe as the wall draws it (the Recipe view and the recipe card),
 * from a Mealie recipe or from a meal the family saved in Home Screens. Pure,
 * so the two wall surfaces read one rule.
 */

/** One ingredient line. `heading` starts a section ("For the sauce"). */
export interface RecipeLine {
  heading?: string;
  /** The line as written: Mealie's whole line, or a saved meal's ingredient name. */
  text: string;
  /** A saved meal's amount, drawn after the name; Mealie's lines carry theirs in `text`. */
  amount?: string;
}

/** One numbered step. */
export interface RecipeStep {
  /** A section heading above the step (Mealie's step title). */
  heading?: string;
  /** The step's own first line when it reads as a label ("Make the sauce:"), drawn bold. */
  lead?: string;
  text: string;
}

export interface RecipeDetail {
  ingredients: RecipeLine[];
  steps: RecipeStep[];
  /** A saved meal's notes, one paragraph each; Mealie recipes have steps instead. */
  notes: string[];
}

/**
 * Whether a meal has a recipe to show: every Mealie recipe, and a saved meal
 * with an ingredient or a note. A meal typed straight into the plan ("Eating
 * out") has none.
 */
export function mealHasRecipe(meal: SavedMeal | null | undefined): meal is SavedMeal {
  if (!meal) return false;
  if (isMealieMeal(meal)) return true;
  const hasIngredient = (meal.ingredients ?? []).some((i) => typeof i.name === 'string' && i.name.trim() !== '');
  return hasIngredient || !!meal.notes?.trim();
}

/** The longest first line that still reads as a label rather than as the step itself. */
const LEAD_MAX_LENGTH = 60;

/**
 * A step whose first line ends in a colon ("Make the sauce:") leads with that
 * line in bold, the way Mealie's own page reads. Anything else is the step.
 */
export function splitStepLead(text: string): { lead?: string; text: string } {
  const trimmed = text.trim();
  const br = trimmed.indexOf('\n');
  if (br < 0) return { text: trimmed };
  const first = trimmed.slice(0, br).trim();
  const rest = trimmed.slice(br + 1).trim();
  if (!rest || !first.endsWith(':') || first.length > LEAD_MAX_LENGTH) return { text: trimmed };
  return { lead: first, text: rest };
}

function paragraphs(text: string | undefined): string[] {
  return (text ?? '').split('\n').map((p) => p.trim()).filter(Boolean);
}

/** A saved meal's recipe: its ingredients with their amounts, and its notes. */
export function savedMealRecipe(meal: SavedMeal): RecipeDetail {
  const ingredients: RecipeLine[] = [];
  for (const ing of meal.ingredients ?? []) {
    const text = typeof ing.name === 'string' ? ing.name.trim() : '';
    if (!text) continue;
    const amount = ing.amount?.trim();
    ingredients.push({ text, ...(amount ? { amount } : {}) });
  }
  return { ingredients, steps: [], notes: paragraphs(meal.notes) };
}

/** A Mealie recipe's lines, as the hub's recipe route answers them, the way the wall draws them. */
export function mealieRecipe(lines: Pick<MealieRecipeDetail, 'ingredients' | 'steps'>): RecipeDetail {
  return {
    ingredients: lines.ingredients.map((l) => ({ ...(l.heading ? { heading: l.heading } : {}), text: l.text })),
    steps: lines.steps.map((s) => ({ ...(s.heading ? { heading: s.heading } : {}), ...splitStepLead(s.text) })),
    notes: [],
  };
}

/** Prep, cook, serves and the batch, the ones the meal has, in that order. */
export type RecipeStat =
  | { kind: 'prep' | 'cook'; minutes: number }
  | { kind: 'serves'; count: number }
  | { kind: 'batch'; scale: number };

/**
 * The figures above a recipe for `scale` batches (Mealie's double batch is
 * 2): it serves that many times as many, and says which batch it is. The
 * times stay: a double batch of chili still simmers an hour.
 */
export function recipeStats(meal: SavedMeal, scale = 1): RecipeStat[] {
  const stats: RecipeStat[] = [];
  if (meal.prepTime && meal.prepTime > 0) stats.push({ kind: 'prep', minutes: meal.prepTime });
  if (meal.cookTime && meal.cookTime > 0) stats.push({ kind: 'cook', minutes: meal.cookTime });
  if (meal.servings && meal.servings > 0) stats.push({ kind: 'serves', count: Math.round(meal.servings * scale * 10) / 10 });
  if (scale !== 1) stats.push({ kind: 'batch', scale });
  return stats;
}

/** How a batch is said: "Double", "Triple", "Half", or "×1.5" for any other. */
export function batchWord(scale: number): { key: 'batchDouble' | 'batchTriple' | 'batchHalf' } | { key: 'batchTimes'; scale: string } {
  if (scale === 2) return { key: 'batchDouble' };
  if (scale === 3) return { key: 'batchTriple' };
  if (scale === 0.5) return { key: 'batchHalf' };
  return { key: 'batchTimes', scale: String(Math.round(scale * 100) / 100) };
}

/** What the Recipe view shows: a meal, or that there is no recipe for the day it is on. */
export type RecipeLead =
  | { kind: 'meal'; next: NextPlannedMeal & { meal: SavedMeal } }
  | { kind: 'none'; day: 'today' | 'tomorrow' };

/**
 * The meal the Recipe view shows: the next one with a recipe, the same "next"
 * the Next Meal view walks (`getNextPlannedMeal`), passing over typed meals.
 * It stays on today while today has a meal still to come, and moves to
 * tomorrow once today is over, the way the Today view does; a recipe further
 * out than that is not shown, so the wall never cooks Thursday's dinner on a
 * Monday. Nothing planned at all reads as today.
 */
export function nextRecipeMeal(
  todayISO: string,
  nowMinutes: number,
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
  slots: readonly MealSlotType[],
  defaults: Partial<Record<MealSlotType, string>>,
): RecipeLead {
  const anyNext = getNextPlannedMeal(todayISO, nowMinutes, plan, savedMeals, slots, defaults);
  const lastDay = !anyNext || anyNext.dayOffset === 0 ? 0 : 1;
  const next = getNextPlannedMeal(todayISO, nowMinutes, plan, savedMeals, slots, defaults, mealHasRecipe);
  if (next && next.meal && next.dayOffset <= lastDay) return { kind: 'meal', next: { ...next, meal: next.meal } };
  return { kind: 'none', day: lastDay === 0 ? 'today' : 'tomorrow' };
}

/**
 * Rows of measured `heights` cut into pages of whole rows: the first page has
 * `first` pixels (a recipe's header and ingredients take the rest of its
 * page), every later page `rest`. A row taller than a page gets a page of its
 * own. The first page may hold no row at all when `first` is too small for
 * one. One empty page for no rows. A recipe's steps page this way, and so do
 * the wall's grocery columns.
 */
export function pageByHeight(heights: readonly number[], first: number, rest: number, gap: number): number[][] {
  if (heights.length === 0) return [[]];
  const pages: number[][] = [[]];
  let room = first;
  for (let i = 0; i < heights.length; i++) {
    const page = pages[pages.length - 1];
    const need = heights[i] + (page.length > 0 ? gap : 0);
    if (need <= room || (page.length === 0 && pages.length > 1)) {
      page.push(i);
      room -= need;
      continue;
    }
    pages.push([i]);
    room = rest - heights[i];
  }
  return pages;
}

/** The page a step is on. */
export function recipePageOfStep(pages: readonly number[][], step: number): number {
  const found = pages.findIndex((p) => p.includes(step));
  return found < 0 ? 0 : found;
}
