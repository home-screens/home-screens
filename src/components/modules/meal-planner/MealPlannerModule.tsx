'use client';

import { useMemo } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, ModuleStyle, TimeFormat } from '@/types/config';
import { useTZClock } from '@/hooks/useTZClock';
import { useFetchData } from '@/hooks/useFetchData';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { getWeekRange, filterPlanToWeek, toISODate, DEFAULT_MEAL_SETTINGS, resolveMealTimeFormat } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import ModuleWrapper from '../ModuleWrapper';
import FamilyEmptyState from '../FamilyEmptyState';
import { resolveRecipeTapMode } from '../shared/MealTapTarget';
import { WeekView } from './WeekView';
import { TodayView } from './TodayView';
import { NextMealView } from './NextMealView';
import { CompactView } from './CompactView';
import { ListView } from './ListView';

interface MealDataResponse {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  settings?: MealSettings;
  /** Household GlobalSettings.timeFormat, reported alongside the settings */
  globalTimeFormat?: TimeFormat;
}

interface MealPlannerModuleProps {
  config: MealPlannerConfig;
  style: ModuleStyle;
  timezone?: string;
  screenId?: string;
  moduleId?: string;
}

export default function MealPlannerModule({ config, style, timezone, screenId, moduleId }: MealPlannerModuleProps) {
  const t = useTranslate('modules');
  const now = useTZClock(timezone, 60_000);
  const view = config.view ?? 'week';
  const recipeTapMode = resolveRecipeTapMode(config.tapRecipeAction, screenId, moduleId);
  const todayISO = toISODate(now);
  const currentHour = now.getHours();

  const [mealData] = useFetchData<MealDataResponse>(mealsDataUrl(), FETCH_KEY_REGISTRY['meal-planner']?.ttlMs ?? 60_000);
  const savedMeals = useMemo(() => mealData?.savedMeals ?? [], [mealData?.savedMeals]);
  const fullPlan = useMemo(() => mealData?.plan ?? [], [mealData?.plan]);
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
      {view === 'week' && <WeekView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} fontSize={style.fontSize} />}
      {view === 'today' && <TodayView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} todayISO={todayISO} currentHour={currentHour} recipeTapMode={recipeTapMode} />}
      {view === 'next-meal' && <NextMealView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} currentHour={currentHour} recipeTapMode={recipeTapMode} />}
      {view === 'compact' && <CompactView config={config} settings={settings} timeFormat={timeFormat} plan={fullPlan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} />}
      {view === 'list' && <ListView config={config} settings={settings} timeFormat={timeFormat} plan={plan} savedMeals={savedMeals} todayISO={todayISO} recipeTapMode={recipeTapMode} />}
    </ModuleWrapper>
  );
}
