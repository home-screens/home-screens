import type { FullscreenMealPlannerView, MealPlannerView } from '@/types/config';

/**
 * Which of a meal planner's display switches each view reads. The editor's
 * two meal planner panels offer only the switches the chosen view draws; a
 * switch that is hidden keeps its saved value, so changing the view back
 * brings the choice back with it.
 */
export interface MealViewOptions {
  /** Show pictures (`showEmoji`). */
  pictures: boolean;
  /** Show cooking time (`showPrepTime`). */
  cookingTime: boolean;
  /** Show tags (`showTags`). */
  tags: boolean;
  /** Show family ratings (`showFamilyRatings`). */
  ratings: boolean;
  /** Show difficulty (`showDifficulty`), a full-screen switch only. */
  difficulty: boolean;
  /** The view's own title (`showTitle`). */
  title: boolean;
  /** What a tap on a planned meal opens (`tapRecipeAction`). */
  tapAction: boolean;
}

const NONE: MealViewOptions = { pictures: false, cookingTime: false, tags: false, ratings: false, difficulty: false, title: false, tapAction: false };
const only = (...keys: (keyof MealViewOptions)[]): MealViewOptions => ({ ...NONE, ...Object.fromEntries(keys.map((k) => [k, true])) });

const SMALL: Record<MealPlannerView, MealViewOptions> = {
  // The week grid and Compact have no room for minutes or tags.
  week: only('pictures', 'ratings', 'tapAction'),
  today: only('pictures', 'cookingTime', 'tags', 'ratings', 'title', 'tapAction'),
  'next-meal': only('pictures', 'cookingTime', 'tags', 'ratings', 'tapAction'),
  compact: only('pictures', 'ratings', 'tapAction'),
  list: only('pictures', 'cookingTime', 'tags', 'ratings', 'tapAction'),
  // A list of things to buy: no dishes are drawn.
  grocery: only('title'),
  // A row always says how long the recipe takes, and a tap always opens its card.
  recipes: only('pictures', 'ratings'),
};

const FULLSCREEN: Record<FullscreenMealPlannerView, MealViewOptions> = {
  week: only('pictures', 'cookingTime', 'ratings', 'title', 'tapAction'),
  today: only('pictures', 'cookingTime', 'tags', 'ratings', 'difficulty', 'title', 'tapAction'),
  'menu-board': only('pictures', 'cookingTime', 'ratings', 'difficulty', 'title', 'tapAction'),
  'next-meal': only('pictures', 'cookingTime', 'tags', 'ratings', 'difficulty', 'tapAction'),
  // The recipe itself: its times are part of it, and its courses open on the card.
  recipe: only('pictures', 'ratings'),
  grocery: only('title'),
  // A tile always shows its picture and its minutes.
  recipes: only('ratings', 'title'),
};

export function mealViewOptions(moduleType: 'meal-planner', view: MealPlannerView): MealViewOptions;
export function mealViewOptions(moduleType: 'fullscreen-meal-planner', view: FullscreenMealPlannerView): MealViewOptions;
export function mealViewOptions(moduleType: 'meal-planner' | 'fullscreen-meal-planner', view: MealPlannerView | FullscreenMealPlannerView): MealViewOptions {
  const table: Partial<Record<string, MealViewOptions>> = moduleType === 'meal-planner' ? SMALL : FULLSCREEN;
  return table[view] ?? NONE;
}

/** The small module's views with no title of their own, for the editor's title picker. */
export const MEAL_PLANNER_VIEWS_WITHOUT_TITLE: MealPlannerView[] = (Object.keys(SMALL) as MealPlannerView[]).filter((view) => !SMALL[view].title);
