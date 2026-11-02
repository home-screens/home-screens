'use client';

import type { MealPlannerConfig, ModuleStyle } from '@/types/config';
import { planHasDrawnMeal, weekPlannedSlots } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import ModuleWrapper from '../ModuleWrapper';
import FamilyEmptyState from '../FamilyEmptyState';
import { ModuleLoadingState } from '../ModuleStates';
import { WeekView } from './WeekView';
import { TodayView } from './TodayView';
import { NextMealView } from './NextMealView';
import { CompactView } from './CompactView';
import { ListView } from './ListView';
import { GroceryView } from './GroceryView';
import { RecipesView } from './RecipesView';
import { mealieWords } from '../shared/mealie-problem';
import { MealRecipeContext } from '../shared/MealRecipeContext';
import { useWallMeals } from '../shared/useWallMeals';
import { useWallRecipeBook } from '../shared/recipe-book/useWallRecipeBook';
import { recipeBookSource } from '@/lib/meal-recipe-book';

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
  const view = config.view ?? 'week';
  const {
    data, error, todayISO, nowMinutes, settings, timeFormat, savedMeals, fullPlan, weekDates, plan,
    mealie, grocery, interactive, recipeTapMode, recipeContext,
  } = useWallMeals({ moduleType: 'meal-planner', view, timezone, theme: fullscreenTheme, config, screenId, moduleId });
  const book = useWallRecipeBook({
    source: recipeBookSource(data?.mealieConnected ?? false),
    savedMeals,
    enabled: view === 'recipes' && data !== null,
  });

  // A plan counts by what it draws (`weekPlannedSlots`), as the full-screen
  // Week counts it: an entry for a meal that is switched off (Mealie plans
  // lunch whether or not the wall shows it) is not a meal. Next meal and
  // Compact look past this week, so they ask the whole plan.
  const hasMeals = view === 'next-meal' || view === 'compact'
    ? planHasDrawnMeal(fullPlan, settings.enabledSlots, savedMeals)
    : weekPlannedSlots(weekDates, settings.enabledSlots, plan, savedMeals).filled > 0;

  // Until the first answer the plan is unknown, not empty: "No meals planned
  // yet" flashed on every load of a slow Pi.
  if (data === null) {
    return <ModuleLoadingState style={style} message={t('meal-planner.loading')} error={error} />;
  }

  // The grocery list is not the plan: it has its own empty and out-of-reach states.
  if (view === 'grocery') {
    return (
      <ModuleWrapper style={style}>
        {/* Keyed: a touch wall scrolls the list and one without pages it, each measured from its own mount. */}
        <GroceryView key={String(interactive)} config={config} grocery={grocery} tappable={interactive} />
      </ModuleWrapper>
    );
  }

  // The recipe book is not the plan either: it answers for itself.
  if (view === 'recipes') {
    return (
      <ModuleWrapper style={style}>
        <MealRecipeContext.Provider value={recipeContext}>
          <RecipesView config={config} book={book} fontSize={style.fontSize} interactive={interactive} />
        </MealRecipeContext.Provider>
      </ModuleWrapper>
    );
  }

  // Mealie never answered and there is no copy: say so rather than "nothing
  // planned", which would be wrong, since the plan is in Mealie.
  if (mealie.state === 'unreachable') {
    return (
      <ModuleWrapper style={style}>
        <FamilyEmptyState
          icon={<>&#127869;</>}
          title={t(`meal-planner.${mealieWords(mealie.problem)}`)}
          hint={t(`meal-planner.${mealieWords(mealie.problem)}Hint`)}
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
      {view === 'week' && <WeekView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} fontSize={style.fontSize} interactive={interactive} />}
      {/* The whole plan: late in the evening Today shows tomorrow, which can be in next week. */}
      {view === 'today' && <TodayView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} nowMinutes={nowMinutes} recipeTapMode={recipeTapMode} />}
      {view === 'next-meal' && <NextMealView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} nowMinutes={nowMinutes} recipeTapMode={recipeTapMode} />}
      {view === 'compact' && <CompactView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} />}
      {view === 'list' && <ListView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} interactive={interactive} fontSize={style.fontSize} />}
      </MealRecipeContext.Provider>
    </ModuleWrapper>
  );
}
