'use client';

import { useMemo } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, ModuleStyle, TimeFormat } from '@/types/config';
import { useTZClock } from '@/hooks/useTZClock';
import { useFetchData } from '@/hooks/useFetchData';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { mergeMealSources, type MealieWireBlock } from '@/lib/meal-sources';
import { getWeekRange, filterPlanToWeek, toISODate, DEFAULT_MEAL_SETTINGS, resolveMealTimeFormat, minutesOfDay } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import ModuleWrapper from '../ModuleWrapper';
import FamilyEmptyState from '../FamilyEmptyState';
import { ModuleLoadingState } from '../ModuleStates';
import { resolveRecipeTapMode } from '../shared/MealTapTarget';
import { WeekView } from './WeekView';
import { TodayView } from './TodayView';
import { NextMealView } from './NextMealView';
import { CompactView } from './CompactView';
import { ListView } from './ListView';
import { GroceryView } from './GroceryView';
import { mealieWords } from '../shared/mealie-problem';
import { MealRecipeContext, type MealRecipeContextValue } from '../shared/MealRecipeContext';
import { useWallGrocery } from '../shared/useWallGrocery';
import type { GroceryChecked } from '@/lib/grocery-checks';

interface MealDataResponse {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked?: GroceryChecked;
  settings?: MealSettings;
  /** Household GlobalSettings.timeFormat, reported alongside the settings */
  globalTimeFormat?: TimeFormat;
  /** Mealie's plan, while the plan lives there (see `meal-sources.ts`). */
  mealie?: MealieWireBlock;
}

interface MealPlannerModuleProps {
  config: MealPlannerConfig;
  style: ModuleStyle;
  timezone?: string;
  /** The display's full-screen theme, which a recipe card is drawn in. */
  fullscreenTheme?: string;
  screenId?: string;
  moduleId?: string;
}

export default function MealPlannerModule({ config, style, timezone, fullscreenTheme, screenId, moduleId }: MealPlannerModuleProps) {
  const t = useTranslate('modules');
  const now = useTZClock(timezone, 60_000);
  const view = config.view ?? 'week';
  const recipeTapMode = resolveRecipeTapMode(config.tapRecipeAction, screenId, moduleId);
  const todayISO = toISODate(now);
  const nowMinutes = minutesOfDay(now);

  const [mealData, mealError] = useFetchData<MealDataResponse>(mealsDataUrl(), FETCH_KEY_REGISTRY['meal-planner']?.ttlMs ?? 60_000);
  // The plan lives in meals.json or in Mealie; the shared rule decides which
  // one this wall draws, the same way the phone and the editor do.
  const merged = useMemo(
    () => (mealData ? mergeMealSources(mealData, mealData.settings ?? DEFAULT_MEAL_SETTINGS) : null),
    [mealData],
  );
  const savedMeals = useMemo(() => merged?.savedMeals ?? [], [merged]);
  const fullPlan = useMemo(() => merged?.plan ?? [], [merged]);
  // Settings live in the shared meals.json, edited via /remote.
  const settings = mealData?.settings ?? DEFAULT_MEAL_SETTINGS;
  // Effective serving-time format: an explicit meal override wins, else the
  // household global. Resolved once here so every view renders consistently.
  const globalTimeFormat = mealData?.globalTimeFormat === '24h' ? '24h' : '12h';
  const timeFormat = resolveMealTimeFormat(settings, globalTimeFormat);

  const { start: weekStart, end: weekEnd } = useMemo(
    () => getWeekRange(new Date(todayISO + 'T12:00:00'), settings.weekStartDay),
    [todayISO, settings.weekStartDay],
  );
  const plan = useMemo(
    () => filterPlanToWeek(fullPlan, weekStart, weekEnd),
    [fullPlan, weekStart, weekEnd],
  );

  const hasMeals = view === 'next-meal' || view === 'compact'
    ? fullPlan.length > 0
    : plan.length > 0;

  const recipeContext = useMemo<MealRecipeContextValue>(
    () => ({ theme: fullscreenTheme, plan: fullPlan, savedMeals, settings, timeFormat, now }),
    [fullscreenTheme, fullPlan, savedMeals, settings, timeFormat, now],
  );
  // The grocery list the family uses: Mealie's while the plan lives there,
  // otherwise this week's from the planned meals. Read only by that view.
  const grocerySource = view !== 'grocery' || !mealData ? 'off' : merged?.source === 'mealie' ? 'mealie' : 'local';
  const localGrocery = useMemo(
    () => (mealData ? { plan: mealData.plan, savedMeals: mealData.savedMeals, groceryChecked: mealData.groceryChecked, settings } : null),
    [mealData, settings],
  );
  const grocery = useWallGrocery(grocerySource, localGrocery, todayISO);
  // Ticks need a real display; the editor preview draws the rows only.
  const groceryTappable = config.interactive !== false && !!screenId && !!moduleId;

  // Until the first answer the plan is unknown, not empty: "No meals planned
  // yet" flashed on every load of a slow Pi.
  if (mealData === null) {
    return <ModuleLoadingState style={style} message={t('meal-planner.loading')} error={mealError} />;
  }

  // The grocery list is not the plan: it has its own empty and out-of-reach states.
  if (view === 'grocery') {
    return (
      <ModuleWrapper style={style}>
        <GroceryView config={config} grocery={grocery} tappable={groceryTappable} />
      </ModuleWrapper>
    );
  }

  // Mealie never answered and there is no copy: say so rather than "nothing
  // planned", which would be wrong, since the plan is in Mealie.
  if (merged?.source === 'mealie' && merged.mealie?.status !== 'ok' && merged.mealie?.status !== 'stale') {
    return (
      <ModuleWrapper style={style}>
        <FamilyEmptyState
          icon={<>&#127869;</>}
          title={t(`meal-planner.${mealieWords(merged?.mealie?.failure)}`)}
          hint={t(`meal-planner.${mealieWords(merged?.mealie?.failure)}Hint`)}
        />
      </ModuleWrapper>
    );
  }

  if (!hasMeals) {
    return (
      <ModuleWrapper style={style}>
        <FamilyEmptyState
          icon={<>&#127869;</>}
          title={t('meal-planner.noMealsPlannedYet')}
          hint={t('meal-planner.planFromPhoneHint')}
        />
      </ModuleWrapper>
    );
  }

  return (
    <ModuleWrapper style={style}>
      <MealRecipeContext.Provider value={recipeContext}>
      {view === 'week' && <WeekView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} fontSize={style.fontSize} />}
      {view === 'today' && <TodayView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} todayISO={todayISO} nowMinutes={nowMinutes} recipeTapMode={recipeTapMode} />}
      {view === 'next-meal' && <NextMealView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} nowMinutes={nowMinutes} recipeTapMode={recipeTapMode} />}
      {view === 'compact' && <CompactView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} />}
      {view === 'list' && <ListView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} />}
      </MealRecipeContext.Provider>
    </ModuleWrapper>
  );
}
