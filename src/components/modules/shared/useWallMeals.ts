'use client';

import { useMemo } from 'react';
import type { MealPlannerView, FullscreenMealPlannerView, MealSettings, PlannedMeal, RecipeTapAction, SavedMeal, TimeFormat } from '@/types/config';
import type { FetchError } from '@/lib/fetch-error';
import { useTZClock } from '@/hooks/useTZClock';
import { useFetchData } from '@/hooks/useFetchData';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { readMealAnswer, type MealAnswer } from '@/lib/meal-client';
import { mealieStatus, type MealieStatus } from '@/lib/meal-sources';
import { DEFAULT_MEAL_SETTINGS, filterPlanToWeek, getWeekDatesForRange, minutesOfDay, resolveMealTimeFormat, toISODate } from '@/lib/meal-constants';
import { resolveRecipeTapMode, type RecipeTapMode } from './MealTapTarget';
import type { MealRecipeContextValue } from './MealRecipeContext';
import { useWallGrocery, type WallGrocery } from './useWallGrocery';

const NO_MEALS: SavedMeal[] = [];
const NO_PLAN: PlannedMeal[] = [];

export interface WallMealsOptions {
  /** Which module is reading, for its poll interval. */
  moduleType: 'meal-planner' | 'fullscreen-meal-planner';
  view: MealPlannerView | FullscreenMealPlannerView;
  timezone: string | undefined;
  /** The full-screen theme a recipe card is drawn in. */
  theme: string | undefined;
  config: { tapRecipeAction?: RecipeTapAction; interactive?: boolean };
  screenId: string | undefined;
  moduleId: string | undefined;
}

export interface WallMeals {
  /** The hub's answer, read as the phone and the editor read it; null until the first one. */
  data: MealAnswer | null;
  error: FetchError | null;
  /** The household's clock, ticking once a minute. */
  now: Date;
  todayISO: string;
  nowMinutes: number;
  settings: MealSettings;
  /** Effective serving-time format: an explicit meal override, else the household's. */
  timeFormat: TimeFormat;
  savedMeals: SavedMeal[];
  /** The whole plan, for the views that reach past this week (tomorrow, the next meal). */
  fullPlan: PlannedMeal[];
  /** This week's days, in the household's week. */
  weekDates: string[];
  /** This week's plan. */
  plan: PlannedMeal[];
  /** Where the plan came from, and why there is none when Mealie never answered. */
  mealie: MealieStatus;
  /** The grocery list, read only while the module shows it. */
  grocery: WallGrocery;
  /** A real display with taps switched on; the editor preview draws the rows only. */
  interactive: boolean;
  recipeTapMode: RecipeTapMode;
  /** What a recipe card opened from any of the module's views needs. */
  recipeContext: MealRecipeContextValue;
}

export interface MealWeek {
  /** The week's seven days, in the household's week. */
  weekDates: string[];
  /** The plan for those days. */
  plan: PlannedMeal[];
}

/**
 * The week holding `dayISO` and its plan. `useWallMeals` reads this week's
 * through it; a Week or List view stepped to another week with the
 * look-ahead arrows reads that week's the same way, from the whole plan the
 * hub already sent.
 */
export function useMealWeek(fullPlan: PlannedMeal[], dayISO: string, weekStartDay: MealSettings['weekStartDay']): MealWeek {
  const weekDates = useMemo(() => getWeekDatesForRange(dayISO, weekStartDay), [dayISO, weekStartDay]);
  const plan = useMemo(() => filterPlanToWeek(fullPlan, weekDates[0], weekDates[6]), [fullPlan, weekDates]);
  return useMemo(() => ({ weekDates, plan }), [weekDates, plan]);
}

/**
 * The meals a wall module draws, read and resolved once for both Meal
 * Planner modules: the answer read through `readMealAnswer`, this week's
 * plan, whether Mealie answered (`mealieStatus`), the grocery list, and what
 * a tap opens. Each module keeps its own layout and empty states.
 */
export function useWallMeals({ moduleType, view, timezone, theme, config, screenId, moduleId }: WallMealsOptions): WallMeals {
  const now = useTZClock(timezone, 60_000);
  const todayISO = toISODate(now);
  const nowMinutes = minutesOfDay(now);

  const [raw, error] = useFetchData<unknown>(mealsDataUrl(), FETCH_KEY_REGISTRY[moduleType]?.ttlMs ?? 60_000);
  // The plan lives in meals.json or in Mealie; the shared rule decides which
  // one this wall draws, the same way the phone and the editor do.
  const data = useMemo(() => (raw ? readMealAnswer(raw, '12h') : null), [raw]);
  const savedMeals = data?.savedMeals ?? NO_MEALS;
  const fullPlan = data?.plan ?? NO_PLAN;
  // Settings live in the shared meals.json, edited via /remote.
  const settings = data?.settings ?? DEFAULT_MEAL_SETTINGS;
  const timeFormat = resolveMealTimeFormat(settings, data?.globalTimeFormat ?? '12h');

  const { weekDates, plan } = useMealWeek(fullPlan, todayISO, settings.weekStartDay);
  const mealie = useMemo<MealieStatus>(() => (data ? mealieStatus(data) : { state: 'local' }), [data]);

  // The grocery list the family uses: Mealie's while the plan lives there,
  // otherwise this week's from the planned meals. Read only by that view.
  const grocerySource = view !== 'grocery' || !data ? 'off' : data.source === 'mealie' ? 'mealie' : 'local';
  const localGrocery = useMemo(
    () => (data ? { plan: data.plan, savedMeals: data.savedMeals, groceryChecked: data.groceryChecked, settings: data.settings } : null),
    [data],
  );
  const grocery = useWallGrocery(grocerySource, localGrocery, todayISO);

  const recipeContext = useMemo<MealRecipeContextValue>(
    () => ({ theme, plan: fullPlan, savedMeals, settings, timeFormat, now }),
    [theme, fullPlan, savedMeals, settings, timeFormat, now],
  );

  return {
    data,
    error,
    now,
    todayISO,
    nowMinutes,
    settings,
    timeFormat,
    savedMeals,
    fullPlan,
    weekDates,
    plan,
    mealie,
    grocery,
    interactive: config.interactive !== false && !!screenId && !!moduleId,
    // Opening a recipe is a tap on the wall, so it follows "Tap on the Wall":
    // with that off the rows are not tappable and show no "›".
    recipeTapMode: config.interactive === false ? 'off' : resolveRecipeTapMode(config.tapRecipeAction, screenId, moduleId),
    recipeContext,
  };
}
